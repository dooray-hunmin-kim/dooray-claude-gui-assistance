---
task: harness-studio-m3
agent: main-process-engineer
date: 2026-06-19
---

# Impl Log — Harness Studio M3: 정규화 파이프라인 조립 + IPC 핸들러

## 변경한 파일

- `src/main/harness/HarnessNormalizer.ts` (신규) — RawBundle → HarnessModel 정규화 파이프라인
- `src/main/harness/HarnessNormalizer.test.ts` (신규) — 25개 테스트
- `src/main/harness/HarnessService.ts` (신규) — 정적 스캔/AI 정규화/캐시/Dry-run/discover 파사드
- `src/main/harness/HarnessService.test.ts` (신규) — 11개 테스트
- `src/main/index.ts` (수정) — HarnessService 지연 초기화 + 5개 IPC 핸들러 등록
- `src/preload/index.ts` (수정) — `window.api.harness.{scan,discover,normalize,clearCache,listCached}` 노출

## 결정 사항

### HarnessNormalizer — 스켈레톤 타입 분리
- `SkeletonControlFlow` 인터페이스를 만들어 `HarnessControlFlow` 대신 스켈레톤 내에서 사용.
  이유: `RawGate.scriptFile` / `RawHook.absolutePath` 같은 정적 확장 필드를 머지 시 보호하기 위해
  타입 레벨에서 구분이 필요했음.
- `HarnessModelSkeleton` 타입도 함께 정의해 `mergeWithStatic` 함수가 타입 안전하게 동작하도록 함.

### HarnessNormalizer — toHarnessControlFlow 헬퍼
- 스켈레톤 → AIService 전달 시 / 폴백 반환 시 `SkeletonControlFlow` → `HarnessControlFlow` 변환이 필요.
  `toHarnessControlFlow` 순수 헬퍼를 `normalize` 메서드 내부에 클로저로 배치.

### HarnessService — estimateLevel에 aiService 직접 접근
- `HarnessNormalizer`에 aiService를 주입하므로 `HarnessService`도 별도로 `aiService` 레퍼런스를 가짐.
  `IAIServiceForHarness` 인터페이스가 `IAIServiceForNormalizer`를 확장해 `estimateLevel`도 포함.

### HarnessService 지연 초기화 (lazy init)
- `app.getPath('userData')`는 `app.whenReady()` 이후에야 사용 가능.
  `_harnessService` null + `getHarnessService()` getter 패턴으로 첫 IPC 호출 시 초기화.
  기존 `index.ts`의 다른 서비스들과 달리 모듈 최상위가 아닌 getter를 쓰는 이유는 전자.

### M7 스텁 처리
- `estimateLevel`: `levelPath`(M7)이 없으므로 `highlightPath/parallelGroups/gates/estTimeRel/estCostRel`를
  빈 값/기본값 스텁으로 채움. IPC 핸들러는 등록하지 않음 (요구사항대로 DRYRUN은 후속).

## 제약 (하지 말 것)

- **`levelPath.ts` / `DryRunEstimator.ts` 파일 생성 금지** — M7 영역. 현재 파일이 없어야 M7이 충돌 없이 구현 가능.
- **`HARNESS_DRYRUN` / `HARNESS_EXPLAIN` IPC 핸들러 등록 금지** — M7/M8 영역.
- **`runClaudeStream` 분기 수정 금지** — AIService의 Windows/Mac 분기 가이드(CLAUDE.md) 준수.
- **renderer 수정 금지** — M4 영역.
- **`HarnessNormalizer.mergeWithStatic`에서 [S] 필드를 AI 응답으로 덮어쓰는 것 금지** — ADR-001.

## IPC 등록 현황 (M3 기준)

| 채널 | 등록 여부 | 비고 |
|---|---|---|
| `HARNESS_SCAN` | 완료 | pickDialog 옵션 포함 |
| `HARNESS_DISCOVER` | 완료 | |
| `HARNESS_NORMALIZE` | 완료 | requestId 지원 |
| `HARNESS_CACHE_CLEAR` | 완료 | |
| `HARNESS_LIST_CACHED` | 완료 | |
| `HARNESS_DRYRUN` | 미등록 | M7 |
| `HARNESS_EXPLAIN` | 미등록 | M8 |

## 테스트 결과

- 전체: 75 파일, 950 테스트 통과
- 신규: HarnessNormalizer (25개) + HarnessService (11개) = 36개
- typecheck: `tsc --noEmit` 양쪽 모두 통과 (exit 0)

## 참조

- ADR-harness-studio-001 (머지계약: 정적 우선, AI가 [S] 덮어쓰기 금지)
- ADR-harness-studio-004 (캐시 전략: 파일 JSON, bundleHash/taskHash)
- `docs/planning/harness-studio-arch.md` §3(데이터흐름), §4(IPC 채널)
- M1: BundleScanner, frontmatter, bundleHash, bundleDetect
- M2: normalizePrompt, HarnessCache, taskHash + AIService.normalizeHarness/estimateLevel
