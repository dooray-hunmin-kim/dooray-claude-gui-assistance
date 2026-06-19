/**
 * AgentInspector — 선택된 에이전트의 상세 정보 패널.
 *
 * FlowCanvas 에서 노드 클릭 시 우측 패널에 표시된다.
 * 표시 항목: 모델/역할/도구(화이트리스트)/입출력(reads/writes)/에스컬레이션.
 * modelSource='ai' 이면 ProvenanceBadge 표시.
 *
 * PRD §7-1 에이전트 인스펙터 기능 요구사항 충족.
 */

import { X, Wrench, FileInput, FileOutput, AlertTriangle, ArrowUpCircle } from 'lucide-react'
import type { HarnessAgent, Provenance } from '@shared/types/harness'
import { ProvenanceBadge } from '../shared/ProvenanceBadge'
import { phaseTokens } from '../shared/PhaseColor'
import Chip from '@/components/common/ds/Chip'
import Button from '@/components/common/ds/Button'

export interface AgentInspectorProps {
  /** 표시할 에이전트 */
  agent: HarnessAgent
  /** 모델 전체 provenance 맵 */
  provenance: Provenance
  /** 닫기 버튼 콜백 */
  onClose: () => void
}

/** 모델명 → Chip tone 매핑 */
const MODEL_TONE: Record<string, 'neutral' | 'blue' | 'orange' | 'emerald' | 'red' | 'violet' | 'yellow'> = {
  haiku:   'neutral',
  sonnet:  'blue',
  opus:    'orange',
  unknown: 'neutral'
}

/**
 * 선택된 에이전트의 모델/역할/도구/입출력/에스컬레이션 패널.
 *
 * FlowCanvas 와 형제로 export 되어 'flow' 탭 레이아웃 안에서 동작한다.
 */
export function AgentInspector({ agent, provenance, onClose }: AgentInspectorProps): JSX.Element {
  const tokens = phaseTokens(agent.phaseClass)

  // provenance 에서 이 에이전트의 model 출처 확인
  const agentIdx = agent.id  // provenance 키는 "agents[N].model" 형식이므로 id 로 간접 탐색
  const modelFieldKey = findProvenanceKey(provenance, agentIdx, 'model')
  const modelSource = modelFieldKey ? provenance[modelFieldKey] : agent.modelSource

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 border-b border-[color:var(--bg-border)] flex-shrink-0"
        style={{ background: tokens.bg }}
      >
        <span
          className="text-xs font-bold flex-1 truncate"
          style={{ color: tokens.fg }}
          title={agent.displayName}
        >
          {agent.displayName}
        </span>
        <Button
          variant="ghost"
          size="xs"
          onClick={onClose}
          title="닫기"
          aria-label="인스펙터 닫기"
        >
          <X size={12} />
        </Button>
      </div>

      {/* 본체 */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">

        {/* 모델 */}
        <Section label="모델">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Chip tone={MODEL_TONE[agent.model] ?? 'neutral'} square>
              {agent.model === 'unknown' ? '알 수 없음' : agent.model}
            </Chip>
            <ProvenanceBadge source={modelSource} size="xs" />
          </div>
        </Section>

        {/* 역할 */}
        {agent.role && (
          <Section label="역할">
            <p className="text-[11px] text-[color:var(--text-secondary)] leading-snug">
              {agent.role}
            </p>
          </Section>
        )}

        {/* phaseClass */}
        {agent.phaseClass && (
          <Section label="페이즈">
            <span
              className="ds-chip sq text-[10px]"
              style={{ background: tokens.bg, color: tokens.fg, border: `1px solid ${tokens.border}` }}
            >
              {agent.phaseClass}
            </span>
          </Section>
        )}

        {/* 도구 화이트리스트 */}
        {agent.tools.length > 0 && (
          <Section label="허용 도구" icon={<Wrench size={10} />}>
            <div className="flex flex-wrap gap-1">
              {agent.tools.map((tool) => (
                <span
                  key={tool}
                  className="ds-chip neutral sq"
                  style={{ fontSize: '9px', maxWidth: '150px' }}
                  title={tool}
                >
                  <span className="truncate inline-block max-w-full">{tool}</span>
                </span>
              ))}
            </div>
          </Section>
        )}

        {/* 읽기 파일 (reads) */}
        {agent.reads.length > 0 && (
          <Section label="읽기 (reads)" icon={<FileInput size={10} />}>
            <ul className="flex flex-col gap-0.5">
              {agent.reads.map((r, idx) => (
                <li key={idx} className="text-[10px] text-[color:var(--text-secondary)] font-mono leading-snug truncate" title={r}>
                  {r}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* 쓰기 경로 (writes) */}
        {agent.writes.length > 0 && (
          <Section label="쓰기 (writes)" icon={<FileOutput size={10} />}>
            <ul className="flex flex-col gap-0.5">
              {agent.writes.map((w, idx) => (
                <li key={idx} className="text-[10px] text-[color:var(--text-secondary)] font-mono leading-snug truncate" title={w}>
                  {w}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* 위험 노트 */}
        {agent.riskNote && (
          <Section
            label="주된 위험"
            icon={<AlertTriangle size={10} style={{ color: 'var(--c-yellow-fg)' }} />}
          >
            <p className="text-[11px] text-[color:var(--text-secondary)] leading-snug">
              {agent.riskNote}
            </p>
          </Section>
        )}

        {/* 에스컬레이션 조건 */}
        {agent.escalation && (
          <Section
            label="에스컬레이션"
            icon={<ArrowUpCircle size={10} style={{ color: 'var(--c-orange-fg)' }} />}
          >
            <p className="text-[11px] text-[color:var(--text-secondary)] leading-snug">
              {agent.escalation}
            </p>
          </Section>
        )}

        {/* 허용 신호 (signals) */}
        {agent.signals && agent.signals.length > 0 && (
          <Section label="허용 신호">
            <div className="flex flex-wrap gap-1">
              {agent.signals.map((sig) => (
                <Chip key={sig} tone="violet" square>{sig}</Chip>
              ))}
            </div>
          </Section>
        )}

      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// 내부 헬퍼 컴포넌트
// ─────────────────────────────────────────────

interface SectionProps {
  label: string
  icon?: React.ReactNode
  children: React.ReactNode
}

function Section({ label, icon, children }: SectionProps): JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        {icon && <span className="text-[color:var(--text-tertiary)]">{icon}</span>}
        <span className="ds-field-label">{label}</span>
      </div>
      {children}
    </div>
  )
}

/**
 * provenance 맵에서 주어진 에이전트 id 와 fieldName 에 해당하는 키를 탐색.
 * 키 형식: "agents[N].fieldName"
 */
function findProvenanceKey(
  provenance: Provenance,
  agentId: string,
  fieldName: string
): string | undefined {
  return Object.keys(provenance).find(
    (key) => key.endsWith(`.${fieldName}`) && key.includes(agentId)
  )
}

import type React from 'react'

export default AgentInspector
