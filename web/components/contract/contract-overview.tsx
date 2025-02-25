import { ReactNode, memo, useState, useEffect, useRef } from 'react'
import clsx from 'clsx'

import { Bet } from 'common/bet'
import { HistoryPoint, MultiPoints } from 'common/chart'
import {
  BinaryContract,
  CPMMStonkContract,
  Contract,
  MultiContract,
  NumericContract,
  PseudoNumericContract,
  isBinaryMulti,
  CPMMMultiContract,
  getMainBinaryMCAnswer,
  CPMMNumericContract,
  BountiedQuestionContract,
} from 'common/contract'
import { NumericContractChart } from '../charts/contract/numeric'
import {
  BinaryContractChart,
  MultiBinaryChart,
} from '../charts/contract/binary'
import { ChoiceContractChart, getVersusColor } from '../charts/contract/choice'
import { PseudoNumericContractChart } from '../charts/contract/pseudo-numeric'
import {
  BinaryResolutionOrChance,
  MultiNumericResolutionOrExpectation,
  NumericResolutionOrExpectation,
  PseudoNumericResolutionOrExpectation,
  StonkPrice,
} from 'web/components/contract/contract-price'
import { SizedContainer } from 'web/components/sized-container'
import { useUser } from 'web/hooks/use-user'
import { tradingAllowed } from 'common/contract'
import { Period } from 'web/lib/firebase/users'
import { periodDurations } from 'web/lib/util/time'
import { SignedInBinaryMobileBetting } from '../bet/bet-button'
import { StonkContractChart } from '../charts/contract/stonk'
import { ZoomParams, getEndDate, useZoom, PointerMode } from '../charts/helpers'
import { TimeRangePicker } from '../charts/time-range-picker'
import { Row } from '../layout/row'
import { AnswersPanel } from '../answers/answers-panel'
import { Answer, DpmAnswer, MultiSort, getDefaultSort } from 'common/answer'
import { UserBetsSummary } from '../bet/bet-summary'
import {
  AnswersResolvePanel,
  IndependentAnswersResolvePanel,
} from '../answers/answer-resolve-panel'
import { CancelLabel } from '../outcome-label'
import { PollPanel } from '../poll/poll-panel'
import { Col } from '../layout/col'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { getAnswerProbability } from 'common/calculate'
import { useAnnotateChartTools } from 'web/hooks/use-chart-annotations'
import {
  ControlledCarousel,
  useCarousel,
} from 'web/components/widgets/carousel'
import { ReadChartAnnotationModal } from 'web/components/annotate-chart'
import { Button } from 'web/components/buttons/button'
import toast from 'react-hot-toast'
import { TbPencilPlus } from 'react-icons/tb'
import { type ChartAnnotation } from 'common/supabase/chart-annotations'
import { useEvent } from 'web/hooks/use-event'
import { Avatar } from 'web/components/widgets/avatar'
import { FaArrowTrendDown, FaArrowTrendUp } from 'react-icons/fa6'
import { formatMoney, formatPercent } from 'common/util/format'
import { isAdminId, isModId } from 'common/envs/constants'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { useDataZoomFetcher } from '../charts/contract/zoom-utils'
import { AlertBox } from '../widgets/alert-box'
import { UserHovercard } from '../user/user-hovercard'
import { BinaryMultiAnswersPanel } from 'web/components/answers/binary-multi-answers-panel'
import { orderBy } from 'lodash'
import { MultiNumericContractChart } from 'web/components/charts/contract/multi-numeric'
import { NumericBetPanel } from 'web/components/answers/numeric-bet-panel'
import { useAnswersCpmm } from 'web/hooks/use-answers'
import { getAutoBountyPayoutPerHour } from 'common/bounty'

export const ContractOverview = memo(
  (props: {
    contract: Contract
    betPoints: HistoryPoint<Partial<Bet>>[] | MultiPoints
    showResolver: boolean
    resolutionRating?: ReactNode
    setShowResolver: (show: boolean) => void
    onAnswerCommentClick: (answer: Answer | DpmAnswer) => void
    chartAnnotations: ChartAnnotation[]
  }) => {
    const {
      betPoints,
      contract,
      showResolver,
      resolutionRating,
      setShowResolver,
      onAnswerCommentClick,
      chartAnnotations,
    } = props

    switch (contract.outcomeType) {
      case 'BINARY':
        return (
          <BinaryOverview
            betPoints={betPoints as any}
            contract={contract}
            resolutionRating={resolutionRating}
            chartAnnotations={chartAnnotations}
          />
        )
      case 'NUMERIC':
        return (
          <NumericOverview
            contract={contract}
            resolutionRating={resolutionRating}
          />
        )
      case 'PSEUDO_NUMERIC':
        return (
          <PseudoNumericOverview
            contract={contract}
            betPoints={betPoints as any}
            resolutionRating={resolutionRating}
          />
        )

      case 'QUADRATIC_FUNDING':
        return <AlertBox title="Quadratic Funding markets are deprecated" />
      case 'FREE_RESPONSE':
      case 'MULTIPLE_CHOICE':
        if (isBinaryMulti(contract)) {
          return (
            <BinaryChoiceOverview
              contract={contract as CPMMMultiContract}
              points={betPoints as any}
              showResolver={showResolver}
              setShowResolver={setShowResolver}
              resolutionRating={resolutionRating}
              chartAnnotations={chartAnnotations}
            />
          )
        }
        return (
          <ChoiceOverview
            contract={contract}
            points={betPoints as any}
            showResolver={showResolver}
            setShowResolver={setShowResolver}
            resolutionRating={resolutionRating}
            onAnswerCommentClick={onAnswerCommentClick}
            chartAnnotations={chartAnnotations}
          />
        )
      case 'NUMBER':
        return (
          <MultiNumericOverview
            contract={contract}
            points={betPoints as any}
            showResolver={showResolver}
            setShowResolver={setShowResolver}
            resolutionRating={resolutionRating}
            onAnswerCommentClick={onAnswerCommentClick}
            chartAnnotations={chartAnnotations}
          />
        )
      case 'STONK':
        return (
          <StonkOverview contract={contract} betPoints={betPoints as any} />
        )
      case 'BOUNTIED_QUESTION':
        return <BountyPanel contract={contract} />
      case 'POLL':
        return <PollPanel contract={contract} />
      case 'CERT':
        return <AlertBox title="Certs are deprecated" />
    }
  }
)

const NumericOverview = (props: {
  contract: NumericContract
  resolutionRating?: ReactNode
}) => {
  const { contract, resolutionRating } = props
  return (
    <>
      <NumericResolutionOrExpectation contract={contract} />
      {resolutionRating}
      <SizedContainer className="h-[150px] w-full pb-4 pr-10 sm:h-[250px]">
        {(w, h) => (
          <NumericContractChart width={w} height={h} contract={contract} />
        )}
      </SizedContainer>
    </>
  )
}

export const BinaryOverview = (props: {
  contract: BinaryContract
  betPoints: HistoryPoint<Partial<Bet>>[]
  resolutionRating?: ReactNode
  chartAnnotations: ChartAnnotation[]
}) => {
  const { contract, resolutionRating } = props

  const user = useUser()

  const [showZoomer, setShowZoomer] = useState(false)
  const { currentTimePeriod, setTimePeriod, maxRange, zoomParams } =
    useTimePicker(contract, () => setShowZoomer(true))

  const { points, loading } = useDataZoomFetcher({
    contractId: contract.id,
    viewXScale: zoomParams?.viewXScale,
    points: props.betPoints,
  })

  const {
    pointerMode,
    setPointerMode,
    hoveredAnnotation,
    setHoveredAnnotation,
    chartAnnotations,
    enableAdd,
  } = useAnnotateChartTools(contract, props.chartAnnotations)

  return (
    <>
      <Row className="items-end justify-between gap-4">
        <Col>
          <BinaryResolutionOrChance contract={contract} />
          {resolutionRating}
        </Col>
        <Row className={'gap-1'}>
          {!loading && <LoadingIndicator size="sm" />}
          {enableAdd && (
            <EditChartAnnotationsButton
              pointerMode={pointerMode}
              setPointerMode={setPointerMode}
            />
          )}
          <TimeRangePicker
            currentTimePeriod={currentTimePeriod}
            setCurrentTimePeriod={setTimePeriod}
            maxRange={maxRange}
            color="green"
          />
        </Row>
      </Row>

      <BinaryChart
        showZoomer={showZoomer}
        showAnnotations={true}
        zoomParams={zoomParams}
        betPoints={points}
        contract={contract}
        hoveredAnnotation={hoveredAnnotation}
        setHoveredAnnotation={setHoveredAnnotation}
        pointerMode={pointerMode}
        chartAnnotations={chartAnnotations}
      />

      {tradingAllowed(contract) && (
        <SignedInBinaryMobileBetting contract={contract} user={user} />
      )}
    </>
  )
}

const EditChartAnnotationsButton = (props: {
  pointerMode: PointerMode
  setPointerMode: (mode: PointerMode) => void
}) => {
  const { pointerMode, setPointerMode } = props
  return (
    <Button
      color={pointerMode === 'annotate' ? 'yellow' : 'gray-white'}
      onClick={() => {
        setPointerMode(pointerMode === 'annotate' ? 'zoom' : 'annotate')
        if (pointerMode !== 'annotate')
          toast('Click on the chart to add an annotation.', {
            icon: <TbPencilPlus className={'h-5 w-5 text-green-500'} />,
          })
      }}
      size={'xs'}
    >
      <TbPencilPlus className={clsx('h-[1.2rem] w-[1.2rem]')} />
    </Button>
  )
}

export function BinaryChart(props: {
  showZoomer?: boolean
  zoomParams?: ZoomParams
  showAnnotations?: boolean
  betPoints: HistoryPoint<Partial<Bet>>[]
  percentBounds?: { max: number; min: number }
  contract: BinaryContract
  className?: string
  size?: 'sm' | 'md'
  color?: string
  hoveredAnnotation?: number | null
  setHoveredAnnotation?: (id: number | null) => void
  pointerMode?: PointerMode
  chartAnnotations?: ChartAnnotation[]
}) {
  const {
    showZoomer,
    zoomParams,
    showAnnotations,
    betPoints,
    contract,
    percentBounds,
    className,
    size = 'md',
    pointerMode,
    setHoveredAnnotation,
    hoveredAnnotation,
    chartAnnotations,
  } = props

  return (
    <>
      <SizedContainer
        className={clsx(
          showZoomer ? 'mb-12' : '',
          'w-full pb-3 pr-10',
          size == 'sm' ? 'h-[100px]' : 'h-[150px] sm:h-[250px]',
          className
        )}
      >
        {(w, h) => (
          <BinaryContractChart
            width={w}
            height={h}
            betPoints={betPoints}
            showZoomer={showZoomer}
            zoomParams={zoomParams}
            percentBounds={percentBounds}
            contract={contract}
            hoveredAnnotation={hoveredAnnotation}
            setHoveredAnnotation={setHoveredAnnotation}
            pointerMode={pointerMode}
            chartAnnotations={chartAnnotations}
          />
        )}
      </SizedContainer>
      {showAnnotations && chartAnnotations?.length ? (
        <ChartAnnotations
          annotations={chartAnnotations}
          hoveredAnnotation={hoveredAnnotation}
          setHoveredAnnotation={setHoveredAnnotation}
        />
      ) : null}
    </>
  )
}
const ChartAnnotations = (props: {
  annotations: ChartAnnotation[]
  hoveredAnnotation?: number | null
  setHoveredAnnotation?: (id: number | null) => void
}) => {
  const { annotations, hoveredAnnotation, setHoveredAnnotation } = props
  const [carouselRef, setCarouselRef] = useState<HTMLDivElement | null>(null)
  const { onScroll, scrollLeft, scrollRight, atFront, atBack } =
    useCarousel(carouselRef)

  return (
    <ControlledCarousel
      className={clsx('relative', 'max-w-full gap-1')}
      ref={setCarouselRef}
      onScroll={onScroll}
      scrollLeft={scrollLeft}
      scrollRight={scrollRight}
      atFront={atFront}
      atBack={atBack}
    >
      {annotations.map((a) => (
        <ChartAnnotation
          key={a.id}
          annotation={a}
          hovered={a.id === hoveredAnnotation}
          setHoveredAnnotation={setHoveredAnnotation}
          carouselRef={carouselRef}
        />
      ))}
    </ControlledCarousel>
  )
}

const ChartAnnotation = (props: {
  annotation: ChartAnnotation
  hovered: boolean
  setHoveredAnnotation?: (id: number | null) => void
  carouselRef: HTMLDivElement | null
}) => {
  const { annotation, hovered, carouselRef, setHoveredAnnotation } = props
  const {
    text,
    user_avatar_url,
    user_id,
    creator_id,
    creator_avatar_url,
    id,
    prob_change,
    creator_username,
    event_time,
    user_username,
  } = annotation
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const scrollIntoView = useEvent(() => {
    const card = ref.current
    if (!hovered || !carouselRef || !card) return

    const cardLeft = card.offsetLeft
    const cardWidth = card.offsetWidth
    const carouselScrollLeft = carouselRef.scrollLeft
    const carouselWidth = carouselRef.offsetWidth

    const cardRight = cardLeft + cardWidth
    const scrollRight = carouselScrollLeft + carouselWidth

    if (cardLeft < carouselScrollLeft) {
      carouselRef.scroll({ left: cardLeft, behavior: 'smooth' })
    } else if (cardRight > scrollRight) {
      carouselRef.scroll({
        left: cardRight - carouselWidth,
        behavior: 'smooth',
      })
    }
  })

  useEffect(() => {
    if (hovered) scrollIntoView()
  }, [hovered])

  return (
    <Col
      className={clsx(
        'cursor-pointer rounded-md border-2',
        hovered ? 'border-indigo-600' : 'dark:border-ink-500 border-ink-200'
      )}
      ref={ref}
      onMouseOver={() => setHoveredAnnotation?.(id)}
      onMouseLeave={() => setHoveredAnnotation?.(null)}
      onClick={() => setOpen(true)}
    >
      <div className={'relative w-[175px] p-1'}>
        <div className={'h-16 overflow-hidden p-1 text-sm'}>
          <UserHovercard userId={user_id ?? creator_id}>
            <Avatar
              avatarUrl={user_avatar_url ?? creator_avatar_url}
              username={user_username ?? creator_username}
              noLink={true}
              size={'2xs'}
              className={'float-left mr-1 mt-0.5'}
            />
          </UserHovercard>
          <span className={'break-anywhere text-sm'}>{text}</span>
        </div>
        <div
          className={clsx(
            'bg-canvas-0 absolute bottom-[0.15rem] right-[0.15rem] justify-end rounded-sm py-0.5',
            prob_change !== null ? 'pl-2 pr-1' : 'px-1'
          )}
        >
          <Row className={'text-ink-500 items-center'}>
            {prob_change !== null && (
              <Row className={'gap-1 text-xs'}>
                <Row
                  className={clsx(
                    'items-center gap-1',
                    prob_change > 0 ? 'text-green-500' : 'text-red-500'
                  )}
                >
                  {prob_change > 0 ? (
                    <FaArrowTrendUp className={'h-3.5 w-3.5'} />
                  ) : (
                    <FaArrowTrendDown className={'h-3.5 w-3.5'} />
                  )}
                  {prob_change > 0 ? '+' : ''}
                  {formatPercent(prob_change)}
                </Row>{' '}
                on
              </Row>
            )}
            <span className={'ml-1 shrink-0 text-xs'}>
              {new Date(event_time).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              })}
            </span>
          </Row>
        </div>
      </div>
      {open && (
        <ReadChartAnnotationModal
          open={open}
          setOpen={setOpen}
          chartAnnotation={annotation}
        />
      )}
    </Col>
  )
}

const ChoiceOverview = (props: {
  points: MultiPoints
  contract: MultiContract
  showResolver: boolean
  resolutionRating?: ReactNode
  setShowResolver: (show: boolean) => void
  onAnswerCommentClick: (answer: Answer | DpmAnswer) => void
  chartAnnotations: ChartAnnotation[]
}) => {
  const {
    points,
    contract,
    showResolver,
    resolutionRating,
    setShowResolver,
    onAnswerCommentClick,
  } = props

  const currentUser = useUser()
  const currentUserId = currentUser?.id
  const [showZoomer, setShowZoomer] = useState(false)
  const { currentTimePeriod, setTimePeriod, maxRange, zoomParams } =
    useTimePicker(contract, () => setShowZoomer(true))

  const [hoverAnswerId, setHoverAnswerId] = useState<string>()
  const [selectedAnswerIds, setSelectedAnswerIds] = useState<string[]>([])
  const [defaultAnswerIdsToGraph, setDefaultAnswerIdsToGraph] = useState<
    string[]
  >([])
  const shouldAnswersSumToOne =
    'shouldAnswersSumToOne' in contract ? contract.shouldAnswersSumToOne : true

  const [query, setQuery] = usePersistentInMemoryState(
    '',
    'create-answer-text' + contract.id
  )

  const defaultSort = getDefaultSort(contract)
  const [sort, setSort] = usePersistentInMemoryState<MultiSort>(
    defaultSort,
    'answer-sort' + contract.id
  )
  const [showSetDefaultSort, setShowSetDefaultSort] = useState(false)
  useEffect(() => {
    if (
      ((contract.sort && sort !== contract.sort) ||
        (!contract.sort && sort !== defaultSort)) &&
      currentUserId &&
      (isModId(currentUserId) ||
        isAdminId(currentUserId) ||
        contract.creatorId === currentUserId)
    )
      setShowSetDefaultSort(true)
  }, [sort, contract.sort])

  const {
    pointerMode,
    setPointerMode,
    hoveredAnnotation,
    setHoveredAnnotation,
    chartAnnotations,
    enableAdd,
  } = useAnnotateChartTools(contract, props.chartAnnotations)

  return (
    <>
      <Row className="justify-between gap-2">
        {contract.resolution === 'CANCEL' ? (
          <div className="flex items-end gap-2 text-2xl sm:text-3xl">
            <span className="text-base">Resolved</span>
            <CancelLabel />
          </div>
        ) : (
          <div />
        )}
        <Row className={'gap-1'}>
          {enableAdd && (
            <EditChartAnnotationsButton
              pointerMode={pointerMode}
              setPointerMode={setPointerMode}
            />
          )}
          <TimeRangePicker
            currentTimePeriod={currentTimePeriod}
            setCurrentTimePeriod={setTimePeriod}
            maxRange={maxRange}
            color="indigo"
          />
        </Row>
      </Row>
      {!!Object.keys(points).length && contract.mechanism == 'cpmm-multi-1' && (
        <SizedContainer
          className={clsx(
            'h-[150px] w-full pb-4 pr-10 sm:h-[250px]',
            showZoomer && 'mb-12'
          )}
        >
          {(w, h) => (
            <ChoiceContractChart
              showZoomer={showZoomer}
              zoomParams={zoomParams}
              width={w}
              height={h}
              multiPoints={points}
              contract={contract}
              highlightAnswerId={hoverAnswerId}
              selectedAnswerIds={
                selectedAnswerIds.length
                  ? selectedAnswerIds
                  : defaultAnswerIdsToGraph
              }
              pointerMode={pointerMode}
              setHoveredAnnotation={setHoveredAnnotation}
              hoveredAnnotation={hoveredAnnotation}
              chartAnnotations={chartAnnotations}
            />
          )}
        </SizedContainer>
      )}
      {chartAnnotations?.length ? (
        <ChartAnnotations
          annotations={chartAnnotations}
          hoveredAnnotation={hoveredAnnotation}
          setHoveredAnnotation={setHoveredAnnotation}
        />
      ) : null}
      {showResolver ? (
        !shouldAnswersSumToOne &&
        contract.mechanism === 'cpmm-multi-1' &&
        contract.outcomeType !== 'NUMBER' ? (
          <IndependentAnswersResolvePanel
            contract={contract}
            onClose={() => setShowResolver(false)}
          />
        ) : (
          <AnswersResolvePanel
            contract={contract}
            onClose={() => setShowResolver(false)}
          />
        )
      ) : (
        <>
          {resolutionRating}
          <AnswersPanel
            setDefaultAnswerIdsToGraph={setDefaultAnswerIdsToGraph}
            selectedAnswerIds={selectedAnswerIds}
            contract={contract}
            onAnswerCommentClick={onAnswerCommentClick}
            onAnswerHover={(ans) => setHoverAnswerId(ans?.id)}
            onAnswerClick={({ id }) =>
              setSelectedAnswerIds((answers) =>
                answers.includes(id)
                  ? answers.filter((a) => a !== id)
                  : [...answers, id]
              )
            }
            sort={sort}
            setSort={setSort}
            query={query}
            setQuery={setQuery}
            showSetDefaultSort={showSetDefaultSort}
          />
          {tradingAllowed(contract) && (
            <UserBetsSummary
              className="border-ink-200 !mb-2 mt-2 "
              contract={contract}
            />
          )}
        </>
      )}
    </>
  )
}
const MultiNumericOverview = (props: {
  points: MultiPoints
  contract: CPMMNumericContract
  showResolver: boolean
  resolutionRating?: ReactNode
  setShowResolver: (show: boolean) => void
  onAnswerCommentClick: (answer: Answer | DpmAnswer) => void
  chartAnnotations: ChartAnnotation[]
}) => {
  const { points, contract, showResolver, resolutionRating, setShowResolver } =
    props
  const user = useUser()
  const [showZoomer, setShowZoomer] = useState(false)
  const { currentTimePeriod, setTimePeriod, maxRange, zoomParams } =
    useTimePicker(contract, () => setShowZoomer(true))

  const {
    pointerMode,
    setPointerMode,
    hoveredAnnotation,
    setHoveredAnnotation,
    chartAnnotations,
    enableAdd,
  } = useAnnotateChartTools(contract, props.chartAnnotations)

  return (
    <>
      <Row className="justify-between gap-2">
        <MultiNumericResolutionOrExpectation contract={contract} />
        {resolutionRating}
        <Row className={'gap-1'}>
          {enableAdd && (
            <EditChartAnnotationsButton
              pointerMode={pointerMode}
              setPointerMode={setPointerMode}
            />
          )}
          <TimeRangePicker
            currentTimePeriod={currentTimePeriod}
            setCurrentTimePeriod={setTimePeriod}
            maxRange={maxRange}
            color="indigo"
          />
        </Row>
      </Row>
      {!!Object.keys(points).length && contract.mechanism == 'cpmm-multi-1' && (
        <SizedContainer
          className={clsx(
            'h-[150px] w-full pb-4 pr-10 sm:h-[250px]',
            showZoomer && 'mb-12'
          )}
        >
          {(w, h) => (
            <MultiNumericContractChart
              width={w}
              height={h}
              multiPoints={points}
              zoomParams={zoomParams}
              contract={contract}
              showZoomer={showZoomer}
            />
          )}
        </SizedContainer>
      )}
      {chartAnnotations?.length ? (
        <ChartAnnotations
          annotations={chartAnnotations}
          hoveredAnnotation={hoveredAnnotation}
          setHoveredAnnotation={setHoveredAnnotation}
        />
      ) : null}
      {showResolver ? (
        <AnswersResolvePanel
          contract={contract}
          onClose={() => setShowResolver(false)}
        />
      ) : (
        <>
          {resolutionRating}
          {tradingAllowed(contract) && (
            <>
              <NumericBetPanel contract={contract} />
              <UserBetsSummary
                className="border-ink-200 !mb-2 mt-2 "
                contract={contract}
                includeSellButton={user}
              />
            </>
          )}
        </>
      )}
    </>
  )
}

const BinaryChoiceOverview = (props: {
  points: MultiPoints
  contract: CPMMMultiContract
  showResolver: boolean
  resolutionRating?: ReactNode
  setShowResolver: (show: boolean) => void
  chartAnnotations: ChartAnnotation[]
}) => {
  const { points, contract, showResolver, resolutionRating, setShowResolver } =
    props
  const user = useUser()

  const [showZoomer, setShowZoomer] = useState(false)
  const { currentTimePeriod, setTimePeriod, maxRange, zoomParams } =
    useTimePicker(contract, () => setShowZoomer(true))

  const answers = contract.answers.map((a) => ({
    ...a,
    prob: getAnswerProbability(contract, a.id),
  }))

  const {
    pointerMode,
    setPointerMode,
    hoveredAnnotation,
    setHoveredAnnotation,
    chartAnnotations,
    enableAdd,
  } = useAnnotateChartTools(contract, props.chartAnnotations)

  const mainAnswer = getMainBinaryMCAnswer(contract)!
  const betPoints = mainAnswer ? props.points[mainAnswer.id] : []
  const leadingAnswer = orderBy(answers, 'prob', 'desc')[0]
  return (
    <>
      {!contract.isResolved && (
        <Row className={clsx('justify-start gap-1 text-xl')}>
          <span style={{ color: getVersusColor(leadingAnswer) }}>
            {leadingAnswer.text}
          </span>
          <span>{formatPercent(leadingAnswer.prob)}</span>
        </Row>
      )}
      <Row className="justify-between gap-2">
        {contract.resolution === 'CANCEL' ? (
          <div className="flex items-end gap-2 text-2xl sm:text-3xl">
            <span className="text-base">Resolved</span>
            <CancelLabel />
          </div>
        ) : (
          <div />
        )}
        <Row className={'gap-1'}>
          {enableAdd && (
            <EditChartAnnotationsButton
              pointerMode={pointerMode}
              setPointerMode={setPointerMode}
            />
          )}
          <TimeRangePicker
            currentTimePeriod={currentTimePeriod}
            setCurrentTimePeriod={setTimePeriod}
            maxRange={maxRange}
            color="indigo"
          />
        </Row>
      </Row>
      {!!Object.keys(points).length && contract.mechanism == 'cpmm-multi-1' && (
        <SizedContainer
          className={clsx(
            'h-[150px] w-full pb-4 pr-10 sm:h-[250px]',
            showZoomer && 'mb-12'
          )}
        >
          {(w, h) => (
            <MultiBinaryChart
              showZoomer={showZoomer}
              zoomParams={zoomParams}
              width={w}
              height={h}
              betPoints={betPoints}
              contract={contract}
            />
          )}
        </SizedContainer>
      )}
      {chartAnnotations?.length ? (
        <ChartAnnotations
          annotations={chartAnnotations}
          hoveredAnnotation={hoveredAnnotation}
          setHoveredAnnotation={setHoveredAnnotation}
        />
      ) : null}
      {showResolver ? (
        <AnswersResolvePanel
          contract={contract}
          onClose={() => setShowResolver(false)}
        />
      ) : (
        <>
          {resolutionRating}
          <BinaryMultiAnswersPanel contract={contract} answers={answers} />
          <UserBetsSummary
            className="border-ink-200 !mb-2 mt-2 "
            contract={contract}
            includeSellButton={user}
          />
        </>
      )}
    </>
  )
}

export const SimpleMultiOverview = (props: { contract: CPMMMultiContract }) => {
  const { contract } = props
  const user = useUser()
  const answers = useAnswersCpmm(contract.id) ?? contract.answers
  const defaultSort = getDefaultSort(contract)

  const [sort, setSort] = usePersistentInMemoryState<MultiSort>(
    defaultSort,
    'answer-sort' + contract.id
  )

  const [query, setQuery] = usePersistentInMemoryState(
    '',
    'create-answer-text' + contract.id
  )

  return (
    <>
      <Row className="justify-between gap-2">
        {contract.resolution === 'CANCEL' ? (
          <div className="flex items-end gap-2 text-2xl sm:text-3xl">
            <span className="text-base">Resolved</span>
            <CancelLabel />
          </div>
        ) : (
          <div />
        )}
      </Row>

      <AnswersPanel
        contract={{ ...contract, answers }}
        selectedAnswerIds={[]}
        sort={sort}
        setSort={setSort}
        query={query}
        setQuery={setQuery}
        onAnswerHover={() => null}
        onAnswerClick={() => null}
      />

      <UserBetsSummary
        className="border-ink-200 !mb-2 mt-2 "
        contract={contract}
        includeSellButton={user}
      />
    </>
  )
}

const PseudoNumericOverview = (props: {
  contract: PseudoNumericContract
  betPoints: HistoryPoint<Partial<Bet>>[]
  resolutionRating?: ReactNode
}) => {
  const { contract, betPoints, resolutionRating } = props
  const [showZoomer, setShowZoomer] = useState(false)
  const { currentTimePeriod, setTimePeriod, maxRange, zoomParams } =
    useTimePicker(contract, () => setShowZoomer(true))
  const user = useUser()

  return (
    <>
      <Row className="items-end justify-between gap-4">
        <Col>
          <PseudoNumericResolutionOrExpectation contract={contract} />
          {resolutionRating}
        </Col>
        <TimeRangePicker
          currentTimePeriod={currentTimePeriod}
          setCurrentTimePeriod={setTimePeriod}
          maxRange={maxRange}
          color="indigo"
        />
      </Row>
      <SizedContainer className="mb-8 h-[150px] w-full pb-4 pr-10 sm:h-[250px]">
        {(w, h) => (
          <PseudoNumericContractChart
            width={w}
            height={h}
            betPoints={betPoints}
            zoomParams={zoomParams}
            contract={contract}
            showZoomer={showZoomer}
          />
        )}
      </SizedContainer>

      {user && tradingAllowed(contract) && (
        <SignedInBinaryMobileBetting contract={contract} user={user} />
      )}
    </>
  )
}

const StonkOverview = (props: {
  contract: CPMMStonkContract
  betPoints: HistoryPoint<Partial<Bet>>[]
}) => {
  const { contract, betPoints } = props
  const [showZoomer, setShowZoomer] = useState(false)
  const { currentTimePeriod, setTimePeriod, maxRange, zoomParams } =
    useTimePicker(contract, () => setShowZoomer(true))
  const user = useUser()

  return (
    <>
      <Row className="items-end justify-between gap-4">
        <StonkPrice contract={contract} />
        <TimeRangePicker
          currentTimePeriod={currentTimePeriod}
          setCurrentTimePeriod={setTimePeriod}
          maxRange={maxRange}
          color="green"
        />
      </Row>
      <SizedContainer className="h-[150px] w-full pb-4 pr-10 sm:h-[250px]">
        {(w, h) => (
          <StonkContractChart
            width={w}
            height={h}
            betPoints={betPoints}
            zoomParams={zoomParams}
            showZoomer={showZoomer}
            contract={contract}
          />
        )}
      </SizedContainer>

      {user && tradingAllowed(contract) && (
        <SignedInBinaryMobileBetting contract={contract} user={user} />
      )}
    </>
  )
}

const BountyPanel = (props: { contract: BountiedQuestionContract }) => {
  const { contract } = props
  const { isAutoBounty } = contract
  if (!isAutoBounty) return null

  const payoutPerHour = getAutoBountyPayoutPerHour(contract)

  return (
    <Col className="border-ink-200 self-start rounded border px-3 py-2">
      <div className="text-ink-700 text-sm">Auto-award enabled</div>
      <Row className="items-baseline gap-1">
        <div className="font-semibold text-teal-700">
          {formatMoney(payoutPerHour)} per hour
        </div>
        <div className="text-ink-700 text-sm">
          paid in proportion to comment likes
        </div>
      </Row>
    </Col>
  )
}

export const useTimePicker = (contract: Contract, onRescale?: () => void) => {
  const [currentTimePeriod, setCurrentTimePeriod] = useState<Period | 'custom'>(
    'allTime'
  )

  const start = contract.createdTime
  const endRange = getEndDate(contract)
  const end = endRange ?? Date.now()
  const maxRange = end - start

  const zoomParams = useZoom((scale) => {
    onRescale?.()
    if (scale) {
      setCurrentTimePeriod('custom')
    } else {
      setCurrentTimePeriod('allTime')
    }
  })

  const setTimePeriod = (period: Period) => {
    if (period === 'allTime') {
      zoomParams.rescale(null)
    } else {
      const time = periodDurations[period]
      const start = end - time
      zoomParams.rescaleBetween(start, end)
    }

    setCurrentTimePeriod(period)
  }

  return { currentTimePeriod, setTimePeriod, maxRange, zoomParams }
}
