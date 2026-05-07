/**
 * 사용자가 따로 등록하지 않아도 기본으로 노출되는 위키 저장소.
 * Why: 첫 진입 시 빈 상태가 되지 않게 Clauday 위키를 미리 깔아둔다.
 *
 * parentPageId 는 root 자동 탐색이 실패하는 위키에 한해 직접 박아둘 때만 사용.
 * 정상 동작하는 위키는 비워두면 `getTopLevelPages` 로 자동 발견됨.
 */
export interface DefaultWikiEntry {
  wikiId: string
  wikiName: string
  parentPageId?: string
}

export const DEFAULT_WIKIS: DefaultWikiEntry[] = [
  { wikiId: '4312559241344624232', wikiName: 'Clauday' }
]
