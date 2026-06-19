/**
 * HarnessNormalizer.test.ts
 *
 * 핵심 검증 항목:
 * 1. AI 가 [S] 필드(정적으로 채워진 것)를 덮어쓰려고 해도 무시된다 (ADR-001 머지계약).
 * 2. AI JSON 파싱 실패 시 크래시 없이 정적 스켈레톤 + warnings 로 축소 모델 반환.
 * 3. provenance 필드 정확성.
 * 4. AIService 모킹으로 순수 로직 검증.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { tmpdir } from 'os'
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { HarnessNormalizer } from './HarnessNormalizer'
import type { IAIServiceForNormalizer } from './HarnessNormalizer'
import type { HarnessModel } from '../../shared/types/harness'
import type { RawBundle } from './BundleScanner'

// ─────────────────────────────────────────────
// 픽스처 팩토리
// ─────────────────────────────────────────────

/** 테스트용 임시 번들 디렉터리 생성 */
function createTmpBundle(name: string): string {
  const bundlePath = join(tmpdir(), `harness-normalizer-test-${name}-${Date.now()}`)
  mkdirSync(bundlePath, { recursive: true })
  // README 파일 추가 (collectBundleText 에서 읽을 수 있도록)
  writeFileSync(join(bundlePath, 'README.md'), '# Test Bundle\n번들 설명')
  return bundlePath
}

/** 최소 RawBundle 픽스처 */
function makeRawBundle(overrides: Partial<RawBundle> = {}): RawBundle {
  return {
    bundlePath: '/tmp/test-bundle',
    kind: 'bundle',
    bundleHash: 'test-hash-abc123',
    fileTree: ['README.md'],
    agentStubs: [
      {
        id: 'test-bundle-developer',
        displayName: 'developer',
        model: 'sonnet',
        modelSource: 'static',
        tools: ['Read', 'Write'],
      },
    ],
    gates: [
      {
        phase: 'dev',
        ruleCodes: ['R501'],
        blocking: true,
        scriptFile: '_hooks/gate.sh',
      },
    ],
    hooks: [
      {
        file: 'subagent-stop.sh',
        event: 'SubagentStop',
        absolutePath: '/tmp/test-bundle/_hooks/subagent-stop.sh',
      },
    ],
    templates: [
      {
        stem: 'story',
        frontmatterKeys: ['title', 'status'],
        sections: ['## 설명', '## 수락 기준'],
      },
    ],
    warnings: [],
    version: '1.0.0',
    ...overrides,
  }
}

/** AI 가 반환하는 정규화 결과 픽스처 */
function makeAIResult(overrides: Partial<HarnessModel> = {}): HarnessModel {
  return {
    schemaVersion: 1,
    meta: {
      name: 'test-bundle',
      source: '/tmp/test-bundle',
      bundleHash: 'test-hash-abc123',
      kind: 'bundle',
      author: 'AI 추정 저자',
      tagline: 'AI 추정 한 줄 설명',
    },
    agents: [
      {
        id: 'test-bundle-developer',
        displayName: 'developer',
        model: 'opus',                // AI 가 [S] model 을 다른 값으로 시도
        modelSource: 'ai',            // AI 가 [S] modelSource 를 다른 값으로 시도
        tools: ['Bash'],              // AI 가 [S] tools 를 덮어쓰려고 시도
        role: 'AI 추정 역할',
        reads: ['feature/*.md'],
        writes: ['impl-log.md'],
        phaseClass: 'dev',
      },
    ],
    levels: [
      {
        id: 'L1',
        name: 'Standard Feature',
        agentChain: ['test-bundle-developer'],
        requiredArtifacts: ['story'],
      },
    ],
    triage: {
      questions: [{ id: 'Q1', text: '보안 요구사항?', meaning: '보안 복잡도' }],
      rules: [{ when: 'Q1=Yes', then: 'L2' }],
    },
    artifacts: [
      {
        id: 'story',
        consumers: ['developer'],
        persist: 'git',
        producer: 'pm',
        location: '.reined/docs/stories/',
      },
    ],
    controlFlow: {
      gates: [
        {
          phase: 'dev',
          ruleCodes: ['R999'],     // AI 가 [S] ruleCodes 를 덮어쓰려고 시도
          blocking: false,          // AI 가 [S] blocking 을 덮어쓰려고 시도
          description: 'AI 추정 게이트 설명',
        },
      ],
      hooks: [
        {
          file: 'subagent-stop.sh',
          event: 'SubagentStop',
          enforces: 'AI 추정 hook 설명',
        },
      ],
      parallelGroups: ['QA || Security 병렬'],
      loops: ['QA 3회 루프'],
    },
    warnings: [],
    provenance: {
      'meta.author': 'ai',
      'agents[0].role': 'ai',
    },
    ...overrides,
  }
}

// ─────────────────────────────────────────────
// 테스트 스위트
// ─────────────────────────────────────────────

describe('HarnessNormalizer', () => {
  let mockAI: IAIServiceForNormalizer
  let normalizer: HarnessNormalizer

  beforeEach(() => {
    mockAI = {
      normalizeHarness: vi.fn(),
    }
    normalizer = new HarnessNormalizer(mockAI)
  })

  // ── 1. [S] 필드 보호 ──────────────────────────────────────────────────────

  describe('[S] 필드 덮어쓰기 방지 (ADR-001)', () => {
    it('AI 가 agents[].model 을 다른 값으로 반환해도 정적 값이 유지된다', async () => {
      const raw = makeRawBundle()
      // 실제 파일 시스템 파일을 생성해야 collectBundleText 가 동작하므로 임시 디렉터리 사용
      const bundlePath = createTmpBundle('static-model')
      const rawWithPath = { ...raw, bundlePath, fileTree: ['README.md'] }

      vi.mocked(mockAI.normalizeHarness).mockResolvedValue(
        makeAIResult({ /* AI 가 model: 'opus' 를 반환 */ })
      )

      const result = await normalizer.normalize(rawWithPath)

      // [S] model 은 'sonnet' (static 에서 채워진 값) 이어야 한다
      expect(result.agents[0].model).toBe('sonnet')
      expect(result.agents[0].modelSource).toBe('static')
    })

    it('AI 가 agents[].tools 를 다른 배열로 반환해도 정적 값이 유지된다', async () => {
      const raw = makeRawBundle()
      const bundlePath = createTmpBundle('static-tools')
      const rawWithPath = { ...raw, bundlePath, fileTree: ['README.md'] }

      vi.mocked(mockAI.normalizeHarness).mockResolvedValue(makeAIResult())

      const result = await normalizer.normalize(rawWithPath)

      // [S] tools 는 ['Read', 'Write'] 이어야 한다 (AI 가 ['Bash'] 로 바꾸려 했지만 무시)
      expect(result.agents[0].tools).toEqual(['Read', 'Write'])
    })

    it('AI 가 gates[].ruleCodes 를 다른 값으로 반환해도 정적 값이 유지된다', async () => {
      const raw = makeRawBundle()
      const bundlePath = createTmpBundle('static-gate')
      const rawWithPath = { ...raw, bundlePath, fileTree: ['README.md'] }

      vi.mocked(mockAI.normalizeHarness).mockResolvedValue(makeAIResult())

      const result = await normalizer.normalize(rawWithPath)

      // [S] ruleCodes 는 ['R501'] 이어야 한다 (AI 가 ['R999'] 로 바꾸려 했지만 무시)
      expect(result.controlFlow.gates[0].ruleCodes).toEqual(['R501'])
    })

    it('AI 가 gates[].blocking 을 false 로 반환해도 정적 값(true) 이 유지된다', async () => {
      const raw = makeRawBundle()
      const bundlePath = createTmpBundle('static-blocking')
      const rawWithPath = { ...raw, bundlePath, fileTree: ['README.md'] }

      vi.mocked(mockAI.normalizeHarness).mockResolvedValue(makeAIResult())

      const result = await normalizer.normalize(rawWithPath)

      // [S] blocking 은 true 이어야 한다
      expect(result.controlFlow.gates[0].blocking).toBe(true)
    })

    it('AI 가 meta.name 을 다른 값으로 반환해도 정적 값(번들 디렉터리명) 이 유지된다', async () => {
      const raw = makeRawBundle()
      const bundlePath = createTmpBundle('static-meta-name')
      const rawWithPath = { ...raw, bundlePath, fileTree: ['README.md'] }

      const aiResult = makeAIResult()
      // AI 가 meta.name 을 'ai-bundle-name' 으로 바꾸려 시도
      aiResult.meta.name = 'ai-bundle-name'
      vi.mocked(mockAI.normalizeHarness).mockResolvedValue(aiResult)

      const result = await normalizer.normalize(rawWithPath)

      // meta.name 은 번들 디렉터리명 (path.basename(bundlePath)) 이어야 한다
      expect(result.meta.name).toBe(require('path').basename(bundlePath))
    })

    it('AI 가 bundleHash 를 다른 값으로 반환해도 정적 값이 유지된다', async () => {
      const raw = makeRawBundle()
      const bundlePath = createTmpBundle('static-hash')
      const rawWithPath = { ...raw, bundlePath, fileTree: ['README.md'] }

      const aiResult = makeAIResult()
      aiResult.meta.bundleHash = 'ai-overridden-hash'
      vi.mocked(mockAI.normalizeHarness).mockResolvedValue(aiResult)

      const result = await normalizer.normalize(rawWithPath)

      expect(result.meta.bundleHash).toBe('test-hash-abc123')
    })
  })

  // ── 2. AI 정규화 실패 → 축소 모델 + warnings ─────────────────────────────

  describe('AI 파싱 실패 → 축소 모델 + warnings (크래시 금지)', () => {
    it('AIService 가 예외를 throw 해도 크래시 없이 정적 스켈레톤 + warnings 를 반환한다', async () => {
      const raw = makeRawBundle({ warnings: ['기존 경고'] })
      const bundlePath = createTmpBundle('ai-throw')
      const rawWithPath = { ...raw, bundlePath, fileTree: ['README.md'] }

      vi.mocked(mockAI.normalizeHarness).mockRejectedValue(new Error('AI 서비스 오류'))

      const result = await normalizer.normalize(rawWithPath)

      // 크래시 없이 반환됨
      expect(result).toBeDefined()
      // 정적 스켈레톤의 에이전트 스텁이 포함됨
      expect(result.agents.length).toBe(1)
      expect(result.agents[0].id).toBe('test-bundle-developer')
      // warnings 에 오류 정보가 포함됨
      expect(result.warnings.some((w) => w.includes('AI 정규화 호출 실패'))).toBe(true)
    })

    it('AIService 가 빈 응답(normalizeHarness 에서 JSON 파싱 실패 fallback 반환) 시 warnings 가 포함된다', async () => {
      const raw = makeRawBundle()
      const bundlePath = createTmpBundle('ai-fallback')
      const rawWithPath = { ...raw, bundlePath, fileTree: ['README.md'] }

      // AIService 가 JSON 파싱 실패 fallback 모델을 반환하는 경우를 시뮬레이션
      const fallbackModel: HarnessModel = {
        schemaVersion: 1,
        meta: {
          name: 'test-bundle',
          source: bundlePath,
          bundleHash: 'test-hash-abc123',
          kind: 'bundle',
        },
        agents: [],
        levels: [],
        triage: { questions: [], rules: [] },
        artifacts: [],
        controlFlow: { gates: [], hooks: [], parallelGroups: [], loops: [] },
        warnings: ['AI 정규화 JSON 파싱 실패 — 원본 응답 앞 400자: ...'],
        provenance: {},
      }
      vi.mocked(mockAI.normalizeHarness).mockResolvedValue(fallbackModel)

      const result = await normalizer.normalize(rawWithPath)

      // warnings 가 포함됨
      expect(result.warnings.length).toBeGreaterThan(0)
    })

    it('RawBundle 의 fileTree 가 비어도 크래시 없이 반환된다', async () => {
      const raw = makeRawBundle({ fileTree: [] })
      const bundlePath = createTmpBundle('empty-filetree')
      const rawWithPath = { ...raw, bundlePath, fileTree: [] }

      vi.mocked(mockAI.normalizeHarness).mockResolvedValue(makeAIResult())

      const result = await normalizer.normalize(rawWithPath)

      expect(result).toBeDefined()
    })
  })

  // ── 3. provenance 정확성 ───────────────────────────────────────────────────

  describe('provenance 정확성', () => {
    it('[S] 필드는 provenance 가 "static" 이다', async () => {
      const raw = makeRawBundle()
      const bundlePath = createTmpBundle('provenance-static')
      const rawWithPath = { ...raw, bundlePath, fileTree: ['README.md'] }

      vi.mocked(mockAI.normalizeHarness).mockResolvedValue(makeAIResult())

      const result = await normalizer.normalize(rawWithPath)

      expect(result.provenance['meta.name']).toBe('static')
      expect(result.provenance['meta.source']).toBe('static')
      expect(result.provenance['meta.bundleHash']).toBe('static')
      expect(result.provenance['meta.kind']).toBe('static')
      expect(result.provenance['agents[0].id']).toBe('static')
      expect(result.provenance['agents[0].tools']).toBe('static')
    })

    it('[AI] 필드는 AI 가 채우면 provenance 가 "ai" 이다', async () => {
      const raw = makeRawBundle()
      const bundlePath = createTmpBundle('provenance-ai')
      const rawWithPath = { ...raw, bundlePath, fileTree: ['README.md'] }

      vi.mocked(mockAI.normalizeHarness).mockResolvedValue(makeAIResult())

      const result = await normalizer.normalize(rawWithPath)

      // AI 가 채운 필드
      expect(result.provenance['meta.author']).toBe('ai')
      expect(result.provenance['meta.tagline']).toBe('ai')
      expect(result.provenance['agents[0].role']).toBe('ai')
      expect(result.provenance['agents[0].reads']).toBe('ai')
      expect(result.provenance['agents[0].writes']).toBe('ai')
    })

    it('AI 가 채우지 않은 [AI] 필드는 provenance 가 "absent" 이다', async () => {
      const raw = makeRawBundle()
      const bundlePath = createTmpBundle('provenance-absent')
      const rawWithPath = { ...raw, bundlePath, fileTree: ['README.md'] }

      // AI 가 author/tagline 을 반환하지 않는 경우
      const aiResult = makeAIResult()
      delete aiResult.meta.author
      delete aiResult.meta.tagline
      vi.mocked(mockAI.normalizeHarness).mockResolvedValue(aiResult)

      const result = await normalizer.normalize(rawWithPath)

      expect(result.provenance['meta.author']).toBe('absent')
      expect(result.provenance['meta.tagline']).toBe('absent')
    })

    it('artifacts [S] 필드(id, template) 는 provenance 가 "static" 이다', async () => {
      const raw = makeRawBundle()
      const bundlePath = createTmpBundle('provenance-artifact')
      const rawWithPath = { ...raw, bundlePath, fileTree: ['README.md'] }

      vi.mocked(mockAI.normalizeHarness).mockResolvedValue(makeAIResult())

      const result = await normalizer.normalize(rawWithPath)

      expect(result.provenance['artifacts[0].id']).toBe('static')
      expect(result.provenance['artifacts[0].template']).toBe('static')
    })

    it('gates [S] 필드(phase, ruleCodes, blocking) 는 provenance 가 "static" 이다', async () => {
      const raw = makeRawBundle()
      const bundlePath = createTmpBundle('provenance-gate')
      const rawWithPath = { ...raw, bundlePath, fileTree: ['README.md'] }

      vi.mocked(mockAI.normalizeHarness).mockResolvedValue(makeAIResult())

      const result = await normalizer.normalize(rawWithPath)

      expect(result.provenance['controlFlow.gates[0].phase']).toBe('static')
      expect(result.provenance['controlFlow.gates[0].ruleCodes']).toBe('static')
      expect(result.provenance['controlFlow.gates[0].blocking']).toBe('static')
    })

    it('gates description([AI] 필드)는 AI 가 채우면 provenance 가 "ai" 이다', async () => {
      const raw = makeRawBundle()
      const bundlePath = createTmpBundle('provenance-gate-desc')
      const rawWithPath = { ...raw, bundlePath, fileTree: ['README.md'] }

      vi.mocked(mockAI.normalizeHarness).mockResolvedValue(makeAIResult())

      const result = await normalizer.normalize(rawWithPath)

      expect(result.provenance['controlFlow.gates[0].description']).toBe('ai')
    })
  })

  // ── 4. [AI] 필드는 채워진다 ────────────────────────────────────────────────

  describe('[AI] 필드 보강', () => {
    it('meta.author, meta.tagline 이 AI 결과에서 채워진다', async () => {
      const raw = makeRawBundle()
      const bundlePath = createTmpBundle('ai-meta')
      const rawWithPath = { ...raw, bundlePath, fileTree: ['README.md'] }

      vi.mocked(mockAI.normalizeHarness).mockResolvedValue(makeAIResult())

      const result = await normalizer.normalize(rawWithPath)

      expect(result.meta.author).toBe('AI 추정 저자')
      expect(result.meta.tagline).toBe('AI 추정 한 줄 설명')
    })

    it('agents[].role, reads, writes 가 AI 결과에서 채워진다', async () => {
      const raw = makeRawBundle()
      const bundlePath = createTmpBundle('ai-agents')
      const rawWithPath = { ...raw, bundlePath, fileTree: ['README.md'] }

      vi.mocked(mockAI.normalizeHarness).mockResolvedValue(makeAIResult())

      const result = await normalizer.normalize(rawWithPath)

      expect(result.agents[0].role).toBe('AI 추정 역할')
      expect(result.agents[0].reads).toEqual(['feature/*.md'])
      expect(result.agents[0].writes).toEqual(['impl-log.md'])
    })

    it('levels 가 AI 결과에서 채워진다', async () => {
      const raw = makeRawBundle()
      const bundlePath = createTmpBundle('ai-levels')
      const rawWithPath = { ...raw, bundlePath, fileTree: ['README.md'] }

      vi.mocked(mockAI.normalizeHarness).mockResolvedValue(makeAIResult())

      const result = await normalizer.normalize(rawWithPath)

      expect(result.levels.length).toBe(1)
      expect(result.levels[0].id).toBe('L1')
      expect(result.levels[0].name).toBe('Standard Feature')
    })

    it('triage 가 AI 결과에서 채워진다', async () => {
      const raw = makeRawBundle()
      const bundlePath = createTmpBundle('ai-triage')
      const rawWithPath = { ...raw, bundlePath, fileTree: ['README.md'] }

      vi.mocked(mockAI.normalizeHarness).mockResolvedValue(makeAIResult())

      const result = await normalizer.normalize(rawWithPath)

      expect(result.triage.questions.length).toBe(1)
      expect(result.triage.rules.length).toBe(1)
    })

    it('artifacts persist, producer 가 AI 결과에서 채워진다', async () => {
      const raw = makeRawBundle()
      const bundlePath = createTmpBundle('ai-artifacts')
      const rawWithPath = { ...raw, bundlePath, fileTree: ['README.md'] }

      vi.mocked(mockAI.normalizeHarness).mockResolvedValue(makeAIResult())

      const result = await normalizer.normalize(rawWithPath)

      expect(result.artifacts[0].persist).toBe('git')
      expect(result.artifacts[0].producer).toBe('pm')
    })

    it('controlFlow.parallelGroups, loops 가 AI 결과에서 채워진다', async () => {
      const raw = makeRawBundle()
      const bundlePath = createTmpBundle('ai-controlflow')
      const rawWithPath = { ...raw, bundlePath, fileTree: ['README.md'] }

      vi.mocked(mockAI.normalizeHarness).mockResolvedValue(makeAIResult())

      const result = await normalizer.normalize(rawWithPath)

      expect(result.controlFlow.parallelGroups).toEqual(['QA || Security 병렬'])
      expect(result.controlFlow.loops).toEqual(['QA 3회 루프'])
    })

    it('gates description 이 AI 결과에서 채워진다', async () => {
      const raw = makeRawBundle()
      const bundlePath = createTmpBundle('ai-gate-desc')
      const rawWithPath = { ...raw, bundlePath, fileTree: ['README.md'] }

      vi.mocked(mockAI.normalizeHarness).mockResolvedValue(makeAIResult())

      const result = await normalizer.normalize(rawWithPath)

      expect(result.controlFlow.gates[0].description).toBe('AI 추정 게이트 설명')
    })

    it('hooks enforces 가 AI 결과에서 채워진다', async () => {
      const raw = makeRawBundle()
      const bundlePath = createTmpBundle('ai-hook-enforces')
      const rawWithPath = { ...raw, bundlePath, fileTree: ['README.md'] }

      vi.mocked(mockAI.normalizeHarness).mockResolvedValue(makeAIResult())

      const result = await normalizer.normalize(rawWithPath)

      expect(result.controlFlow.hooks[0].enforces).toBe('AI 추정 hook 설명')
    })
  })

  // ── 5. 정적 warnings 는 보존된다 ────────────────────────────────────────────

  describe('warnings 합산', () => {
    it('RawBundle 의 warnings 와 AI 결과 warnings 가 합산된다', async () => {
      const raw = makeRawBundle({ warnings: ['정적 경고 메시지'] })
      const bundlePath = createTmpBundle('warnings-merge')
      const rawWithPath = { ...raw, bundlePath, fileTree: ['README.md'] }

      const aiResult = makeAIResult({ warnings: ['AI 추정 경고'] })
      vi.mocked(mockAI.normalizeHarness).mockResolvedValue(aiResult)

      const result = await normalizer.normalize(rawWithPath)

      expect(result.warnings).toContain('정적 경고 메시지')
      expect(result.warnings).toContain('AI 추정 경고')
    })
  })

  // ── 6. schemaVersion 항상 CURRENT ────────────────────────────────────────────

  it('schemaVersion 은 항상 CURRENT_SCHEMA_VERSION 이다', async () => {
    const { CURRENT_SCHEMA_VERSION } = await import('./HarnessCache')
    const raw = makeRawBundle()
    const bundlePath = createTmpBundle('schema-version')
    const rawWithPath = { ...raw, bundlePath, fileTree: ['README.md'] }

    vi.mocked(mockAI.normalizeHarness).mockResolvedValue(makeAIResult())

    const result = await normalizer.normalize(rawWithPath)

    expect(result.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
  })
})
