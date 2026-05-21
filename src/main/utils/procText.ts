/**
 * 자식 프로세스의 stdout/stderr 텍스트 디코딩 유틸.
 *
 * 한국 Windows 콘솔에서 일부 CLI 가 cp949(euc-kr) 로 stderr 를 출력해 utf-8 디코드 시
 * `�������� �ʹ� ��ϴ�` 같이 mojibake 가 발생한다. raw Buffer 로 받아 utf-8 → euc-kr 자동
 * 폴백 디코드로 본문을 살린다. (Electron 은 full-ICU 가 번들돼 있어 TextDecoder('euc-kr')
 * 사용 가능)
 */
export function decodeProcessText(input: Buffer | string | undefined | null): string {
  if (input == null) return ''
  // string 그대로 들어온 경우 (encoding 옵션 안 쓴 execFile 콜백, 또는 테스트 mock) 패스스루.
  if (typeof input === 'string') return input
  if (input.length === 0) return ''
  const utf8 = new TextDecoder('utf-8').decode(input)
  if (process.platform !== 'win32' || !utf8.includes('�')) return utf8
  try {
    const euckr = new TextDecoder('euc-kr', { fatal: false }).decode(input)
    const utf8Bad = (utf8.match(/�/g) || []).length
    const euckrBad = (euckr.match(/�/g) || []).length
    return euckrBad < utf8Bad ? euckr : utf8
  } catch {
    return utf8
  }
}

/**
 * 사용자에게 에러로 노출하면 안 되는 비치명 stderr 메시지 패턴.
 *  - claude 의 stdin 경고 (no stdin data received, redirect stdin...)
 *  - OMC 류 플러그인의 라이프사이클 훅 실패 (SessionEnd / SessionStart / PreToolUse / PostToolUse / Stop)
 * exit code 비-0 이어도 stderr 가 전부 이 패턴이면 정상 결과로 간주한다.
 */
export const BENIGN_STDERR_RE =
  /^(warning:|if piping from|sessionend hook |sessionstart hook |pretooluse hook |posttooluse hook |stop hook )/i

/** stderr 텍스트 전체가 비치명(benign) 패턴 라인들로만 구성됐는지 검사. */
export function isBenignStderr(stderrText: string): boolean {
  const lines = stderrText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  return lines.length > 0 && lines.every((l) => BENIGN_STDERR_RE.test(l))
}
