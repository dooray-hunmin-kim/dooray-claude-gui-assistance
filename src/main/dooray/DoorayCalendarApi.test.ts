import { describe, it, expect } from 'vitest'
import { calendarIdFromCalDavUrl, eventIdFromUid } from './DoorayCalendarApi'

describe('calendarIdFromCalDavUrl', () => {
  it('CalDAV 캘린더 URL 마지막 세그먼트를 calendarId 로 추출 (trailing slash)', () => {
    expect(
      calendarIdFromCalDavUrl('https://caldav.dooray.com/caldav/138/353/calendars/3533031635679666602/')
    ).toBe('3533031635679666602')
  })
  it('trailing slash 없는 경우도 처리', () => {
    expect(
      calendarIdFromCalDavUrl('https://caldav.dooray.com/caldav/138/353/calendars/2094093772519724691')
    ).toBe('2094093772519724691')
  })
  it('숫자가 아닌 마지막 세그먼트면 null', () => {
    expect(calendarIdFromCalDavUrl('https://caldav.dooray.com/caldav/138/353/calendars/inbox/')).toBeNull()
  })
  it('잘못된 URL 이면 null', () => {
    expect(calendarIdFromCalDavUrl('not-a-url')).toBeNull()
  })
})

describe('eventIdFromUid', () => {
  it('@dooray.com 접미사를 떼고 eventId 추출', () => {
    expect(eventIdFromUid('4360286479535126910@dooray.com')).toBe('4360286479535126910')
  })
  it('@ 없는 숫자 UID 도 그대로', () => {
    expect(eventIdFromUid('4360286479535126910')).toBe('4360286479535126910')
  })
  it('숫자가 아니면 null (클라이언트 생성 로컬 UID 등)', () => {
    expect(eventIdFromUid('1718000000000-ab12cd34@clauday')).toBeNull()
    expect(eventIdFromUid('')).toBeNull()
  })
})
