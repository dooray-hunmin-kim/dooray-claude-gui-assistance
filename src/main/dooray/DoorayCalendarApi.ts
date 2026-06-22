import type { DoorayClient } from './DoorayClient'

/**
 * 두레이 네이티브 캘린더 REST API 클라이언트 (api.dooray.com).
 *
 * Why: 두레이 CalDAV 는 읽기(GET/REPORT/PROPFIND)·삭제(DELETE)만 백엔드로 라우팅하고,
 * PUT(생성/수정)은 웹앱이 가로채 200 빈 응답으로 무시한다(=일정 수정이 서버에 반영 안 됨).
 * 따라서 일정 생성/수정은 CalDAV 가 아니라 이 네이티브 REST API 로 처리한다.
 * (검증: PUT /calendar/v1/calendars/{calId}/events/{eventId} 로 제목 변경이 실제 반영됨)
 */
export interface DoorayCalendarEventDetail {
  id: string
  subject: string
  location?: string
  wholeDayFlag: boolean
  startedAt: string
  endedAt: string
  body?: { mimeType?: string; content?: string }
  personalSettings?: { busy?: boolean; class?: 'public' | 'private' }
}

export interface DoorayCalendarEventInput {
  summary: string
  description?: string
  location?: string
  /** ISO 8601 (UTC Z 또는 offset 포함) */
  start: string
  end: string
  allDay: boolean
}

/** CalDAV 캘린더 URL 의 마지막 경로 세그먼트가 두레이 calendarId 다.
 *  예: https://caldav.dooray.com/caldav/{tenant}/{member}/calendars/3533031635679666602/ → 3533031635679666602 */
export function calendarIdFromCalDavUrl(calendarUrl: string): string | null {
  try {
    const u = new URL(calendarUrl)
    const segs = u.pathname.split('/').filter(Boolean)
    const last = segs[segs.length - 1]
    return last && /^\d+$/.test(last) ? last : null
  } catch {
    return null
  }
}

/** CalDAV UID "4360286479535126910@dooray.com" → eventId "4360286479535126910" */
export function eventIdFromUid(uid: string): string | null {
  if (!uid) return null
  const id = uid.split('@')[0].trim()
  return /^\d+$/.test(id) ? id : null
}

/** ISO → 두레이가 기대하는 KST(+09:00) 로컬 시각 문자열. */
function toKstOffsetString(iso: string): string {
  const d = new Date(iso)
  const kst = new Date(d.getTime() + 9 * 3600 * 1000) // UTC+9
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${kst.getUTCFullYear()}-${p(kst.getUTCMonth() + 1)}-${p(kst.getUTCDate())}T${p(kst.getUTCHours())}:${p(kst.getUTCMinutes())}:${p(kst.getUTCSeconds())}+09:00`
}

interface DoorayItemResponse<T> { header: { isSuccessful: boolean; resultMessage?: string }; result: T }

export class DoorayCalendarApi {
  constructor(private readonly client: DoorayClient) {}

  /** 이벤트 상세 — 수정 시 personalSettings/body 보존용으로 먼저 조회. */
  async getEventDetail(calendarId: string, eventId: string): Promise<DoorayCalendarEventDetail | null> {
    try {
      const res = await this.client.request<DoorayItemResponse<DoorayCalendarEventDetail>>(
        `/calendar/v1/calendars/${calendarId}/events/${eventId}`
      )
      return res.result ?? null
    } catch (e) {
      console.warn('[DoorayCalendarApi] getEventDetail 실패:', e instanceof Error ? e.message : e)
      return null
    }
  }

  /**
   * 일정 수정 — 기존 상세를 받아 personalSettings/users 를 보존하고 편집 필드만 덮어쓴다.
   * @returns 성공 여부
   */
  async updateEvent(calendarId: string, eventId: string, input: DoorayCalendarEventInput): Promise<void> {
    const detail = await this.getEventDetail(calendarId, eventId)
    const payload = {
      // 본인 일정 단독이면 to/cc 는 비움 (검증된 형태). 참석자 보존은 추후 확장.
      users: { to: [], cc: [] },
      subject: input.summary,
      body: {
        mimeType: 'text/x-markdown',
        content: input.description ?? detail?.body?.content ?? ''
      },
      startedAt: toKstOffsetString(input.start),
      endedAt: toKstOffsetString(input.end),
      wholeDayFlag: input.allDay,
      location: input.location ?? detail?.location ?? '',
      personalSettings: {
        busy: detail?.personalSettings?.busy ?? true,
        class: detail?.personalSettings?.class ?? 'public'
      }
    }
    const res = await this.client.request<DoorayItemResponse<unknown>>(
      `/calendar/v1/calendars/${calendarId}/events/${eventId}`,
      { method: 'PUT', body: JSON.stringify(payload) }
    )
    if (!res.header?.isSuccessful) {
      throw new Error(`두레이 일정 수정 실패: ${res.header?.resultMessage || '알 수 없는 오류'}`)
    }
    console.log('[DoorayCalendarApi] updateEvent OK', calendarId, eventId)
  }
}
