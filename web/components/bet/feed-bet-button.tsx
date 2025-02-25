import clsx from 'clsx'
import { useState } from 'react'
import { Button } from '../buttons/button'
import { Col } from '../layout/col'
import { Modal, MODAL_CLASS } from '../layout/modal'
import { BuyPanel } from './bet-panel'
import { track } from 'web/lib/service/analytics'
import { CPMMBinaryContract } from 'common/contract'
import { User, firebaseLogin } from 'web/lib/firebase/users'
import { FeedTimelineItem } from 'web/hooks/use-feed-timeline'

export function BetButton(props: {
  contract: CPMMBinaryContract
  user: User | null | undefined
  feedItem?: FeedTimelineItem
  className?: string
}) {
  const { contract, user, className, feedItem } = props
  const { closeTime } = contract
  const isClosed = closeTime && closeTime < Date.now()
  const [dialogueThatIsOpen, setDialogueThatIsOpen] = useState<
    string | undefined
  >(undefined)
  if (isClosed) return null
  const open = dialogueThatIsOpen === 'YES' || dialogueThatIsOpen === 'NO'

  const handleBetButtonClick = (outcome: 'YES' | 'NO') => {
    if (!user) {
      firebaseLogin()
      return
    }
    track('bet intent', { location: 'feed card', outcome })
    setDialogueThatIsOpen(outcome)
  }

  return (
    <div className={className}>
      <Button
        color="green-outline"
        size="2xs"
        onClick={() => handleBetButtonClick('YES')}
        className="mr-2"
      >
        Yes
      </Button>

      <Button
        color="red-outline"
        size="2xs"
        onClick={() => handleBetButtonClick('NO')}
      >
        No
      </Button>

      {open && (
        <Modal
          open={open}
          setOpen={(open) => {
            setDialogueThatIsOpen(open ? dialogueThatIsOpen : undefined)
          }}
          className={clsx(
            MODAL_CLASS,
            'pointer-events-auto max-h-[32rem] overflow-auto'
          )}
        >
          <Col>
            <div className="mb-4 mt-0 text-xl">{contract.question}</div>
            <BuyPanel
              contract={contract}
              initialOutcome={dialogueThatIsOpen === 'YES' ? 'YES' : 'NO'}
              onBuySuccess={() =>
                setTimeout(() => setDialogueThatIsOpen(undefined), 500)
              }
              location={'feed card'}
              inModal={true}
              feedItem={feedItem}
            />
          </Col>
        </Modal>
      )}
    </div>
  )
}
