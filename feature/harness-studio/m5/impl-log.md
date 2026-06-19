---
task: harness-studio-m5
agent: renderer-engineer
date: 2026-06-19
---

# Impl Log — Harness Studio M5: Flow Canvas + Agent Inspector

## 변경한 파일

### 신규 (순수 함수 / 테마)
- `src/renderer/src/components/HarnessStudio/shared/PhaseColor.ts`
  — `phaseTokens(phaseClass)` → DS CSS 변수 토큰 반환. `PHASE_TOKEN_MAP` 10개 phaseClass 정의. `isKnownPhaseClass()` 타입 가드.
- `src/renderer/src/components/HarnessStudio/flow/buildGraph.ts`
  — `buildGraph(model, levelId) → { nodes, edges }`. 활성 체인 active/dimmed 분리, 병렬 그룹 컬럼 배치, QA RETURN 루프 엣지, 게이트 노드 삽입, 산출물 라벨 엣지. react-flow 독립 순수함수.
- `src/renderer/src/components/HarnessStudio/flow/flowTheme.ts`
  — `getFlowTheme()` / `getFlowCSSVarOverrides()`. react-flow CSS 변수를 DS 토큰으로 바인딩. useTheme 전환 시 재렌더 불필요(CSS 변수 상속).

### 신규 (React 컴포넌트)
- `src/renderer/src/components/HarnessStudio/flow/nodes/AgentNode.tsx`
  — phaseClass 배경색(PhaseColor), 모델 배지(haiku/sonnet/opus 색 구분), riskNote 위험 아이콘, AI 출처 ProvenanceBadge.
- `src/renderer/src/components/HarnessStudio/flow/nodes/GateNode.tsx`
  — blocking 잠금 아이콘, 규칙코드 칩 목록(최대 3+N), DS 빨강/초록 토큰.
- `src/renderer/src/components/HarnessStudio/flow/edges/HandoffEdge.tsx`
  — 산출물 라벨(EdgeLabelRenderer), 점선(conditional), 노란 RETURN 루프 곡선 + 라벨.
- `src/renderer/src/components/HarnessStudio/flow/FlowCanvas.tsx`
  — props: `{ model, highlightPath?, onSelectAgent? }`. L0~L3 SegTabs 토글, react-flow 줌·팬·미니맵·컨트롤, 노드 클릭 → AgentInspector 우측 패널 통합. `highlightPath` M7 Dry-run 연동 자리 예약(현재 무시).
- `src/renderer/src/components/HarnessStudio/inspector/AgentInspector.tsx`
  — 모델/역할/도구/reads/writes/riskNote/에스컬레이션/signals 패널. FlowCanvas 내부에 통합되어 노드 클릭 시 토글.

### 신규 (테스트)
- `src/renderer/src/components/HarnessStudio/__tests__/PhaseColor.test.ts` — 14개 케이스
- `src/renderer/src/components/HarnessStudio/__tests__/buildGraph.test.ts` — 23개 케이스

### 수정
- `src/renderer/src/components/ClaudeManual/ClaudeManual.tsx`
  — `harness-studio` 섹션에 Flow Canvas(M5) 항목 추가: L0~L3 토글, PhaseColor 색상 규칙, Agent Inspector 사용법, 핸드오프 엣지 표기, 줌·팬.

## 결정 사항

### buildGraph — 타입 확장
- `AgentNodeData`, `GateNodeData`, `EdgeData` 에 `extends Record<string, unknown>` 추가.
  이유: `@xyflow/react` v12 의 `Node<T>` / `Edge<T>` 제네릭이 `T extends Record<string, unknown>` 제약을 가짐. 순수함수 테스트에서는 react-flow 타입에 의존하지 않으면서도 FlowCanvas 에서 타입 안전하게 캐스팅 가능하도록.

### FlowCanvas — 노드/엣지 변환
- `buildGraph` 반환값을 FlowCanvas 내에서 `as unknown as Node[]` / `as unknown as Edge[]` 로 캐스팅.
  이유: 커스텀 data 타입이 react-flow 내부 `Record<string, unknown>` 제약을 직접 만족시키지 못하는 타입 시스템 한계. 런타임은 정상 동작하며, 커스텀 노드/엣지 컴포넌트에서 `data as unknown as AgentNodeData` 역캐스팅으로 타입 복원.

### AgentNode — lucide title prop
- `AlertTriangle` 에 `title` prop 을 직접 전달할 수 없음(lucide-react `IntrinsicAttributes` 미포함).
  `<span title={riskNote}>` 래퍼로 해결.

### flowTheme — CSS 변수 오버라이드 방식
- react-flow 기본 배경/컨트롤/미니맵 색상은 `--xy-*` 내부 변수로 관리됨.
  `getFlowCSSVarOverrides()` 가 이 변수들을 DS 토큰으로 덮어써 다크/라이트 자동 반영.
  `useTheme` 구독 불필요 — CSS 변수 상속 체계가 처리.

### AgentInspector — provenance 키 탐색
- provenance 맵 키 형식이 `"agents[N].model"` 처럼 배열 인덱스를 포함함.
  에이전트 ID 와 필드명을 포함하는 키를 `Object.keys().find()` 로 탐색하는 `findProvenanceKey` 헬퍼로 처리.
  인덱스 기반 조회보다 안전 (에이전트 순서 변동에 내성).

## 제약 (하지 말 것)

- **`HarnessStudioView.tsx` 수정 금지** — M6 배선 영역. `TabPlaceholder` 교체는 M6 에서.
- **Dry-run 로직 구현 금지** — `highlightPath` prop 자리만 예약. M7 영역.
- **`views/` 디렉터리 컴포넌트 생성 금지** — M6 영역.
- **main/preload 수정 금지** — 이미 M3 에서 IPC 핸들러 등록 완료.

## FlowCanvas export 시그니처 (M6 배선 참고)

```ts
export interface FlowCanvasProps {
  model: HarnessModel
  highlightPath?: string[]      // M7 Dry-run 연동 자리 — 현재 무시
  onSelectAgent?: (agentId: string) => void
}

export function FlowCanvas(props: FlowCanvasProps): JSX.Element
export default FlowCanvas
```

AgentInspector 는 FlowCanvas 내부 통합(우측 패널, 노드 클릭 토글). 별도 배선 불필요.

`HarnessStudioView.tsx` 의 `TabPlaceholder` 교체 시:
```tsx
// activeTab === 'flow' 분기에서
<FlowCanvas model={model} />
```

## 테스트 결과

- 전체: 86 파일, 1112 테스트 통과 (실패 0)
- 신규 M5: PhaseColor (14개) + buildGraph (23개) = 37개
- typecheck: `tsc --noEmit` 양쪽 통과 (exit 0)

## 참조

- `docs/planning/harness-studio-arch.md` §5 (react-flow 통합방식)
- `docs/planning/harness-studio-adr-003-react-flow.md` (커스텀 노드/엣지/테마)
- M4: ImportWizard 4-step + HarnessStudioView 셸
- M3: IPC 핸들러 등록 (HARNESS_SCAN/NORMALIZE/DISCOVER/LIST_CACHED/CACHE_CLEAR)
