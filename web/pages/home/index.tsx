import { track } from 'web/lib/service/analytics'
import { PencilAltIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { DailyStats } from 'web/components/home/daily-stats'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import Welcome from 'web/components/onboarding/welcome'
import { useIsClient } from 'web/hooks/use-is-client'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { usePrivateUser, useUser } from 'web/hooks/use-user'
import { FeedTimeline } from 'web/components/feed-timeline'
import { api } from 'web/lib/firebase/api'
import { Headline } from 'common/news'
import { HeadlineTabs } from 'web/components/dashboard/header'
import { WelcomeTopicSections } from 'web/components/home/welcome-topic-sections'
import { useNewUserMemberTopicsAndContracts } from 'web/hooks/use-group-supabase'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { DAY_MS, HOUR_MS } from 'common/util/time'
import { useSaveScroll } from 'web/hooks/use-save-scroll'
import { CreateQuestionButton } from 'web/components/buttons/create-question-button'
import { simpleFromNow } from 'web/lib/util/shortenedFromNow'
import {
  PrivateUser,
  freeQuestionRemaining,
  DAYS_TO_USE_FREE_QUESTIONS,
} from 'common/user'
import Router from 'next/router'
import { Col } from 'web/components/layout/col'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { User } from 'common/user'
import { useABTest } from 'web/hooks/use-ab-test'
import { NewUserGoals } from 'web/components/home/new-user-goals'

export async function getStaticProps() {
  try {
    const headlines = await api('headlines', {})
    return {
      props: {
        headlines,
        revalidate: 30 * 60, // 30 minutes
      },
    }
  } catch (err) {
    return { props: { headlines: [] }, revalidate: 60 }
  }
}

export default function Home(props: { headlines: Headline[] }) {
  const isClient = useIsClient()

  useRedirectIfSignedOut()
  const user = useUser()
  const privateUser = usePrivateUser()
  useSaveReferral(user)
  useSaveScroll('home')

  const [feedKey, setFeedKey] = usePersistentInMemoryState('feed', 'feed-key')

  const { headlines } = props
  return (
    <>
      <Welcome setFeedKey={setFeedKey} />
      <Page
        trackPageView={'home'}
        trackPageProps={{ kind: 'desktop' }}
        className="!mt-0"
      >
        <HeadlineTabs
          endpoint={'news'}
          headlines={headlines}
          currentSlug={'home'}
          hideEmoji
        />
        {!user ? (
          <LoadingIndicator />
        ) : isClient ? (
          <HomeContent
            user={user}
            privateUser={privateUser}
            feedKey={feedKey}
          />
        ) : null}
      </Page>
    </>
  )
}

export function HomeContent(props: {
  user: User | undefined | null
  privateUser: PrivateUser | undefined | null
  feedKey: string
}) {
  const { user, privateUser, feedKey } = props
  const remaining = freeQuestionRemaining(
    user?.freeQuestionsCreated,
    user?.createdTime
  )
  const createdInLastHour = (user?.createdTime ?? 0) > Date.now() - HOUR_MS
  const freeQuestionsEnabled = !createdInLastHour

  const welcomeTopicsEnabled = (user?.createdTime ?? 0) > Date.now() - DAY_MS
  const memberTopicsWithContracts = useNewUserMemberTopicsAndContracts(
    user,
    welcomeTopicsEnabled
  )

  const hasAgedOutOfNewUserGoals =
    (user?.createdTime ?? 0) + DAY_MS * 1 < Date.now()
  const newUserGoalsVariant = useABTest('new user goals', [
    'enabled',
    'disabled',
  ])
  const newUserGoalsEnabled =
    !hasAgedOutOfNewUserGoals && newUserGoalsVariant === 'enabled'

  if (welcomeTopicsEnabled && !memberTopicsWithContracts) {
    return <LoadingIndicator />
  }
  return (
    <Col className="w-full max-w-[800px] items-center self-center pb-4 sm:px-2">
      {user &&
        !newUserGoalsEnabled &&
        freeQuestionsEnabled &&
        remaining > 0 && (
          <Col className="text-md mb-2 w-full items-stretch justify-stretch gap-2 self-center rounded-md bg-indigo-100 px-4 py-2 dark:bg-indigo-900 sm:flex-row sm:items-center">
            <Row className="flex-1 flex-wrap gap-x-1">
              <span>🎉 You've got {remaining} free questions!</span>
              <span>
                Expires in{' '}
                {simpleFromNow(
                  user.createdTime + DAY_MS * DAYS_TO_USE_FREE_QUESTIONS
                )}
              </span>
            </Row>
            <CreateQuestionButton
              className={'flex-1'}
              color="indigo-outline"
              size="xs"
            />
          </Col>
        )}

      {hasAgedOutOfNewUserGoals && user && (
        <DailyStats
          className="bg-canvas-50 sticky top-9 z-50 mb-1 w-full px-2 pb-2 pt-1"
          user={user}
        />
      )}

      {privateUser && (
        <Col className={clsx('w-full sm:px-2')}>
          {user && newUserGoalsEnabled && (
            <>
              <NewUserGoals user={user} />
              <div className="mt-4" />
            </>
          )}

          {welcomeTopicsEnabled && memberTopicsWithContracts && (
            <WelcomeTopicSections
              memberTopicsWithContracts={memberTopicsWithContracts}
            />
          )}

          <FeedTimeline
            key={feedKey}
            feedKey={feedKey}
            user={user}
            privateUser={privateUser}
          />
        </Col>
      )}
      <button
        type="button"
        className={clsx(
          'focus:ring-primary-500 fixed  right-3 z-20 inline-flex items-center rounded-full border  border-transparent  p-4 shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 lg:hidden',
          'disabled:bg-ink-300 text-ink-0 from-primary-500 hover:from-primary-700 to-blue-500 hover:to-blue-700 enabled:bg-gradient-to-r',
          'bottom-[64px]'
        )}
        onClick={() => {
          Router.push('/create')
          track('mobile create button')
        }}
      >
        <PencilAltIcon className="h-6 w-6" aria-hidden="true" />
      </button>
    </Col>
  )
}
