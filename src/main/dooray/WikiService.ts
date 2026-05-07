import { DoorayClient } from './DoorayClient'
import type { DoorayWikiPage, DoorayWikiUpdateParams } from '../../shared/types/dooray'

interface DoorayListResponse<T> {
  header: { resultCode: number; isSuccessful: boolean }
  result: T[]
  totalCount: number
}

interface DoorayItemResponse<T> {
  header: { resultCode: number; isSuccessful: boolean }
  result: T
}

interface WikiDomain {
  id: string
  name: string
  type: string
}

export class WikiService {
  private domainsCache: { data: WikiDomain[]; timestamp: number } | null = null
  private pageListCache = new Map<string, { pages: DoorayWikiPage[]; timestamp: number }>()
  private static LIST_TTL = 3 * 60 * 1000 // 3분

  constructor(private client: DoorayClient) {}

  /**
   * 위키 상세 — root page ID 등 listDomains 응답에 포함되지 않는 필드까지 받아온다.
   * Why: NHN Dooray 위키 API 는 page 생성·조회 모두 parentPageId 가 필수라, 위키의 home/root
   * 페이지 ID 를 알아야 그 아래에 컨테이너를 만들 수 있다.
   */
  async getDetail(wikiId: string): Promise<Record<string, unknown>> {
    const res = await this.client.request<DoorayItemResponse<Record<string, unknown>>>(
      `/wiki/v1/wikis/${wikiId}`
    )
    return res.result || {}
  }

  // 접근 가능한 위키 도메인 목록 — 페이지네이션 끝까지, 중복 dedup, 빈 결과는 캐시 안 함.
  // Why: 두레이 사이드바엔 보이지만 첫 페이지에 안 잡히는 위키들이 있다 (개인 프로젝트, 비활성화/grey 상태 등).
  // 안전하게 모든 페이지를 받고, 가능하면 scope 변형도 합쳐서 누락 최소화.
  async listDomains(): Promise<WikiDomain[]> {
    if (this.domainsCache && Date.now() - this.domainsCache.timestamp < WikiService.LIST_TTL) {
      return this.domainsCache.data
    }

    const PAGE_SIZE = 100
    const MAX_PAGES = 10 // 위키 1000 개까지
    const seen = new Set<string>()
    const all: WikiDomain[] = []

    const fetchAllPages = async (queryBase: string): Promise<void> => {
      for (let page = 0; page < MAX_PAGES; page++) {
        const url = `/wiki/v1/wikis?${queryBase}size=${PAGE_SIZE}&page=${page}`
        let res: DoorayListResponse<WikiDomain>
        try {
          res = await this.client.request<DoorayListResponse<WikiDomain>>(url)
        } catch {
          break
        }
        const pageItems = res.result || []
        const total = res.totalCount ?? pageItems.length
        for (const w of pageItems) {
          if (!seen.has(w.id)) {
            seen.add(w.id)
            all.push(w)
          }
        }
        if (pageItems.length === 0) break
        if (all.length >= total && total > 0) break
      }
    }

    await fetchAllPages('')
    // 일부 두레이 인스턴스는 scope 별로 분리된 결과를 주는 케이스 대비 — 중복은 dedup
    await fetchAllPages('scope=member&')
    await fetchAllPages('scope=public&')
    await fetchAllPages('scope=private&')

    if (all.length > 0) {
      this.domainsCache = { data: all, timestamp: Date.now() }
    }
    return all
  }

  // 위키 페이지 목록 (병렬 페이지네이션 + TTL 캐시)
  async list(wikiId: string, parentPageId?: string): Promise<DoorayWikiPage[]> {
    const cacheKey = `${wikiId}|${parentPageId || 'root'}`
    const cached = this.pageListCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < WikiService.LIST_TTL) {
      return cached.pages
    }

    const size = 100
    const MAX_PAGES = 5
    const baseParams = parentPageId ? `parentPageId=${parentPageId}&` : ''

    // 첫 페이지로 totalCount 확인
    const firstRes = await this.client.request<DoorayListResponse<DoorayWikiPage>>(
      `/wiki/v1/wikis/${wikiId}/pages?${baseParams}size=${size}&page=0`
    ).catch(() => ({ header: { resultCode: 0, isSuccessful: false }, result: [], totalCount: 0 }))

    const firstPageItems = firstRes.result || []
    const totalCount = firstRes.totalCount || firstPageItems.length
    const totalPages = Math.min(MAX_PAGES, Math.ceil(totalCount / size))

    // 나머지 페이지 병렬 호출
    const remaining: number[] = []
    for (let p = 1; p < totalPages; p++) remaining.push(p)

    const rest = await Promise.all(
      remaining.map((page) =>
        this.client.request<DoorayListResponse<DoorayWikiPage>>(
          `/wiki/v1/wikis/${wikiId}/pages?${baseParams}size=${size}&page=${page}`
        ).catch(() => ({ header: { resultCode: 0, isSuccessful: false }, result: [], totalCount: 0 }))
      )
    )

    const allPages: DoorayWikiPage[] = [...firstPageItems]
    for (const r of rest) {
      if (r.result) allPages.push(...r.result)
    }

    this.pageListCache.set(cacheKey, { pages: allPages, timestamp: Date.now() })
    return allPages
  }

  /**
   * 단일 페이지(최대 size 개) 만 1회 호출로 가져옴 — 페이지네이션 안 함.
   * Why: WikiStorage 처럼 "root 직속 자식만 빠르게 한 번 본다" 류 케이스용. 캐시도 안 씀.
   * @param subject 정확 제목 매칭 시 server-side filter 시도. Dooray 가 `subject` 쿼리를
   *                지원하지 않으면 무시되므로 호출자가 결과에서 다시 한번 비교한다.
   */
  async listSinglePage(
    wikiId: string,
    parentPageId: string,
    opts: { size?: number; subject?: string } = {}
  ): Promise<DoorayWikiPage[]> {
    const size = opts.size ?? 100
    const params = new URLSearchParams()
    params.set('parentPageId', parentPageId)
    params.set('size', String(size))
    params.set('page', '0')
    if (opts.subject) params.set('subject', opts.subject)
    const res = await this.client.request<DoorayListResponse<DoorayWikiPage>>(
      `/wiki/v1/wikis/${wikiId}/pages?${params.toString()}`
    )
    return res.result || []
  }

  /**
   * 위키의 top-level (root) 페이지 목록 — Dooray API 의 quirk: query param 을 하나도 안 붙여야
   * top-level 을 돌려준다. parentPageId 미지정 + size/page 도 안 붙이는 게 핵심.
   * (parentPageId 빼고 size=100&page=0 만 붙이면 400 "입력한 내용에 오류가 있습니다" 가 떨어짐.)
   */
  async getTopLevelPages(wikiId: string): Promise<DoorayWikiPage[]> {
    const res = await this.client.request<DoorayListResponse<DoorayWikiPage>>(
      `/wiki/v1/wikis/${wikiId}/pages`
    )
    return res.result || []
  }

  // 특정 페이지 내용 조회
  async get(wikiId: string, pageId: string): Promise<DoorayWikiPage> {
    const res = await this.client.request<DoorayItemResponse<DoorayWikiPage>>(
      `/wiki/v1/wikis/${wikiId}/pages/${pageId}`
    )
    return res.result
  }

  // 새 위키 페이지 생성 (parentPageId 아래 하위 페이지)
  async create(params: { wikiId: string; parentPageId?: string; subject: string; body: string }): Promise<{ id: string }> {
    const res = await this.client.request<DoorayItemResponse<{ id: string }>>(
      `/wiki/v1/wikis/${params.wikiId}/pages`,
      {
        method: 'POST',
        body: JSON.stringify({
          parentPageId: params.parentPageId,
          subject: params.subject,
          body: { mimeType: 'text/x-markdown', content: params.body }
        })
      }
    )
    // 목록 캐시 무효화
    this.pageListCache.clear()
    return { id: res.result.id }
  }

  /** 위키 페이지 hard delete. Dooray 가 지원하면 그대로 삭제, 미지원이면 throw — 호출자가 fallback 처리. */
  async deletePage(wikiId: string, pageId: string): Promise<void> {
    await this.client.request(
      `/wiki/v1/wikis/${wikiId}/pages/${pageId}`,
      { method: 'DELETE' }
    )
    this.pageListCache.clear()
  }

  // 제목 재설정 — 소프트 삭제 fallback 또는 페이지 이름 변경용
  async renameTitle(wikiId: string, pageId: string, subject: string): Promise<void> {
    await this.client.request(
      `/wiki/v1/wikis/${wikiId}/pages/${pageId}/title`,
      {
        method: 'PUT',
        body: JSON.stringify({ subject })
      }
    )
    this.pageListCache.clear()
  }

  // 페이지 수정 - dooray API는 제목/내용을 분리 업데이트
  async update(params: DoorayWikiUpdateParams): Promise<void> {
    // 제목 업데이트
    if (params.title) {
      await this.client.request(
        `/wiki/v1/wikis/${params.projectId}/pages/${params.pageId}/title`,
        {
          method: 'PUT',
          body: JSON.stringify({ subject: params.title })
        }
      )
    }

    // 내용 업데이트
    if (params.body) {
      await this.client.request(
        `/wiki/v1/wikis/${params.projectId}/pages/${params.pageId}/content`,
        {
          method: 'PUT',
          body: JSON.stringify({
            body: {
              mimeType: 'text/x-markdown',
              content: params.body
            }
          })
        }
      )
    }
    // 캐시 무효화 (수정된 페이지의 목록 캐시 제거)
    this.pageListCache.clear()
  }
}
