/**
 * Harness Studio — taskHash 계산 (순수 함수)
 *
 * taskHash = sha256(bundleHash + normalizedTaskText)
 *
 * 같은 번들 + 같은 태스크 텍스트 조합이면 동일 해시를 반환해
 * DryRunResult 캐시 키로 활용한다 (ADR-004).
 *
 * normalizeTaskText: 앞뒤 공백 제거 + 연속 공백 단일화.
 * 이 정규화를 거쳐 "   내용  " 과 "내용" 이 같은 태스크로 인식된다.
 */

import { createHash } from 'crypto'

/**
 * 태스크 텍스트를 정규화한다.
 * 앞뒤 공백 제거 및 연속 공백(탭·개행 포함)을 단일 스페이스로 치환.
 *
 * @param taskText - 원본 태스크 텍스트
 * @returns 정규화된 텍스트
 */
export function normalizeTaskText(taskText: string): string {
  return taskText.trim().replace(/\s+/g, ' ')
}

/**
 * bundleHash + normalizedTaskText 를 합쳐 SHA-256 해시를 생성한다.
 *
 * 같은 번들(bundleHash)과 같은 태스크 내용이면 동일 값을 반환해
 * Dry-run 결과를 캐시에서 즉시 재사용할 수 있다.
 *
 * @param bundleHash - 번들 정규화 캐시 키 (BundleScanner 가 계산)
 * @param taskText - 태스크 설명 평문 (정규화 전 원본 가능)
 * @returns hex 형식 SHA-256 해시 문자열
 */
export function computeTaskHash(bundleHash: string, taskText: string): string {
  const normalized = normalizeTaskText(taskText)
  return createHash('sha256')
    .update(bundleHash)
    .update('\x00')  // 구분자 — bundleHash 와 taskText 가 이어 붙여질 때 충돌 방지
    .update(normalized)
    .digest('hex')
}
