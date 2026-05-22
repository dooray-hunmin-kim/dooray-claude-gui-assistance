# domain-electron-ipc.md — IPC 채널 추가 및 관리

## IPC 추가 3 단계

새 IPC 채널을 추가할 때는 **반드시 3 곳 동기화**해야 합니다:

### 1️⃣ shared/types/ipc.ts — 채널 상수 정의

```typescript
export const IPC_CHANNELS = {
  // 기존 채널들...
  NEW_FEATURE: 'clauday:new-feature' as const,
} as const;

export type IpcChannels = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS];
```

### 2️⃣ preload/index.ts — contextBridge 로 노출

```typescript
contextBridge.exposeInMainWorld('api', {
  // 기존 메서드들...
  newFeature: {
    doSomething: (arg: string) => ipcRenderer.invoke(IPC_CHANNELS.NEW_FEATURE, arg),
  },
});
```

### 3️⃣ src/main/index.ts — ipcMain.handle 등록

```typescript
ipcMain.handle(IPC_CHANNELS.NEW_FEATURE, async (event, arg: string) => {
  // 구현
  return result;
});
```

---

## ⚠️ 함정

### 1. 3 곳 중 한 곳 빠뜨림
→ renderer 에서 `window.api.newFeature` undefined 또는 IPC 채널 불일치

### 2. 타입 정의 누락
→ TypeScript 에러 또는 런타임 타입 불일치

### 3. 비동기 처리 누락
```typescript
// ❌ preload 에서 sync 처럼 작성
doSomething: (arg) => ipcRenderer.send(IPC_CHANNELS.NEW_FEATURE, arg)

// ✅ invoke 로 응답 받기
doSomething: (arg) => ipcRenderer.invoke(IPC_CHANNELS.NEW_FEATURE, arg)
```

---

## 테스트 필수

IPC 핸들러는 vitest 로 테스트하되, 핵심 로직은 순수 함수로 분리:

```typescript
// ❌ 직접 테스트 어려움
ipcMain.handle('channel', async (event, arg) => {
  // Electron 의존 로직
});

// ✅ 테스트 가능
export function processFeature(arg: string): Result {
  // 순수 로직
}

ipcMain.handle('channel', async (event, arg) => {
  return processFeature(arg);
});
```

---

## 체크리스트

- [ ] `shared/types/ipc.ts` 에 채널 상수 추가
- [ ] `preload/index.ts` 에서 contextBridge 노출
- [ ] `main/index.ts` 에서 ipcMain.handle 등록
- [ ] 타입 정의 일관성 확인
- [ ] vitest 테스트 추가 (핵심 로직 분리)
