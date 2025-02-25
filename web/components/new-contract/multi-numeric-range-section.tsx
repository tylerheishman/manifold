import { Col } from 'web/components/layout/col'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'
import { Row } from 'web/components/layout/row'
import { Input } from 'web/components/widgets/input'
import { useEffect, useState } from 'react'
import { getMultiNumericAnswerBucketRangeNames } from 'common/multi-numeric'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { MULTI_NUMERIC_BUCKETS_MAX } from 'common/contract'
import { IconButton } from 'web/components/buttons/button'
import { PencilIcon } from '@heroicons/react/outline'

export const MultiNumericRangeSection = (props: {
  minString: string
  setMinString: (value: string) => void
  maxString: string
  setMaxString: (value: string) => void
  numBuckets: number
  setNumBuckets: (value: number) => void
  submitState: 'EDITING' | 'LOADING' | 'DONE'
  min: number | undefined
  max: number | undefined
  paramsKey: string
}) => {
  const {
    minString,
    setMinString,
    numBuckets,
    setNumBuckets,
    maxString,
    setMaxString,
    submitState,
    min,
    max,
    paramsKey,
  } = props

  useEffect(() => {
    if (max === undefined || min === undefined) {
      setBuckets(undefined)
      return
    }
    if (min > max) return
    const ranges = getMultiNumericAnswerBucketRangeNames(min, max, numBuckets)
    setBuckets(ranges)
    const absRange = Math.abs(max - min)
    if (absRange < MULTI_NUMERIC_BUCKETS_MAX && absRange > 2) {
      setNumBuckets(Math.floor(absRange))
    } else {
      setNumBuckets(MULTI_NUMERIC_BUCKETS_MAX)
    }
  }, [max, min])

  useEffect(() => {
    if (max === undefined || min === undefined) return
    const ranges = getMultiNumericAnswerBucketRangeNames(min, max, numBuckets)
    setBuckets(ranges)
  }, [numBuckets])

  const [showBucketInput, setShowBucketInput] = useState(
    numBuckets < 2 || numBuckets > MULTI_NUMERIC_BUCKETS_MAX
  )

  const [buckets, setBuckets] = usePersistentLocalState<string[] | undefined>(
    undefined,
    'new-buckets' + paramsKey
  )
  const bucketsToShow = 2
  const [showAllBuckets, setShowAllBuckets] = useState(
    numBuckets <= bucketsToShow * 2
  )
  return (
    <Col>
      <Col className="mb-2 items-start">
        <label className="gap-2 px-1 py-2">
          <span className="mb-1">Range </span>
          <InfoTooltip text="The lower and higher bounds of the numeric range. Choose bounds the value could reasonably be expected to hit." />
        </label>

        <Row className="gap-2">
          <Input
            type="number"
            className="w-32"
            placeholder="Low"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setMinString(e.target.value)}
            disabled={submitState === 'LOADING'}
            value={minString ?? ''}
          />
          <Input
            type="number"
            className="w-32"
            placeholder="High"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setMaxString(e.target.value)}
            disabled={submitState === 'LOADING'}
            value={maxString}
          />
        </Row>

        {min !== undefined && max !== undefined && min >= max && (
          <div className="text-scarlet-500 mb-2 mt-2 text-sm">
            The maximum value must be greater than the minimum.
          </div>
        )}
      </Col>
      {buckets && (
        <Col className={'gap-1'}>
          <Row className={'items-center'}>
            <label className="gap-2 px-1 py-2">
              <span className="mb-1">Buckets </span>
              <InfoTooltip
                text={`Users will see the expected value computed across the 
                ${buckets.length} buckets, & can bet on any number of buckets at once.`}
              />
            </label>
            {!showBucketInput ? (
              <IconButton
                onClick={() => setShowBucketInput(true)}
                size="2xs"
                className="text-ink-500"
              >
                <PencilIcon className="h-4 w-4" />
              </IconButton>
            ) : (
              <Input
                type="number"
                className="h-8 w-24"
                placeholder="Buckets"
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setNumBuckets(parseInt(e.target.value))}
                disabled={submitState === 'LOADING'}
                min={2}
                max={MULTI_NUMERIC_BUCKETS_MAX}
                value={numBuckets}
              />
            )}
          </Row>
          <Row className={'ml-1 flex-wrap items-center gap-2'}>
            {buckets
              .slice(
                0,
                showAllBuckets || numBuckets <= 4 ? numBuckets : bucketsToShow
              )
              .map((a, i) => (
                <span className={'whitespace-nowrap'} key={a}>
                  {a}
                  {i === 0 ? ', ' : ''}
                </span>
              ))}
            {!showAllBuckets && numBuckets > 4 && (
              <>
                {buckets.length > 4 && (
                  <span
                    className="cursor-pointer hover:underline "
                    onClick={() => setShowAllBuckets(true)}
                  >
                    ...
                  </span>
                )}
                {buckets.slice(-bucketsToShow).map((a, i) => (
                  <span className={'whitespace-nowrap'} key={a}>
                    {a}
                    {bucketsToShow === i + 1 ? '' : ', '}
                  </span>
                ))}
              </>
            )}
          </Row>
        </Col>
      )}
    </Col>
  )
}
