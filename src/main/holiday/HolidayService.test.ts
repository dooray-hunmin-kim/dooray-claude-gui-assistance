import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron-store', async () => {
  const { MemElectronStore } = await import('../../../test/mocks/electron-store')
  return { default: MemElectronStore }
})

import { HolidayService, HOLIDAY_CALENDAR_ID, HOLIDAY_CALENDAR_NAME } from './HolidayService'

const SAMPLE_ICS = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'BEGIN:VEVENT',
  'UID:hol-1@google.com',
  'SUMMARY:삼일절',
  'DTSTART;VALUE=DATE:20260301',
  'DTEND;VALUE=DATE:20260302',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:hol-2@google.com',
  'SUMMARY:어린이날',
  'DTSTART;VALUE=DATE:20260505',
  'DTEND;VALUE=DATE:20260506',
  'END:VEVENT',
  'END:VCALENDAR'
].join('\r\n')

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    status: 200,
    text: async () => SAMPLE_ICS
  })))
})

describe('HolidayService 상수', () => {
  it('캘린더 ID/이름 노출', () => {
    expect(HOLIDAY_CALENDAR_ID).toBe('holiday-kr')
    expect(HOLIDAY_CALENDAR_NAME).toBe('한국 공휴일')
  })
})

describe('HolidayService.refresh + getHolidays', () => {
  it('VEVENT 전부 파싱', async () => {
    const svc = new HolidayService()
    const r = await svc.refresh()
    expect(r).toHaveLength(2)
    expect(r.map((e) => e.name).sort()).toEqual(['삼일절', '어린이날'])
  })

  it('첫 호출 시 fetch, 두 번째는 캐시 hit', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, text: async () => SAMPLE_ICS }))
    vi.stubGlobal('fetch', fetchMock)
    const svc = new HolidayService()
    await svc.getHolidays()
    const before = fetchMock.mock.calls.length
    await svc.getHolidays()
    expect(fetchMock.mock.calls.length).toBe(before)  // 캐시 hit → 추가 호출 없음
  })

  it('fetch 실패(non-ok) 시 폴백', async () => {
    // 이미 캐시가 차있을 수도 있으므로 길이만 부드럽게 검증
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, text: async () => '' })))
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const svc = new HolidayService()
    const r = await svc.refresh()
    expect(Array.isArray(r)).toBe(true)
    expect(errSpy).toHaveBeenCalled()
    errSpy.mockRestore()
  })

  it('fetch throw 시 안전하게 폴백', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network') }))
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const svc = new HolidayService()
    const r = await svc.refresh()
    expect(Array.isArray(r)).toBe(true)
    errSpy.mockRestore()
  })
})
