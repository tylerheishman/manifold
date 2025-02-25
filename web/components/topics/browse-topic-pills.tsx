import { LiteGroup } from 'common/group'
import { PillButton } from 'web/components/buttons/pill-button'
import { useIsAuthorized } from 'web/hooks/use-user'
import { Row } from 'web/components/layout/row'
import { ChevronRightIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { Col } from 'web/components/layout/col'
import { SORT_KEY } from 'web/components/supabase-search'
import { useRouter } from 'next/router'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'

export const BrowseTopicPills = (props: {
  topics: LiteGroup[]
  setTopicSlug: (slug: string) => void
  currentTopicSlug: string | undefined
  className?: string
}) => {
  const { topics, className, setTopicSlug, currentTopicSlug } = props
  const isAuth = useIsAuthorized()
  const [showMore, setShowMore] = usePersistentLocalState<boolean>(
    // The first time user lands on browse it should be obvious that there topics to choose from
    true,
    'showMoreMobileBrowseTopicPills'
  )
  const router = useRouter()
  const sort = router.query[SORT_KEY] as string

  return (
    <Col className={className}>
      <Row
        className={clsx(
          'gap-x-1 gap-y-2 overflow-auto',
          showMore ? 'max-h-[12.75rem] flex-wrap' : 'scrollbar-hide h-[2rem]'
        )}
      >
        {isAuth && (sort == undefined || sort == 'score') && (
          <>
            <PillButton
              selected={currentTopicSlug === 'for-you'}
              onSelect={() => setTopicSlug('for-you')}
            >
              ⭐️ For you
            </PillButton>
          </>
        )}

        {topics.map((g) => (
          <PillButton
            key={'pill-' + g.slug}
            selected={currentTopicSlug === g.slug}
            onSelect={() => setTopicSlug(g.slug)}
          >
            {g.name}
          </PillButton>
        ))}
      </Row>
      <button
        className="bg-primary-50 hover:bg-primary-200 absolute right-0 top-1 z-10 mr-1.5 cursor-pointer select-none overflow-hidden rounded-full transition-colors"
        onClick={() => setShowMore((showMore) => !showMore)}
      >
        <ChevronRightIcon
          className={clsx(
            'text-primary-800 h-7 w-7 transition-transform duration-75',
            showMore && 'rotate-90'
          )}
          aria-hidden
        />
        <div className="sr-only">{showMore ? 'Contract' : 'Expand'}</div>
      </button>
    </Col>
  )
}
