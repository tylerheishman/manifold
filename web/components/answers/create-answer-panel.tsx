import clsx from 'clsx'
import { useState } from 'react'
import {
  CPMMMultiContract,
  FreeResponseContract,
  MultiContract,
} from 'common/contract'
import { BuyAmountInput } from '../widgets/amount-input'
import { Col } from '../layout/col'
import { APIError, api, createAnswer } from 'web/lib/firebase/api'
import { Row } from '../layout/row'
import {
  formatMoney,
  formatPercent,
  formatWithCommas,
} from 'common/util/format'
import { InfoTooltip } from '../widgets/info-tooltip'
import { useUser } from 'web/hooks/use-user'
import {
  calculateDpmShares,
  calculateDpmPayoutAfterCorrectBet,
  getDpmOutcomeProbabilityAfterBet,
} from 'common/calculate-dpm'
import { Bet } from 'common/bet'
import { MAX_ANSWER_LENGTH } from 'common/answer'
import { withTracking } from 'web/lib/service/analytics'
import { Button } from '../buttons/button'
import { ExpandingInput } from '../widgets/expanding-input'
import { ANSWER_COST } from 'common/economy'
import { Input } from '../widgets/input'

export function CreateAnswerCpmmPanel(props: {
  contract: CPMMMultiContract
  text: string
  setText: (text: string) => void
  children?: React.ReactNode
  close?: () => void
  placeholder?: string
  autoFocus?: boolean
}) {
  const { contract, text, setText, children, close, placeholder, autoFocus } =
    props

  const [isSubmitting, setIsSubmitting] = useState(false)

  const canSubmit = text && !isSubmitting

  const submitAnswer = async () => {
    if (canSubmit) {
      setIsSubmitting(true)

      try {
        await api('market/:contractId/answer', {
          contractId: contract.id,
          text,
        })
        setText('')
      } catch (e) {}

      setIsSubmitting(false)
    }
  }

  return (
    <Col className="gap-1">
      <ExpandingInput
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="w-full"
        placeholder={placeholder ?? 'Search or add answer'}
        rows={1}
        maxLength={MAX_ANSWER_LENGTH}
        onBlur={() => !text && close?.()}
        autoFocus={autoFocus}
      />

      <Row className="justify-between">
        {children}

        <Row className="gap-1">
          {text && (
            <Button
              size="2xs"
              color="gray"
              onClick={() => (setText(''), close?.())}
            >
              Clear
            </Button>
          )}
          <Button
            size="2xs"
            loading={isSubmitting}
            disabled={!canSubmit}
            onClick={withTracking(submitAnswer, 'submit answer')}
          >
            Add answer ({formatMoney(ANSWER_COST)})
          </Button>
        </Row>
      </Row>
    </Col>
  )
}

function CreateAnswerDpmPanel(props: {
  contract: FreeResponseContract
  text: string
  setText: (text: string) => void
}) {
  const { contract, text, setText } = props
  const user = useUser()
  const [betAmount, setBetAmount] = useState<number | undefined>(10)
  const [amountError, setAmountError] = useState<string | undefined>()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const canSubmit = text && betAmount && !amountError && !isSubmitting

  const submitAnswer = async () => {
    if (canSubmit) {
      setIsSubmitting(true)

      try {
        await createAnswer({
          contractId: contract.id,
          text,
          amount: betAmount,
        })
        setText('')
        setBetAmount(10)
        setAmountError(undefined)
      } catch (e) {
        if (e instanceof APIError) {
          setAmountError(e.toString())
        }
      }

      setIsSubmitting(false)
    }
  }

  const resultProb = getDpmOutcomeProbabilityAfterBet(
    contract.totalShares,
    'new',
    betAmount ?? 0
  )

  const shares = calculateDpmShares(contract.totalShares, betAmount ?? 0, 'new')

  const currentPayout = betAmount
    ? calculateDpmPayoutAfterCorrectBet(contract, {
        outcome: 'new',
        amount: betAmount,
        shares,
      } as Bet)
    : 0

  const currentReturn = betAmount ? (currentPayout - betAmount) / betAmount : 0
  const currentReturnPercent = (currentReturn * 100).toFixed() + '%'

  if (user?.isBannedFromPosting) return <></>

  return (
    <Col className="mb-2 gap-2">
      <ExpandingInput
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="w-full"
        placeholder="Search or add answer"
        rows={1}
        maxLength={MAX_ANSWER_LENGTH}
      />
      {text && (
        <Col className="bg-canvas-50 rounded p-2">
          <Row className={clsx('flex-wrap gap-4')}>
            <Col className="w-full gap-2">
              <Row className="text-ink-500 mb-3 justify-between text-left text-sm">
                Bet Amount
                <span className={'sm:hidden'}>
                  Balance: {formatMoney(user?.balance ?? 0)}
                </span>
              </Row>{' '}
              <BuyAmountInput
                amount={betAmount}
                onChange={setBetAmount}
                error={amountError}
                setError={setAmountError}
                minimumAmount={1}
                disabled={isSubmitting}
              />
            </Col>
            <Col className="w-full gap-3">
              <Row className="items-center justify-between text-sm">
                <div className="text-ink-500">Probability</div>
                <Row>
                  <div>{formatPercent(0)}</div>
                  <div className="mx-2">→</div>
                  <div>{formatPercent(resultProb)}</div>
                </Row>
              </Row>

              <Row className="items-center justify-between gap-4 text-sm">
                <Row className="text-ink-500 flex-nowrap items-center gap-2 whitespace-nowrap">
                  <div>
                    Estimated <br /> payout if chosen
                  </div>
                  <InfoTooltip
                    text={`Current payout for ${formatWithCommas(
                      shares
                    )} / ${formatWithCommas(shares)} shares`}
                  />
                </Row>
                <Row className="flex-wrap items-end justify-end gap-2">
                  <span className="whitespace-nowrap">
                    {formatMoney(currentPayout)}
                  </span>
                  <span>(+{currentReturnPercent})</span>
                </Row>
              </Row>
            </Col>
          </Row>
          <Button
            color="green"
            className="self-end"
            loading={isSubmitting}
            disabled={!canSubmit}
            onClick={withTracking(submitAnswer, 'submit answer')}
          >
            Add answer
          </Button>
        </Col>
      )}
    </Col>
  )
}

export function SearchCreateAnswerPanel(props: {
  contract: MultiContract
  canAddAnswer: boolean
  text: string
  setText: (text: string) => void
  children?: React.ReactNode
  isSearchOpen?: boolean
  setIsSearchOpen?: (isSearchOpen: boolean) => void
}) {
  const {
    contract,
    canAddAnswer,
    text,
    setText,
    children,
    isSearchOpen,
    setIsSearchOpen,
  } = props

  if (!isSearchOpen) return <>{children}</>

  if (canAddAnswer && contract.outcomeType !== 'NUMBER') {
    return contract.mechanism === 'cpmm-multi-1' ? (
      <CreateAnswerCpmmPanel
        contract={contract}
        text={text}
        setText={setText}
        close={() => setIsSearchOpen?.(false)}
        placeholder="Search or add answer"
        autoFocus
      >
        {children}
      </CreateAnswerCpmmPanel>
    ) : (
      <>
        <CreateAnswerDpmPanel
          contract={contract as FreeResponseContract}
          text={text}
          setText={setText}
        />
        {children}
      </>
    )
  }

  return (
    <>
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="!text-md"
        placeholder="Search answers"
        onBlur={() => !text && setIsSearchOpen?.(false)}
        autoFocus
      />
      {children}
    </>
  )
}
