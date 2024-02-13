import { JSONContent } from '@tiptap/core'
import { useContract } from 'web/hooks/use-contract-supabase'
import { JSONEmpty } from '../contract/contract-description'
import { ContractMention } from '../contract/contract-mention'
import { Row } from '../layout/row'
import { RelativeTimestamp } from '../relative-timestamp'
import { Avatar } from '../widgets/avatar'
import { Content } from '../widgets/editor'
import { UserLink } from '../widgets/user-link'
import { Rating, StarDisplay } from './stars'

export const Review = (props: {
  userId: string
  rating: number
  created: number
  contractId: string
  text?: JSONContent
}) => {
  const { userId, rating, created, text } = props
  const contract = useContract(props.contractId)

  if (!contract) return null

  const isEmpty = !text || JSONEmpty(text)
  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <div className="opacity-50">
        <ContractMention contract={contract} className="text-ink-600" />
      </div>
      <Row className="mb-1 mt-1 flex w-full items-center justify-between">
        <Row className="gap-2">
          <Avatar userId={userId} size="xs" />
          <UserLink userId={userId} />
        </Row>
        <Row className="items-center gap-2">
          <StarDisplay rating={rating as Rating} />
          <RelativeTimestamp
            time={created}
            className="-ml-1"
            shortened={true}
          />
        </Row>
      </Row>
      {text && !isEmpty && (
        <Content content={text} size="sm" className="mt-2" />
      )}
    </div>
  )
}
