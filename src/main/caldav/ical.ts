/**
 * iCalendar (RFC 5545) 최소 파서/빌더.
 * CalDAV 통신과 로컬 캘린더 저장에서 공통으로 사용.
 */

export interface IcalPerson {
  name?: string
  email?: string
  /** ATTENDEE 의 PARTSTAT — ACCEPTED / DECLINED / TENTATIVE / NEEDS-ACTION */
  partstat?: string
  /** ATTENDEE 의 ROLE — REQ-PARTICIPANT / OPT-PARTICIPANT 등 */
  role?: string
}

export interface IcalAlarm {
  /** TRIGGER 원본 (예: -PT15M, -P1D, 20260513T090000Z) */
  trigger: string
  /** DISPLAY / EMAIL / AUDIO 등 */
  action?: string
  description?: string
}

export interface ParsedEvent {
  uid: string
  summary: string
  description?: string
  location?: string
  /** ISO 8601 */
  start: string
  end: string
  allDay: boolean
  rrule?: string
  /** CONFIRMED / TENTATIVE / CANCELLED */
  status?: string
  organizer?: IcalPerson
  attendees?: IcalPerson[]
  alarms?: IcalAlarm[]
  url?: string
  /** CREATED 가 있으면 우선, 없으면 DTSTAMP. ISO 8601. */
  createdAt?: string
  /** RFC 5545 SEQUENCE — 일정 수정 횟수. 갱신 시 +1 해야 서버가 stale 로 무시하지 않음. */
  sequence?: number
}

export interface BuildICalInput {
  uid: string
  summary: string
  description?: string
  location?: string
  start: string
  end: string
  allDay?: boolean
  /** 기존 일정 갱신 시 CREATED 보존. 미지정 시 DTSTAMP(=현재 시각) 와 동일하게 기록. */
  createdAt?: string
  rrule?: string
  attendees?: IcalPerson[]
  organizer?: IcalPerson
  alarms?: IcalAlarm[]
  status?: string
  url?: string
  /** RFC 5545 SEQUENCE. 신규는 0, 갱신은 기존 +1. 미지정 시 0. */
  sequence?: number
}

export function parseICal(data: string): ParsedEvent | null {
  const lines = unfoldLines(data)
  const ev = extractVEvent(lines)
  if (!ev) return null
  const uid = getProp(ev, 'UID')
  const dtstart = parseDtRaw(getPropRaw(ev, 'DTSTART'))
  if (!uid || !dtstart) return null
  let dtend = parseDtRaw(getPropRaw(ev, 'DTEND'))
  // RFC 5545: 종일 이벤트의 DTEND 는 exclusive (해당 일 미포함)
  // → 내부적으로 inclusive 로 1일 빼서 저장 (UI 가 다일 막대로 잘못 그리는 것 방지)
  if (dtend && (dtstart.allDay || dtend.allDay)) {
    const d = new Date(dtend.iso)
    d.setDate(d.getDate() - 1)
    dtend = {
      iso: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T00:00:00`,
      allDay: true
    }
  }

  // ATTENDEE 여러 라인
  const attendees: IcalPerson[] = []
  for (const line of ev) {
    if (line.startsWith('ATTENDEE:') || line.startsWith('ATTENDEE;')) {
      const p = parsePersonLine(line)
      if (p) attendees.push(p)
    }
  }
  // ORGANIZER 한 라인
  const orgRaw = getPropRaw(ev, 'ORGANIZER')
  const organizer = orgRaw ? parsePersonLine(orgRaw) ?? undefined : undefined

  // VALARM 블록 (여러 개 가능)
  const alarms = extractValarms(ev)

  // CREATED 우선, fallback DTSTAMP (모든 VEVENT 는 DTSTAMP 필수)
  const createdRaw = getPropRaw(ev, 'CREATED') ?? getPropRaw(ev, 'DTSTAMP')
  const createdAt = createdRaw ? (parseDtRaw(createdRaw)?.iso) : undefined

  // SEQUENCE — 없으면 0. 갱신 시 이 값 +1 로 PUT 해야 서버가 무시하지 않음.
  const seqRaw = getProp(ev, 'SEQUENCE')
  const sequence = seqRaw && /^\d+$/.test(seqRaw.trim()) ? parseInt(seqRaw.trim(), 10) : undefined

  return {
    uid,
    summary: decodeText(getProp(ev, 'SUMMARY') ?? '(제목 없음)'),
    description: decodeTextOrUndef(getPropRaw(ev, 'DESCRIPTION')),
    location: decodeTextOrUndef(getPropRaw(ev, 'LOCATION')),
    start: dtstart.iso,
    end: dtend?.iso ?? dtstart.iso,
    allDay: dtstart.allDay || !!dtend?.allDay,
    rrule: getProp(ev, 'RRULE'),
    status: getProp(ev, 'STATUS'),
    organizer: organizer && (organizer.name || organizer.email) ? organizer : undefined,
    attendees: attendees.length > 0 ? attendees : undefined,
    alarms: alarms.length > 0 ? alarms : undefined,
    url: getProp(ev, 'URL'),
    createdAt,
    sequence
  }
}

/** `ATTENDEE;CN=홍길동;PARTSTAT=ACCEPTED:mailto:gildong@example.com` → 객체 */
function parsePersonLine(raw: string): IcalPerson | null {
  const colon = raw.indexOf(':')
  if (colon < 0) return null
  const head = raw.slice(0, colon) // ATTENDEE;CN=... 또는 ORGANIZER;CN=...
  const value = raw.slice(colon + 1)
  const email = value.replace(/^mailto:/i, '').trim() || undefined
  const cn = head.match(/CN=([^;:]+)/i)?.[1]
  const partstat = head.match(/PARTSTAT=([^;:]+)/i)?.[1]
  const role = head.match(/ROLE=([^;:]+)/i)?.[1]
  return {
    name: cn ? decodeText(cn) : undefined,
    email,
    partstat,
    role
  }
}

/** VALARM 블록들을 추출. ev 는 VEVENT 내부 라인들. */
function extractValarms(ev: string[]): IcalAlarm[] {
  const out: IcalAlarm[] = []
  let inside = false
  let cur: IcalAlarm | null = null
  for (const line of ev) {
    if (line === 'BEGIN:VALARM') { inside = true; cur = { trigger: '' } }
    else if (line === 'END:VALARM') {
      if (cur && cur.trigger) out.push(cur)
      inside = false; cur = null
    }
    else if (inside && cur) {
      if (line.startsWith('TRIGGER')) {
        const c = line.indexOf(':')
        if (c >= 0) cur.trigger = line.slice(c + 1)
      }
      else if (line.startsWith('ACTION:')) cur.action = line.slice('ACTION:'.length)
      else if (line.startsWith('DESCRIPTION:')) cur.description = decodeText(line.slice('DESCRIPTION:'.length))
    }
  }
  return out
}

export function buildICal(input: BuildICalInput): string {
  const allDay = !!input.allDay
  /** 시간 포함 이벤트: UTC Z 표기 (CalDAV 표준). */
  const fmtTimed = (iso: string): string => {
    const d = new Date(iso)
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  }
  /**
   * 종일 이벤트: 사용자가 의도한 "달력상 날짜" 를 보존해야 함.
   * 로컬 자정 ISO 를 UTC 로 변환한 ISO 가 들어오면 getUTCDate() 는 KST 기준 하루 빠진 값을 반환 → off-by-one.
   * 따라서 로컬 일자 (Date getter) 로 추출. dayOffset 으로 RFC 5545 의 DTEND exclusive 규칙(+1일) 적용.
   */
  const fmtAllDay = (iso: string, dayOffset = 0): string => {
    const d = new Date(iso)
    if (dayOffset !== 0) d.setDate(d.getDate() + dayOffset)
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
  }
  const dtstart = allDay ? `DTSTART;VALUE=DATE:${fmtAllDay(input.start)}` : `DTSTART:${fmtTimed(input.start)}`
  // DTEND: 종일은 exclusive → 사용자 의도 종료일 + 1일
  const dtend = allDay ? `DTEND;VALUE=DATE:${fmtAllDay(input.end, 1)}` : `DTEND:${fmtTimed(input.end)}`
  const dtstamp = fmtTimed(new Date().toISOString())
  // CREATED: 신규는 DTSTAMP 와 동일, 업데이트는 입력값 보존
  const created = input.createdAt ? fmtTimed(input.createdAt) : dtstamp
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Clauday//CalDAV 1.5//EN',
    'BEGIN:VEVENT',
    `UID:${input.uid}`,
    `DTSTAMP:${dtstamp}`,
    `CREATED:${created}`,
    // LAST-MODIFIED + SEQUENCE: 갱신 시 서버가 stale 로 무시하지 않도록 필수.
    // 두레이 CalDAV 는 SEQUENCE 가 기존보다 크지 않으면 PUT 을 받아도(2xx) 본문 변경을 적용하지 않음.
    `LAST-MODIFIED:${dtstamp}`,
    `SEQUENCE:${input.sequence ?? 0}`,
    dtstart,
    dtend,
    `SUMMARY:${escapeText(input.summary)}`
  ]
  if (input.location) lines.push(`LOCATION:${escapeText(input.location)}`)
  if (input.description) lines.push(`DESCRIPTION:${escapeText(input.description)}`)
  if (input.status) lines.push(`STATUS:${input.status}`)
  if (input.url) lines.push(`URL:${input.url}`)
  if (input.rrule) lines.push(`RRULE:${input.rrule}`)
  if (input.organizer && (input.organizer.name || input.organizer.email)) {
    const parts: string[] = []
    if (input.organizer.name) parts.push(`CN=${escapeText(input.organizer.name)}`)
    if (input.organizer.partstat) parts.push(`PARTSTAT=${input.organizer.partstat}`)
    if (input.organizer.role) parts.push(`ROLE=${input.organizer.role}`)
    lines.push(`ORGANIZER${parts.length ? ';'+parts.join(';') : ''}:mailto:${input.organizer.email || ''}`)
  }
  if (input.attendees) {
    for (const att of input.attendees) {
      if (!att.email && !att.name) continue
      const parts: string[] = []
      if (att.name) parts.push(`CN=${escapeText(att.name)}`)
      if (att.partstat) parts.push(`PARTSTAT=${att.partstat}`)
      if (att.role) parts.push(`ROLE=${att.role}`)
      lines.push(`ATTENDEE${parts.length ? ';'+parts.join(';') : ''}:mailto:${att.email || ''}`)
    }
  }
  if (input.alarms) {
    for (const alm of input.alarms) {
      lines.push('BEGIN:VALARM')
      lines.push(`TRIGGER:${alm.trigger}`)
      if (alm.action) lines.push(`ACTION:${alm.action}`)
      if (alm.description) lines.push(`DESCRIPTION:${escapeText(alm.description)}`)
      lines.push('END:VALARM')
    }
  }
  lines.push('END:VEVENT', 'END:VCALENDAR')
  return lines.join('\r\n')
}

/**
 * 기존 VEVENT 의 DTSTART/DTEND/DTSTAMP 만 교체한 새 ICS 문자열을 만든다.
 * ATTENDEE/RRULE/VALARM 등 다른 필드는 그대로 보존 — 막대 드래그로 일정 시각만 변경할 때 사용.
 *
 * - allDay 면 RFC 5545 의 DTEND exclusive 규칙대로 +1일 적용
 * - 시간 이벤트는 UTC Z 표기
 * - DTSTAMP 는 현재 시각으로 갱신 (CalDAV 가 LAST-MODIFIED 와 동등하게 다룸)
 */
export function patchDateTimeInIcs(ics: string, input: { start: string; end: string; allDay: boolean }): string {
  const allDay = !!input.allDay
  const fmtTimed = (iso: string): string => {
    const d = new Date(iso)
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  }
  const fmtAllDay = (iso: string, dayOffset = 0): string => {
    const d = new Date(iso)
    if (dayOffset !== 0) d.setDate(d.getDate() + dayOffset)
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
  }
  const dtstartLine = allDay
    ? `DTSTART;VALUE=DATE:${fmtAllDay(input.start)}`
    : `DTSTART:${fmtTimed(input.start)}`
  // DTEND: 종일은 exclusive → +1일
  const dtendLine = allDay
    ? `DTEND;VALUE=DATE:${fmtAllDay(input.end, 1)}`
    : `DTEND:${fmtTimed(input.end)}`
  const dtstampLine = `DTSTAMP:${fmtTimed(new Date().toISOString())}`

  // RFC 5545 lined ICS — CRLF + line folding. 정규식으로 unfold 까지는 필요 X — DTSTART/DTEND 는 짧아 보통 fold 안 됨.
  // 그래도 라인 단위 매칭이 안전하려면 unfold 후 다시 fold... 우선 단순 형태로 처리, 향후 line fold 발생 시 보강.
  const replaceLine = (text: string, key: 'DTSTART' | 'DTEND' | 'DTSTAMP', newLine: string): string => {
    // DTSTART, DTSTART;VALUE=DATE, DTSTART;TZID=... 모두 매치 (라인 시작 ~ \r\n 또는 \n)
    const re = new RegExp(`^${key}(?:;[^:\\r\\n]*)?:[^\\r\\n]*`, 'm')
    if (re.test(text)) return text.replace(re, newLine)
    // 키가 없으면 (이상 케이스) 새 라인을 BEGIN:VEVENT 다음에 삽입
    return text.replace(/(BEGIN:VEVENT\r?\n)/, `$1${newLine}\r\n`)
  }

  let out = ics
  out = replaceLine(out, 'DTSTART', dtstartLine)
  out = replaceLine(out, 'DTEND', dtendLine)
  out = replaceLine(out, 'DTSTAMP', dtstampLine)
  return out
}

/**
 * 기존 VEVENT 의 편집 가능한 스칼라 필드(SUMMARY/DESCRIPTION/LOCATION/DTSTART/DTEND)만 교체하고,
 * 그 외 모든 속성(UID/CREATED/RRULE/ATTENDEE/VALARM/VTIMEZONE/X-DOORAY-* 등)은 **그대로 보존**한다.
 *
 * Why: buildICal 로 ICS 를 처음부터 재구성하면 우리가 모델링하지 않은 두레이 고유 속성(X-*, VTIMEZONE 등)이
 * 사라진다. 두레이 CalDAV 는 이런 lossy PUT 을 2xx 로 받아주면서도 실제 일정에는 변경을 반영하지 않는
 * 케이스가 있다(=수정이 서버에 안 먹힘). 막대 드래그(patchDateTimeInIcs)가 정상 동작하는 이유도 원본 보존이므로,
 * 상세 편집도 동일하게 "원본 patch" 방식으로 처리한다.
 *
 * - 갱신이 stale 로 무시되지 않도록 SEQUENCE +1, LAST-MODIFIED/DTSTAMP 현재 시각으로 교체.
 * - VALARM 내부의 DESCRIPTION 등은 건드리지 않는다(VEVENT top-level 속성만 교체).
 */
export function patchEventFields(
  ics: string,
  input: { summary: string; description?: string; location?: string; start: string; end: string; allDay: boolean }
): string {
  const allDay = !!input.allDay
  const fmtTimed = (iso: string): string => {
    const d = new Date(iso)
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  }
  const fmtAllDay = (iso: string, dayOffset = 0): string => {
    const d = new Date(iso)
    if (dayOffset !== 0) d.setDate(d.getDate() + dayOffset)
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
  }
  const now = fmtTimed(new Date().toISOString())
  const dtstartLine = allDay ? `DTSTART;VALUE=DATE:${fmtAllDay(input.start)}` : `DTSTART:${fmtTimed(input.start)}`
  const dtendLine = allDay ? `DTEND;VALUE=DATE:${fmtAllDay(input.end, 1)}` : `DTEND:${fmtTimed(input.end)}`

  const lines = unfoldLines(ics)
  const TOP_KEYS = ['DTSTART', 'DTEND', 'DTSTAMP', 'LAST-MODIFIED', 'SEQUENCE', 'SUMMARY', 'LOCATION', 'DESCRIPTION']
  const isTopKey = (l: string): boolean =>
    TOP_KEYS.some((k) => l === k || l.startsWith(`${k}:`) || l.startsWith(`${k};`))

  // 기존 SEQUENCE (VEVENT top-level) 추출 → +1
  let seq = 0
  {
    let inEvent = false, inAlarm = false
    for (const l of lines) {
      if (l === 'BEGIN:VEVENT') inEvent = true
      else if (l === 'END:VEVENT') inEvent = false
      else if (l === 'BEGIN:VALARM') inAlarm = true
      else if (l === 'END:VALARM') inAlarm = false
      else if (inEvent && !inAlarm && /^SEQUENCE\s*:/.test(l)) {
        const n = parseInt(l.replace(/^SEQUENCE\s*:/, '').trim(), 10)
        if (!isNaN(n)) seq = n
      }
    }
  }

  const newProps = [
    `DTSTAMP:${now}`,
    `LAST-MODIFIED:${now}`,
    `SEQUENCE:${seq + 1}`,
    dtstartLine,
    dtendLine,
    `SUMMARY:${escapeText(input.summary)}`
  ]
  if (input.location) newProps.push(`LOCATION:${escapeText(input.location)}`)
  if (input.description) newProps.push(`DESCRIPTION:${escapeText(input.description)}`)

  const out: string[] = []
  let inEvent = false, inAlarm = false
  for (const l of lines) {
    if (l === 'BEGIN:VEVENT') {
      inEvent = true
      out.push(l)
      out.push(...newProps) // VEVENT 시작 직후에 교체 속성 주입
      continue
    }
    if (l === 'END:VEVENT') { inEvent = false; out.push(l); continue }
    if (l === 'BEGIN:VALARM') { inAlarm = true; out.push(l); continue }
    if (l === 'END:VALARM') { inAlarm = false; out.push(l); continue }
    // VEVENT top-level 의 교체 대상 옛 속성만 제거 (VALARM 내부/다른 컴포넌트는 보존)
    if (inEvent && !inAlarm && isTopKey(l)) continue
    out.push(l)
  }
  // VEVENT 가 없으면 원본 그대로 반환 (이상 케이스)
  if (!out.includes('BEGIN:VEVENT')) return ics
  return out.join('\r\n')
}

/**
 * 여러 ICS(VCALENDAR/VEVENT 묶음)에서 VEVENT 블록만 추출해 단일 VCALENDAR 로 합산.
 * 캘린더 내보내기에 사용.
 */
export function bundleICal(calendarName: string, icsList: string[]): string {
  const vevents: string[] = []
  for (const ics of icsList) {
    const lines = unfoldLines(ics)
    let depth = 0
    let buf: string[] = []
    for (const line of lines) {
      if (line === 'BEGIN:VEVENT') { depth++; buf = ['BEGIN:VEVENT']; continue }
      if (depth > 0) buf.push(line)
      if (line === 'END:VEVENT') {
        if (depth === 1) vevents.push(buf.join('\r\n'))
        depth = 0
        buf = []
      }
    }
  }
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Clauday//Local Calendar 1.5//EN',
    `X-WR-CALNAME:${escapeText(calendarName)}`,
    ...vevents,
    'END:VCALENDAR'
  ].join('\r\n')
}

// ──────────────────────────────────────────────────────────────────────────

function unfoldLines(s: string): string[] {
  const raw = s.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  for (const line of raw) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length > 0) {
      out[out.length - 1] += line.slice(1)
    } else {
      out.push(line)
    }
  }
  return out
}

function extractVEvent(lines: string[]): string[] | null {
  const start = lines.indexOf('BEGIN:VEVENT')
  if (start < 0) return null
  const end = lines.findIndex((l, i) => i > start && l === 'END:VEVENT')
  if (end < 0) return null
  return lines.slice(start + 1, end)
}

function getPropRaw(lines: string[], name: string): string | undefined {
  return lines.find((l) => l === name || l.startsWith(`${name}:`) || l.startsWith(`${name};`))
}

function getProp(lines: string[], name: string): string | undefined {
  const raw = getPropRaw(lines, name)
  if (!raw) return undefined
  const colon = raw.indexOf(':')
  return colon >= 0 ? raw.slice(colon + 1) : undefined
}

function decodeText(s: string): string {
  return s
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
}

function decodeTextOrUndef(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  const i = raw.indexOf(':')
  if (i < 0) return undefined
  return decodeText(raw.slice(i + 1))
}

function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')
}

function parseDtRaw(raw: string | undefined): { iso: string; allDay: boolean } | null {
  if (!raw) return null
  const colon = raw.indexOf(':')
  if (colon < 0) return null
  const head = raw.slice(0, colon)
  const value = raw.slice(colon + 1)
  const isDate = /VALUE=DATE(?!-)/i.test(head) || /^\d{8}$/.test(value)
  if (isDate) {
    const y = value.slice(0, 4), m = value.slice(4, 6), d = value.slice(6, 8)
    return { iso: `${y}-${m}-${d}T00:00:00`, allDay: true }
  }
  const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/)
  if (!m) return null
  const [, Y, Mo, D, H, Mi, S, Z] = m
  return { iso: `${Y}-${Mo}-${D}T${H}:${Mi}:${S}${Z ? 'Z' : ''}`, allDay: false }
}

function pad(n: number): string { return String(n).padStart(2, '0') }
