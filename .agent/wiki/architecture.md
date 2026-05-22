# Clauday 아키텍처 개요

## 기술 스택

- **런타임**: Electron 33 (Chromium + Node)
- **UI**: React 18 + TypeScript + TailwindCSS
- **터미널**: node-pty (main) + @xterm/xterm (renderer)
- **저장소**: electron-store, keytar (OS keychain)
- **외부 연동**: 두레이 REST API, CalDAV, Claude Code CLI

## 디렉터리 구조

```
src/
├── main/          # Electron main process
│   ├── ai/        # AIService (Anthropic 라우팅)
│   ├── dooray/    # 두레이 연동 (멘션, Socket Mode)
│   ├── terminal/  # TerminalManager (node-pty)
│   ├── claude/   # Claude Code 세션 관리
│   └── index.ts   # IPC 핸들러 등록
├── preload/       # contextBridge IPC 노출
├── renderer/      # React UI
└── shared/        # 공통 타입 (IPC 채널 등)
```

## 핵심 분기: AIService.runClaudeStream

⚠️ **Windows 와 Mac 이 다른 경로를 탐니다** — 한쪽만 보고 변경 금지.

| 플랫폼 | spawn 옵션 | system prompt |
|--------|-----------|---------------|
| Mac/Linux | `shell: false` | `--append-system-prompt` argv 전달 |
| Windows | `shell: true, windowsVerbatimArguments: true` | stdin 으로 병합 (cmd 파싱 충돌 회피) |

자세한 건 [[domain-ai-service]] 참조.

## IPC 패턴

1. `shared/types/ipc.ts` 에 채널 상수 정의
2. `preload/index.ts` 에서 contextBridge 로 노출
3. `main/index.ts` 에서 `ipcMain.handle` 등록

자세한 건 [[domain-electron-ipc]] 참조.

## Definition of Done (DOD)

1. ✅ 테스트 코드 (vitest, 70% 커버리지)
2. ✅ 매뉴얼 업데이트 (`ClaudeManual.tsx` SECTIONS)
3. ✅ 품질 게이트 통과 (`tsc --noEmit`, `npm test`, `npm run build`)
