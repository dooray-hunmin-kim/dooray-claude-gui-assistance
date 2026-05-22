export type FeedbackCategory = 'bug' | 'feature' | 'improvement'

export interface FeedbackPayload {
  category: FeedbackCategory
  subject: string          // 한 줄 제목
  userNote: string         // 사용자 본문
  diagnostic?: string      // bug 카테고리만. ErrorReportService.collect() 의 body
  appVersion: string       // main 에서 자동 채움
  platform: NodeJS.Platform  // main 에서 자동
  userEmail?: string       // 두레이 토큰의 본인 이메일 (있으면)
}

export interface FeedbackSubmitResult {
  ok: boolean
  error?: string
  /** 미설정 / 빈 환경변수 등 클라이언트 측 사유 */
  reason?: 'hook-url-missing' | 'network-error' | 'http-error'
}
