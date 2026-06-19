/**
 * phaseClass → Clauday DS 시맨틱 토큰 매핑.
 *
 * 반환값은 CSS 변수명 문자열(예: 'var(--c-blue-bg)')이다.
 * 다크/라이트 전환은 CSS 변수가 처리하므로 이 함수는 테마 무관하다.
 *
 * phaseClass: 'analyst'|'pm'|'architect'|'sm'|'dev'|'qa'|'security'|'release'|'orchestrator'|'other'
 */

export type PhaseClass =
  | 'analyst'
  | 'pm'
  | 'architect'
  | 'sm'
  | 'dev'
  | 'qa'
  | 'security'
  | 'release'
  | 'orchestrator'
  | 'other'

export interface PhaseTokens {
  /** 노드 배경 CSS 변수 표현 */
  bg: string
  /** 노드 전경(텍스트/아이콘) CSS 변수 표현 */
  fg: string
  /** 노드 테두리 CSS 변수 표현 */
  border: string
}

/** phaseClass → DS 시맨틱 토큰 맵. export 하여 테스트에서 직접 검증 가능. */
export const PHASE_TOKEN_MAP: Record<PhaseClass, PhaseTokens> = {
  analyst:      { bg: 'var(--c-violet-bg)',  fg: 'var(--c-violet-fg)',  border: 'color-mix(in oklab, var(--c-violet-fg) 30%, transparent)' },
  pm:           { bg: 'var(--c-orange-bg)',  fg: 'var(--c-orange-fg)',  border: 'color-mix(in oklab, var(--c-orange-fg) 30%, transparent)' },
  architect:    { bg: 'var(--c-blue-bg)',    fg: 'var(--c-blue-fg)',    border: 'color-mix(in oklab, var(--c-blue-fg) 30%, transparent)' },
  sm:           { bg: 'var(--c-yellow-bg)',  fg: 'var(--c-yellow-fg)',  border: 'color-mix(in oklab, var(--c-yellow-fg) 30%, transparent)' },
  dev:          { bg: 'var(--c-emerald-bg)', fg: 'var(--c-emerald-fg)', border: 'color-mix(in oklab, var(--c-emerald-fg) 30%, transparent)' },
  qa:           { bg: 'var(--c-blue-bg)',    fg: 'var(--c-blue-fg)',    border: 'color-mix(in oklab, var(--c-blue-fg) 30%, transparent)' },
  security:     { bg: 'var(--c-red-bg)',     fg: 'var(--c-red-fg)',     border: 'color-mix(in oklab, var(--c-red-fg) 30%, transparent)' },
  release:      { bg: 'var(--c-emerald-bg)', fg: 'var(--c-emerald-fg)', border: 'color-mix(in oklab, var(--c-emerald-fg) 30%, transparent)' },
  orchestrator: { bg: 'var(--c-orange-bg)',  fg: 'var(--c-orange-fg)',  border: 'color-mix(in oklab, var(--c-orange-fg) 30%, transparent)' },
  other:        { bg: 'var(--bg-surface)',   fg: 'var(--text-secondary)', border: 'var(--bg-border)' }
}

/** 폴백 토큰 — 알 수 없는 phaseClass 에 사용. */
const FALLBACK_TOKENS: PhaseTokens = {
  bg: 'var(--bg-surface)',
  fg: 'var(--text-secondary)',
  border: 'var(--bg-border)'
}

/**
 * phaseClass 문자열을 받아 DS 시맨틱 토큰을 반환한다.
 * 알 수 없는 값(null/undefined/unknown string)은 'other' 로 처리한다.
 *
 * @param phaseClass - 에이전트 역할 분류 문자열
 * @returns DS 시맨틱 토큰 (bg/fg/border CSS 변수 표현)
 */
export function phaseTokens(phaseClass: string | undefined | null): PhaseTokens {
  if (!phaseClass) return FALLBACK_TOKENS
  const key = phaseClass as PhaseClass
  return PHASE_TOKEN_MAP[key] ?? FALLBACK_TOKENS
}

/**
 * phaseClass 가 알려진 값인지 판별한다.
 *
 * @param phaseClass - 확인할 문자열
 */
export function isKnownPhaseClass(phaseClass: string): phaseClass is PhaseClass {
  return Object.prototype.hasOwnProperty.call(PHASE_TOKEN_MAP, phaseClass)
}
