import { Workflow } from 'lucide-react'
import { EmptyView } from '../common/StateViews'

interface HarnessStudioViewProps {
  active?: boolean
}

/**
 * Harness Studio 진입점 뷰 (M0 스캐폴드).
 *
 * M4 Import 위저드 구현 전까지는 빈 상태 안내만 표시한다.
 * active prop 은 다른 뷰와 동일한 시그니처를 맞추기 위해 받는다(현재 미사용).
 */
export default function HarnessStudioView({ active: _active = true }: HarnessStudioViewProps): JSX.Element {
  return (
    <div className="flex flex-col h-full bg-bg-primary">
      {/* 헤더 */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-bg-border bg-bg-surface flex-shrink-0">
        <Workflow size={16} className="text-clauday-blue" />
        <h1 className="text-sm font-semibold text-text-primary">Harness Studio</h1>
        <span className="ds-chip neutral ml-1">미리보기</span>
      </div>

      {/* 빈 상태 */}
      <div className="flex-1 flex items-center justify-center">
        <EmptyView
          icon={Workflow}
          title="하니스를 import 하세요"
          description={
            '분석할 bmad 번들 폴더를 선택하면\n' +
            '에이전트 구조, 레벨 체인, 게이트, 산출물을\n' +
            '한눈에 시각화해 드립니다.\n\n' +
            'Import 기능은 다음 업데이트에서 제공됩니다.'
          }
        />
      </div>
    </div>
  )
}
