# Changelog

## [1.4.1] - 안정화 + UX 개선

### 버그 수정
- **터미널 stream 자동 스크롤** — 사용자가 위로 스크롤하면 follow 일시 중단, 바닥 근처에 있을 때만 자동 follow (`ClaudeChatPane`/`AIProgressIndicator`)
- **빠른 두레이 태스크 생성** — 일부 프로젝트에서 태그 필수라 생성 실패하던 문제. `tagIdList` payload 지원 + 폼에 그룹별 태그 chip + AI 추천 추가. IPC 에러 메시지 래핑(`Error invoking remote method ...`) 제거하고 실제 메시지만 노출
- **스킬 추가 후 즉시 동기화** — 수동 작성 모드에서 `skills.save()` IPC 호출 누락. ConfigWatcher 가 `~/.claude/skills/` 도 감시. 추가 후 optimistic add 로 fs flush 지연 보정
- **다크모드 텍스트 안 보임** — `tailwind.config.js` 의 `bg.subtle` 매핑 누락. `subtle: 'var(--bg-subtle)'` 추가
- **앱 재시작 후 터미널 깨짐** — alt-screen TUI 잔재 + 미완성 ANSI 시퀀스 트림(`sanitizeForRestore`) + 복원 시 `terminal.reset()` 선행 + `fit()` 와 동일 rAF 안에서 write 실행해 80×24 기본 grid 충돌 방지
- **터미널 한글 IME 셀 폭 어긋남** — `@xterm/addon-unicode11` + `terminal.unicode.activeVersion = '11'` + 한글 폰트 fallback (Apple SD Gothic Neo / Malgun Gothic / Noto Sans Mono CJK KR)
- **IME 합성 중 Shift+Enter desync** — `e.isComposing`/keyCode 229 가드 추가 (palette 화살표·Esc 는 가드 없이 동작)
- **MCP 활성/비활성 토글이 cosmetic 이었던 문제** — Claude Code 가 `disabled` 필드를 무시했음. 비활성 시 `~/.claude.json` 의 `mcpServers` 에서 빼서 별도 키 `_claudayDisabledMcp` 로 이동
- **위키 root 페이지 자동 탐색 실패** — `/wiki/v1/wikis/{wikiId}/pages` 를 query param 일절 없이 호출해야 top-level 페이지가 반환됨 (`size=100&page=0` 만 붙이면 400). `WikiService.getTopLevelPages()` 신설
- **claude 바이너리 PATH 충돌 (배포 위험)** — 사용자 머신에 claude 가 여러 경로에 깔려있을 때 우리 PATH prepend 가 구버전을 잡아 `--include-hook-events` 미지원 에러 발생. `resolveClaudePath()` 가 `which/where` 로 항상 절대경로 반환, `enrichedClaudeEnv()` 의 PATH 순서를 prepend → append 로 변경 (사용자 PATH 우선)

### 신규 기능
- **빠른 두레이 태스크 — AI 태그 추천** — 제목·본문·AI 지시 + 가용 태그를 LLM 에 전달, 그룹별 1개 룰로 자동 선택
- **자동 동기화 (대시보드)** — 1/5/15/30분 주기 선택 가능, 설정 영속화
- **대시보드 반응형** — `grid-cols-2 sm:grid-cols-3 lg:grid-cols-5` + 헤더 wrap. `max-w-6xl` 제거
- **캘린더 AI 일정분석 sticky 헤더** 제거
- **스킬 마크다운 뷰어** — SkillEditor 에 편집/미리보기 토글
- **스킬 + MCP 다중 선택** — 선택 모드 시 카드 클릭으로 toggle, 주황 ring 강조. 일괄 삭제 / 내보내기 / 공유 / (공유 탭) 내려받기. 다중 import 도 동시 지원
- **세션 탐색기 슬래시 커맨드 팔레트** — `/` 입력 시 보유 스킬 목록, ↑↓ 탐색, Enter 로 `/{skillName}` 텍스트 삽입 (Claude Code 가 슬래시 커맨드로 인지)
- **터미널 검색** (<kbd>Cmd</kbd>+<kbd>F</kbd>) — `@xterm/addon-search` 도입. 우상단 검색바 (Enter 다음, Shift+Enter 이전, Esc 닫기)
- **터미널 세션 이름 영속화 보강** — restoreSaved 후 main 측 meta.name 에 즉시 push 해서 다음 종료에도 유지

### 위키 저장소 (스킬 / MCP 공유) — 신규
- 두레이 위키 URL을 등록하면 그 위키 root 하위(level 2) 에 `Clauday Skills` / `Clauday MCPs` 컨테이너 페이지가 자동 생성되고, 스킬·MCP 정의가 컨테이너 자식으로 저장됨
- **여러 위키 등록 + 활성 전환** — 헤더의 picker 트리거 클릭 → 등록된 위키 목록 + `+` 로 추가/관리
- **다중 선택 시 위키 타겟 선택 모달** — 등록된 위키가 2개 이상일 때 어디 올릴지 선택
- **본인 작성 페이지만 hard delete** — 두레이 API 가 서버 사이드에서 강제. 권한 없는 페이지는 명확한 에러 ("본인이 작성한 페이지만 삭제할 수 있습니다")
- **기본값으로 Clauday 위키** 자동 등록 (잠금 — 제거 불가)
- 업로드 진행률 banner — `{wikiName} 에 업로드 중 (3/5)` + 현재 항목 이름

### 기타
- 스킬 페이지 3탭(내 스킬/공유/내 저장소) → 2탭(내 스킬/공유) 으로 정리. MCP 도 동일 구조 (`로컬 / 공유`)
- 다중 선택 카드 강조: 체크박스 → 주황 outline (box-shadow ring) 으로 변경
- ESC 로 picker / shareTarget 모달 닫기
- 버튼 색상 다양화: 새로고침 secondary, 선택 활성 시 orange, 위키 추가 secondary, 공유에 올리기 primary 등 (`ai` 변형은 실제 AI 호출에만 한정)

## [Unreleased] - Design System v1 (feat/design-system 브랜치)

Claude Design이 생성한 디자인 시스템을 실제 코드베이스에 점진 이식.
`handoff/` 폴더의 MIGRATION.md + bundle.md + screens/ 기반.

### Phase 1 — 토큰 CSS
- 브랜드 토큰 분리 (`:root`): clover-orange/blue, success/warning/danger/info/mention
- spacing 스케일 (`--space-0-5`~`--space-12`, Tailwind 4px base)
- radius 스케일 (`--radius-xs`~`--radius-xl`, `--radius-full`)
- type 스케일 (`--t-9`~`--t-24`) + 시맨틱 클래스 (`.text-title`/`.text-section`/`.text-body`/`.text-meta`/`.text-caption`/`.text-mini`/`.text-label`)
- `.num-xl`/`.num-lg` 대시보드 큰 숫자
- `.ai-gradient-bg`/`.ai-gradient-text` (주황→파랑)
- 라이트 팔레트 5종 (cool-minimal/crisp-white/soft-blue/graphite/paper) 전부 CSS에 선언
- 팔레트 적용 방식: 인라인 CSS 변수 주입 → `<html data-theme="light" data-palette="<id>">` 속성 방식으로 전환
- `useTheme` hook에 `palette` 필드 추가, setPalette/PALETTES/PALETTE_LABELS export
- theme + palette 모두 localStorage + electron-store 이중 기록

### Phase 2 — 공통 primitive 컴포넌트
`design-system.css`에 utility 클래스(`ds-*` prefix) 추가:
- `.ds-btn` (primary/secondary/ghost/danger/ai/success/orange/icon, xs/sm/md/lg)
- `.ds-chip` (blue/orange/emerald/red/violet/yellow/neutral)
- `.ds-card` (default/raised/flat), `.ds-input`, `.ds-avatar`, `.ds-badge-pill`
- `.ds-modal`, `.ds-toast`, `.ds-cp-*` (command palette), `.ds-menu`, `.ds-seg`
- `.ds-state-view` + `.ds-spinner`, `.ds-codeblock`, `.ds-kbd`
- `.ds-titlebar`, `.ds-tabbar`, `.ds-tab`

`src/renderer/src/components/common/ds/` 신설:
- Button.tsx / Chip.tsx / Badge.tsx / Avatar.tsx / Card.tsx / Input.tsx (+ Textarea, FieldLabel)
- Kbd.tsx / SegTabs.tsx / Modal.tsx (createPortal 기반)
- Toast.tsx (ToastHost + useToast context)
- CommandPalette.tsx (⌘K 스타일, 필터링 + 키보드 네비)
- StateViews.tsx (EmptyView/LoadingView/ErrorView)
- TimeAgo.tsx (상대시간 자동 업데이트)
- index.ts re-export

### Phase 3 — Shell (TitleBar + Sidebar)
- **TitleBar**: 높이 40px → 36px (`.ds-titlebar`). 우측에 **⌘K 커맨드 팔레트** 버튼 + **Dark/Light 테마 토글** 추가. 신호등 자리 padding 82px로 고정.
- **Sidebar**: 너비 64px → 56px (w-14). 네비 버튼 40×40 → 36×36 (w-9 h-9). radius 7px + gap 0.5 타이트.
- **App.tsx**: ToastHost로 전체 트리 감싸기, CommandPalette 상시 마운트, ⌘K 글로벌 단축키. command groups: 이동(11 뷰) + 명령(테마 토글).

### Phase 4-1 — MCP 화면
- DS PageHeader 패턴 적용 (Server 아이콘 + 타이틀 + 등록 수 + 우측 액션 버튼)
- Button / EmptyView / LoadingView 공통 컴포넌트로 교체
- `.ds-titlebar` 스타일을 따르는 레이아웃

### Phase 4-3 — Settings
- '앱 동작' 탭 라벨을 '외관 & 동작'으로 명확화
- 팔레트 선택 UI는 useTheme.setPalette와 연결되어 정상 작동 (Phase 1에서 완료)

### Phase 4-4 — Terminal
- 탭바를 `.ds-tabbar` + `.ds-tab` 클래스로 교체 (32px tabbar, 22px tab)

### Phase 5 — Dooray 탭바
- DoorayAssistant 상단 탭바를 `.ds-tabbar` + `.ds-tab`으로 교체
- AI 탭(dashboard/briefing/report/messenger)에 `.ai` 변형 (gradient + 오렌지)
- 전체 Dashboard/Briefing/Watcher 뷰 내부 리라이트는 향후 feature flag 기반 별도 작업

### 후속 작업 (v1.2+)
- Phase 4-2: Skills / Community / Monitoring / Usage 화면 세부 리라이트 (PageHeader/FilterBar 공통화)
- Phase 5 full: Dooray Dashboard/Briefing/Watcher 내부를 DS Dashboard.jsx 구조로 전면 교체 (feature flag `ui.v2.dooray`)
- Phase 6: Playwright 스냅샷 + 접근성(WCAG AA) 검증

### 호환성
- 기존 Tailwind 기반 컴포넌트 대부분 그대로 동작 (토큰 이름 1:1 호환)
- 기본 팔레트 `cool-minimal`이 이전 `[data-theme='light']`와 완전 동일 → 시각 변화 최소

## [1.1.0] - 2026-04-21

### v1 피드백 반영 (버그 수정)

- **캘린더 먹통 해결**: DoorayClient에 15초 요청 타임아웃 추가, CalendarService가 에러를 silent swallow하지 않고 UI에 표시. fallback이 5개 캘린더로 제한되던 문제 제거.
- **AI "Not logged in" 개선**: Claude CLI 인증 오류를 감지하여 복구 가이드 메시지 표시. 키체인 접근 불가능한 패키징 앱을 위해 Settings에서 `ANTHROPIC_API_KEY` 직접 입력 가능.
- **브리핑 fallback 제거**: AI JSON 파싱 실패 시 의미없는 기본값 대신 명확한 에러 표시. 누락된 필드는 안전한 기본값으로 보정.

### UX 개선

- **프로젝트 사이드바 강화**: 프로젝트 6개 이상일 때 인라인 검색창 노출. 마지막 선택한 프로젝트를 저장하여 앱 재시작 시 복원.
- **위키 커스텀 순서**: 사이드바에서 위/아래 화살표로 도메인 순서 변경 가능. 설정에 저장되어 재시작 후 유지.
- **터미널 UX**: '새 터미널' 버튼을 드롭다운으로 확장 — 일반 터미널 / Claude Code / 폴더 선택 후 시작. `⌘T`/`⌘W`/`⌘1-9` 단축키 유지.
- **입력창 빨간 테두리 제거**: 브라우저 기본 `:invalid` 상태의 box-shadow/outline 글로벌 오버라이드.

### Phase 1 — AI 업무 대시보드 (신규)

- **대시보드 탭 추가**: 두레이 진입 시 기본 화면.
- **상태별 집계 카드**: 전체 / 진행 중 / 등록 / 오늘 마감 / 완료 태스크 수를 한눈에.
- **자연어 태스크 생성**: "내일까지 로그인 API 리팩토링" 같은 지시 → AI가 제목/본문 구조화 → 미리보기 확인 후 두레이에 생성.
- **오늘 집중 태스크**: 진행 중 + 오늘 마감 태스크를 통합 표시.

### Phase 2 — AI 업무 보고

- **캘린더 이벤트에 회의록 생성 버튼**: 각 이벤트 hover 시 'AI 회의록' 버튼. 클릭하면 인라인으로 회의록 템플릿 표시 + 클립보드 복사.
- 기존 일간/주간 보고서 + 위키 초안 작성 기능 유지.

### Phase 3 — Claude Code 통합 (신규)

- **태스크 상세 패널에 'AI 코드리뷰' 버튼**: 작업 폴더 선택 → git diff 읽기 → AI가 마크다운 리뷰 생성 → 두레이 태스크 코멘트로 자동 게시.
- 리뷰 섹션: 요약 / 잘된 점 / 개선 제안 / 버그·리스크.

### Phase 4 — 팀 인사이트

- **인사이트 탭 노출**: 프로젝트별 워크로드 시각화 (기존 TeamInsights 컴포넌트).

### 릴리즈/CI

- **macOS dmg 빌드 추가**: GitHub Actions `Release` 워크플로우에 `build-macos` job 추가. 태그 push 시 Windows exe와 macOS dmg가 같은 릴리즈에 업로드됨. Apple 서명 secrets가 있으면 서명, 없으면 unsigned.

## [1.0.0] - 2026-04-16

- 초기 릴리즈: Dooray + Claude Code 통합 GUI 앱 (Electron).
