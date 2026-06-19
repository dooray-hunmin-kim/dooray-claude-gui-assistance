/**
 * HarnessService — 정적 스캔 / AI 정규화 / 캐시 / Dry-run / 자동 발견 을 묶는 파사드.
 *
 * IPC 핸들러가 직접 호출하는 단일 진입점.
 * electron 의존(app.getPath, dialog)은 이 클래스와 IPC 핸들러에만 존재한다.
 *
 * 제공 메서드:
 * - scan(path): 정적 스캔 → RawBundleSummary (AI 없음, 즉시)
 * - normalize(path, force?): 캐시 hit → HarnessModel 즉시 / miss → scan + normalize + cache.set
 * - estimateLevel(path, taskText): 레벨 추정 (M7 이후 levelPath 연동 예정)
 * - discover(): ~/.claude/skills/* 자동 발견
 * - clearCache(path?): 캐시 삭제
 * - listCached(): 캐시된 번들 목록
 *
 * 제약:
 * - levelPath(M7) 미구현 — estimateLevel 은 AIService.estimateLevel 까지만 배선.
 *   레벨추정 결과(level/answers/rationale)와 stubbed DryRunResult 를 반환.
 * - 절대 DryRunEstimator/levelPath.ts 파일을 만들지 않는다.
 */

import { promises as fs } from 'fs'
import * as path from 'path'
import { homedir } from 'os'
import { BundleScanner } from './BundleScanner'
import { HarnessNormalizer } from './HarnessNormalizer'
import { HarnessCache } from './HarnessCache'
import { computeTaskHash } from './taskHash'
import type { IAIServiceForNormalizer } from './HarnessNormalizer'
import type { RawBundleSummary, HarnessModel, DryRunResult, DiscoveredHarness } from '../../shared/types/harness'
import { detectBundleKind } from './bundleDetect'

// ─────────────────────────────────────────────
// AIService 추가 인터페이스 (estimateLevel 용)
// ─────────────────────────────────────────────

/**
 * HarnessService 가 사용하는 AIService 의 최소 인터페이스.
 * normalizeHarness + estimateLevel 두 메서드를 포함한다.
 */
export interface IAIServiceForHarness extends IAIServiceForNormalizer {
  estimateLevel(
    taskText: string,
    triage: import('../../shared/types/harness').HarnessTriage,
    requestId?: string
  ): Promise<Pick<DryRunResult, 'level' | 'answers' | 'rationale'>>
}

// ─────────────────────────────────────────────
// HarnessService
// ─────────────────────────────────────────────

/**
 * Harness Studio 의 주 파사드 서비스.
 *
 * IPC 핸들러가 직접 호출하는 단일 진입점이며,
 * BundleScanner / HarnessNormalizer / HarnessCache 를 조율한다.
 *
 * electron 의존(userDataPath)은 생성자 주입으로 격리해
 * 테스트 시 임시 디렉터리를 주입할 수 있다.
 */
export class HarnessService {
  private readonly scanner: BundleScanner
  private readonly normalizer: HarnessNormalizer
  private readonly cache: HarnessCache
  private readonly aiService: IAIServiceForHarness

  /**
   * @param userDataPath - electron app.getPath('userData') 값
   * @param aiService - AIService 인스턴스 (normalizeHarness + estimateLevel 포함)
   */
  constructor(userDataPath: string, aiService: IAIServiceForHarness) {
    this.scanner = new BundleScanner()
    this.normalizer = new HarnessNormalizer(aiService)
    this.cache = new HarnessCache(userDataPath)
    this.aiService = aiService
  }

  // ─────────────────────────────────────────────
  // scan — 정적 스캔 (AI 없음, 즉시)
  // ─────────────────────────────────────────────

  /**
   * 번들 경로를 정적으로 스캔하여 RawBundleSummary 를 반환한다.
   *
   * AI 없음. 즉시 반환. ImportWizard 의 ScanStep 에서 사용한다.
   *
   * @param bundlePath - 번들 루트 절대경로
   * @returns RawBundleSummary (kind, fileTree, agentStubs, warnings)
   */
  async scan(bundlePath: string): Promise<RawBundleSummary> {
    const raw = await this.scanner.scan(bundlePath)
    return this.scanner.toSummary(raw)
  }

  // ─────────────────────────────────────────────
  // normalize — 캐시 hit/miss + AI 정규화
  // ─────────────────────────────────────────────

  /**
   * 번들 경로를 AI 로 정규화하여 HarnessModel 을 반환한다.
   *
   * 처리 순서:
   * 1. BundleScanner.scan 으로 RawBundle + bundleHash 획득.
   * 2. HarnessCache.getBundle(bundleHash) 로 캐시 조회.
   *    - hit (force=false): 캐시된 HarnessModel 즉시 반환.
   *    - miss (또는 force=true): HarnessNormalizer.normalize 호출 → cache.setBundle.
   *
   * @param bundlePath - 번들 루트 절대경로
   * @param force - true 면 캐시 무시하고 재정규화
   * @param requestId - AI_PROGRESS 이벤트 구분 ID (선택)
   * @returns HarnessModel
   */
  async normalize(bundlePath: string, force = false, requestId?: string): Promise<HarnessModel> {
    // 1. 정적 스캔 → RawBundle
    const raw = await this.scanner.scan(bundlePath)

    // 2. 캐시 조회
    if (!force) {
      const cached = this.cache.getBundle(raw.bundleHash)
      if (cached !== null) {
        return cached
      }
    }

    // 3. AI 정규화
    const model = await this.normalizer.normalize(raw, requestId)

    // 4. 캐시 저장
    this.cache.setBundle(raw.bundleHash, model, {
      path: bundlePath,
      name: raw.bundleHash ? path.basename(bundlePath) : 'unknown',
    })

    return model
  }

  // ─────────────────────────────────────────────
  // estimateLevel — Dry-run 레벨 추정 (M7 levelPath 미구현)
  // ─────────────────────────────────────────────

  /**
   * 태스크 평문을 받아 번들의 레벨(L0~L3)을 추정한다.
   *
   * M7 미구현 제약:
   * - levelPath(결정론적 경로 계산) 는 M7 에서 구현 예정.
   * - 현재는 AIService.estimateLevel 까지만 배선하고,
   *   highlightPath/parallelGroups/gates/estTimeRel/estCostRel 는
   *   스텁(빈 배열/기본값) 으로 채운다.
   *
   * taskHash 캐시:
   * - bundleHash + normalizedTaskText 로 taskHash 를 계산한다.
   * - 캐시 hit 시 즉시 반환.
   *
   * @param bundlePath - 번들 루트 절대경로 (HarnessModel 을 로드하거나 캐시에서 읽는다)
   * @param taskText - 태스크 설명 평문 또는 두레이 URL
   * @param requestId - AI_PROGRESS 이벤트 구분 ID (선택)
   * @throws M7 미구현을 나타내는 Error (levelPath 계산 부분)
   */
  async estimateLevel(bundlePath: string, taskText: string, requestId?: string): Promise<DryRunResult> {
    // 1. normalize (캐시 hit 우선)
    const model = await this.normalize(bundlePath, false, requestId)

    // 2. taskHash 캐시 조회
    const taskHash = computeTaskHash(model.meta.bundleHash, taskText)
    const cachedResult = this.cache.getTask(taskHash)
    if (cachedResult !== null) {
      return cachedResult
    }

    // 3. AI 레벨 추정 (estimateLevel 까지만 배선)
    const estimate = await this.aiService.estimateLevel(
      taskText,
      model.triage,
      requestId
    )

    // 4. DryRunResult 구성 (levelPath 스텁 — M7 미구현)
    // levelPath(M7) 이 구현되면 highlightPath/parallelGroups/gates/estTimeRel/estCostRel 를 채운다.
    const result: DryRunResult = {
      level: estimate.level,
      answers: estimate.answers,
      rationale: estimate.rationale,
      // M7 미구현 — 빈 값 stub
      highlightPath: [],
      parallelGroups: [],
      gates: [],
      estTimeRel: 1.0,
      estCostRel: 1.0,
    }

    // 5. taskHash 캐시 저장
    this.cache.setTask(taskHash, result)

    return result
  }

  // ─────────────────────────────────────────────
  // discover — ~/.claude/skills/* 자동 발견
  // ─────────────────────────────────────────────

  /**
   * ~/.claude/skills/* 를 정적으로 스캔해 발견된 번들 목록을 반환한다.
   *
   * 각 하위 디렉터리를 번들 후보로 간주하고,
   * detectBundleKind 로 kind 를 판정한다.
   * 오류 발생 시 해당 항목을 스킵하고 계속 진행한다.
   *
   * @returns DiscoveredHarness 배열
   */
  async discover(): Promise<DiscoveredHarness[]> {
    const skillsRoot = path.join(homedir(), '.claude', 'skills')
    const results: DiscoveredHarness[] = []

    let entries: import('fs').Dirent[]
    try {
      entries = await fs.readdir(skillsRoot, { withFileTypes: true })
    } catch {
      // ~/.claude/skills 가 없으면 빈 배열 반환
      return []
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const bundlePath = path.join(skillsRoot, entry.name)
      try {
        // 파일 목록만 간단히 읽어 kind 판정 (전체 scan 은 비용이 크므로 최소화)
        const subEntries = await fs.readdir(bundlePath, { encoding: 'utf-8' })
        const filePaths = subEntries
        const kind = detectBundleKind({ filePaths })
        results.push({
          path: bundlePath,
          name: entry.name,
          kind,
        })
      } catch {
        // 해당 항목 스킵
      }
    }

    return results
  }

  // ─────────────────────────────────────────────
  // clearCache / listCached
  // ─────────────────────────────────────────────

  /**
   * 캐시를 삭제한다.
   *
   * bundlePath 지정 시 해당 번들만, 생략 시 전체 삭제.
   *
   * @param bundlePath - 특정 번들 경로 (optional)
   * @returns 삭제된 항목 수
   */
  clearCache(bundlePath?: string): number {
    return this.cache.clear(bundlePath)
  }

  /**
   * 캐시된 번들 목록을 반환한다 (최근 정규화 순).
   *
   * 최근 정규화한 번들을 빠르게 재오픈할 때 사용한다.
   *
   * @returns CachedHarnessEntry 배열
   */
  listCached(): import('../../shared/types/harness').CachedHarnessEntry[] {
    return this.cache.listCached()
  }
}
