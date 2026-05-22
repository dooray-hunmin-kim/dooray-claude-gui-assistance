# domain-ai-service.md — AIService.runClaudeStream 플랫폼 분기 가이드

## ⚠️ 핵심 함정: Windows / Mac 분기

`AIService.runClaudeStream` 은 **의도적으로 플랫폼별로 다른 경로**를 탑니다.  
한쪽만 보고 "일관성" 명목으로 통일하면 다른 쪽이 깨집니다.

---

## Mac / Linux 경로 (정상)

```typescript
spawn(CLAUDE_CLI, argv, { shell: false })
// argv: [..., '--append-system-prompt', '<content>', '--output-format', 'stream-json']
```

- `shell: false` — 직접 실행
- `--append-system-prompt` argv 로 전달 → claude 시스템 프롬프트 캐싱 적용
- 결과: stream-json 정상 수신 → 구조화 카드 표시

---

## Windows 경로

```typescript
spawn(CLAUDE_CLI, argv, { 
  shell: true, 
  windowsVerbatimArguments: true 
})
// argv: [...] (--append-system-prompt 제거)
// stdin: "[시스템 지시]\n{system prompt}\n\n---\n\n[사용자 요청]\n{user prompt}"
```

- `shell: true` — `claude.cmd` 실행 위해 cmd 경유
- `windowsVerbatimArguments: true` — codepage 변환 차단 (한글 mojibake 방지)
- `--append-system-prompt` 제거 → stdin 으로 병합 (cmd 파싱 충돌 회피)
- 트레이드오프: 시스템 프롬프트 캐싱 효과 상실 (하지만 응답은 정상)

---

## 자주 무너지는 함정

### 1. "양쪽 일관성"의 함정
> "이게 더 깔끔하니까 Mac 도 stdin 으로 통일하자"

❌ Mac 의 캐싱 이점을 깨뜨림. Windows 와 Mac 은 **서로 다른 동기로 다른 경로**를 탐니다.

### 2. 테스트 한쪽만
```typescript
// ❌ Mac 으로만 도는 테스트 → Windows 경로 검증 안 됨
// ✅ 양쪽 케이스 명시
Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
```

### 3. shell:true 의존성
Windows 의 `shell: true` 는 cmd.exe 가 끼는데, 이게 codepage / 명령줄 한계 / argv escape 문제를 만듭니다.  
shell 옵션 변경은 영향 광범위 — 대신 stdin 사용량을 늘리는 방향으로.

### 4. 진단 로그 잊기
모든 호출은 `cliLogger` 로 진단 로그를 남깁니다. 새 분기 추가 시 platform/argv 가 로그에 자연스럽게 남는지 확인하세요.

---

## 관련 변경 이력

| 버전 | 변경 내용 |
|------|----------|
| v1.5.2 | prompt 본문 → stdin (양쪽 공통, 명령줄 8KB 한계 회피) |
| v1.5.4 | raw stdout fallback (stream-json 못 받아도 본문 살림) |
| v1.5.5 | Windows 한정 `--append-system-prompt` → stdin combine |

---

## 체크리스트 (변경 전 필수)

- [ ] Mac 경로에서 `--append-system-prompt` 유지 확인
- [ ] Windows 경로에서 stdin 병합 유지 확인
- [ ] vitest 테스트에 양쪽 플랫폼 케이스 포함
- [ ] `cliLogger` 진단 로그에 platform/argv 노출 확인
