import {
  CashIcon,
  ChatAlt2Icon,
  PencilIcon,
  ScaleIcon,
  PresentationChartLineIcon,
  ViewListIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  TagIcon,
} from '@heroicons/react/outline'
import { LuCrown } from 'react-icons/lu'
import { ChartBarIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { DIVISION_NAMES, getLeaguePath } from 'common/leagues'
import { removeUndefinedProps } from 'common/util/object'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import dayjs from 'dayjs'

import { SEO } from 'web/components/SEO'
import { ENV_CONFIG } from 'common/envs/constants'
import { referralQuery } from 'common/util/share'
import { UserBetsTable } from 'web/components/bet/user-bets-table'
import {
  CopyLinkOrShareButton,
  CopyLinkRow,
} from 'web/components/buttons/copy-link-button'
import { FollowButton } from 'web/components/buttons/follow-button'
import { MoreOptionsUserButton } from 'web/components/buttons/more-options-user-button'
import { TextButton } from 'web/components/buttons/text-button'
import { UserCommentsList } from 'web/components/comments/comments-list'
import { DailyLeagueStat } from 'web/components/home/daily-league-stat'
import { FollowList } from 'web/components/follow-list'
import { Col } from 'web/components/layout/col'
import { Modal } from 'web/components/layout/modal'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { Spacer } from 'web/components/layout/spacer'
import { QueryUncontrolledTabs, Tabs } from 'web/components/layout/tabs'
import { SendMessageButton } from 'web/components/messaging/send-message-button'
import { BlockedUser } from 'web/components/profile/blocked-user'
import { UserContractsList } from 'web/components/profile/user-contracts-list'
import { UserLikedContractsButton } from 'web/components/profile/user-liked-contracts-button'
import { QuestsOrStreak } from 'web/components/home/quests-or-streak'
import { Avatar } from 'web/components/widgets/avatar'
import { FullscreenConfetti } from 'web/components/widgets/fullscreen-confetti'
import ImageWithBlurredShadow from 'web/components/widgets/image-with-blurred-shadow'
import { Linkify } from 'web/components/widgets/linkify'
import { QRCode } from 'web/components/widgets/qr-code'
import { linkClass } from 'web/components/widgets/site-link'
import { Title } from 'web/components/widgets/title'
import { StackedUserNames, UserLink } from 'web/components/widgets/user-link'
import { useAdmin } from 'web/hooks/use-admin'
import { useFollowers, useFollows } from 'web/hooks/use-follows'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { useLeagueInfo } from 'web/hooks/use-leagues'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import {
  usePrefetchUsers,
  usePrivateUser,
  useUser,
  useUserById,
} from 'web/hooks/use-user'
import { useDiscoverUsers } from 'web/hooks/use-users'
import { User } from 'web/lib/firebase/users'
import TrophyIcon from 'web/lib/icons/trophy-icon.svg'
import { db } from 'web/lib/supabase/db'
import { getAverageUserRating, getUserRating } from 'web/lib/supabase/reviews'
import Custom404 from 'web/pages/404'
import { UserPayments } from 'web/pages/payments'
import { UserHandles } from 'web/components/user/user-handles'
import { BackButton } from 'web/components/contract/back-button'
import { useHeaderIsStuck } from 'web/hooks/use-header-is-stuck'
import { getFullUserByUsername } from 'web/lib/supabase/users'
import { shouldIgnoreUserPage } from 'common/user'
import { PortfolioSummary } from 'web/components/portfolio/portfolio-summary'
import { BET_BALANCE_CHANGE_TYPES } from 'common/balance-change'
import { BalanceChangeTable } from 'web/components/portfolio/balance-card'
import { Button } from 'web/components/buttons/button'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { buildArray } from 'common/util/array'
import { dailyStatsClass } from 'web/components/home/daily-stats'
import { ManaCircleIcon } from 'web/components/icons/mana-circle-icon'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { PortfolioValueSection } from 'web/components/portfolio/portfolio-value-section'
import { YourTopicsSection } from 'web/components/topics/your-topics'

export const getStaticProps = async (props: {
  params: {
    username: string
  }
}) => {
  const { username } = props.params
  const user = await getFullUserByUsername(username)

  const { count, rating } = (user ? await getUserRating(user.id) : null) ?? {}
  const averageRating = user ? await getAverageUserRating(user.id) : undefined
  const shouldIgnoreUser = user ? await shouldIgnoreUserPage(user, db) : false

  return {
    props: removeUndefinedProps({
      user,
      username,
      rating: rating,
      reviewCount: count,
      averageRating: averageRating,
      shouldIgnoreUser,
    }),
    revalidate: 60,
  }
}

export const getStaticPaths = () => {
  return { paths: [], fallback: 'blocking' }
}

export default function UserPage(props: {
  user: User | null
  username: string
  rating?: number
  reviewCount?: number
  averageRating?: number
  shouldIgnoreUser: boolean
}) {
  const isAdmin = useAdmin()
  const { user, ...profileProps } = props
  const privateUser = usePrivateUser()
  const blockedByCurrentUser =
    privateUser?.blockedUserIds.includes(user?.id ?? '_') ?? false
  if (!user) return <Custom404 />
  else if (user.userDeleted && !isAdmin) return <DeletedUser />

  return privateUser && blockedByCurrentUser ? (
    <BlockedUser user={user} privateUser={privateUser} />
  ) : (
    <UserProfile user={user} {...profileProps} />
  )
}

export const DeletedUser = () => {
  return (
    <Page trackPageView={'deleted user profile'}>
      <Head>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <div className="flex h-full flex-col items-center justify-center">
        <Title>Deleted account</Title>
        <p>This user's account has been deleted.</p>
      </div>
    </Page>
  )
}

function UserProfile(props: {
  user: User
  rating?: number
  reviewCount?: number
  averageRating?: number
  shouldIgnoreUser: boolean
}) {
  const { rating, shouldIgnoreUser, reviewCount, averageRating } = props
  const user = useUserById(props.user.id) ?? props.user
  const isMobile = useIsMobile()
  const router = useRouter()
  const currentUser = useUser()

  const { data: newBalanceChanges } = useAPIGetter('get-balance-changes', {
    userId: user.id,
    after: dayjs().startOf('day').subtract(14, 'day').valueOf(),
  })
  const balanceChanges = newBalanceChanges ?? []
  const hasBetBalanceChanges = balanceChanges.some((b) =>
    BET_BALANCE_CHANGE_TYPES.includes(b.type)
  )
  const balanceChangesKey = 'balance-changes'

  useSaveReferral(currentUser, {
    defaultReferrerUsername: user?.username,
  })
  const isCurrentUser = user.id === currentUser?.id
  const [expandProfileInfo, setExpandProfileInfo] = usePersistentLocalState(
    false,
    'expand-profile-info'
  )
  const [showConfetti, setShowConfetti] = useState(false)
  const [followsYou, setFollowsYou] = useState(false)
  const { ref: titleRef, headerStuck } = useHeaderIsStuck()

  useEffect(() => {
    const claimedMana = router.query['claimed-mana'] === 'yes'
    setShowConfetti(claimedMana)
    const query = { ...router.query }
    if (query.claimedMana || query.show) {
      const queriesToDelete = ['claimed-mana', 'show', 'badge']
      queriesToDelete.forEach((key) => delete query[key])
      router.replace(
        {
          pathname: router.pathname,
          query,
        },
        undefined,
        { shallow: true }
      )
    }
  }, [])

  useEffect(() => {
    if (currentUser && currentUser.id !== user.id) {
      db.from('user_follows')
        .select('user_id')
        .eq('follow_id', currentUser.id)
        .eq('user_id', user.id)
        .then(({ data }) => {
          setFollowsYou(
            data?.some(({ user_id }) => user_id === user.id) ?? false
          )
        })
    }
  }, [currentUser?.id, user?.id])

  return (
    <Page
      key={user.id}
      trackPageView={'user page'}
      trackPageProps={{ username: user.username }}
      className={clsx(isCurrentUser ? 'lg:!mt-0' : 'lg:mt-4')}
    >
      <SEO
        title={`${user.name} (@${user.username})`}
        description={user.bio ?? ''}
        url={`/${user.username}`}
      />
      {shouldIgnoreUser && (
        <Head>
          <meta name="robots" content="noindex, nofollow" />
        </Head>
      )}
      {showConfetti && <FullscreenConfetti />}

      <Col className="relative mt-1">
        {isMobile && (
          <Row
            className={
              'bg-canvas-50 sticky top-0 z-10 w-full items-center justify-between gap-1 py-2 pl-4 pr-5 sm:gap-2'
            }
          >
            <BackButton />

            <div
              className={clsx(
                'opacity-0 transition-opacity',
                headerStuck && 'opacity-100'
              )}
            >
              <UserLink user={user} noLink />
            </div>

            <div>
              <MoreOptionsUserButton user={user} />
              {isCurrentUser && (
                <Row className="justify-end">
                  <Button
                    color="gray-white"
                    size="xs"
                    onClick={() => setExpandProfileInfo((v) => !v)}
                  >
                    <Row className="items-center gap-2">
                      {expandProfileInfo ? (
                        <ChevronDownIcon className="text-ink-700 h-5 w-5" />
                      ) : (
                        <ChevronUpIcon className="text-ink-700 h-5 w-5" />
                      )}
                      <Avatar
                        username={user.username}
                        avatarUrl={user.avatarUrl}
                        size={'xs'}
                        className="bg-ink-1000"
                        noLink
                      />
                    </Row>
                  </Button>
                </Row>
              )}
            </div>
          </Row>
        )}

        {isCurrentUser && !isMobile && (
          <Row className="justify-end">
            <Button
              color="gray-white"
              size="xs"
              onClick={() => setExpandProfileInfo((v) => !v)}
            >
              <Row className="items-center gap-2">
                {expandProfileInfo ? (
                  <ChevronDownIcon className="text-ink-700 h-5 w-5" />
                ) : (
                  <ChevronUpIcon className="text-ink-700 h-5 w-5" />
                )}
                <Avatar
                  username={user.username}
                  avatarUrl={user.avatarUrl}
                  size={'xs'}
                  className="bg-ink-1000"
                  noLink
                />
              </Row>
            </Button>
          </Row>
        )}

        {(!isCurrentUser || expandProfileInfo) && (
          <Col className="mb-2">
            <Row className={clsx('mx-4 flex-wrap justify-between gap-2 py-1')}>
              <Row className={clsx('gap-2')} ref={titleRef}>
                <Col className={'relative max-h-14'}>
                  <ImageWithBlurredShadow
                    image={
                      <Avatar
                        username={user.username}
                        avatarUrl={user.avatarUrl}
                        size={'lg'}
                        className="bg-ink-1000"
                        noLink
                      />
                    }
                  />
                  {isCurrentUser && (
                    <Link
                      className=" bg-primary-600 shadow-primary-300 hover:bg-primary-700 text-ink-0 absolute bottom-0 right-0 h-6 w-6 rounded-full p-1.5 shadow-sm"
                      href="/profile"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <PencilIcon className="text-ink-0 h-3.5 w-3.5 " />
                    </Link>
                  )}
                </Col>
                <StackedUserNames
                  usernameClassName={'sm:text-base'}
                  className={'font-bold sm:mr-0 sm:text-xl'}
                  user={user}
                  followsYou={followsYou}
                />
              </Row>
              {isCurrentUser ? (
                <Row className={'items-center gap-1 sm:gap-2'}>
                  <Link
                    href={`/${user.username}/partner`}
                    className={clsx(
                      'hover:text-primary-500 text-ink-600 text-xs',
                      dailyStatsClass
                    )}
                  >
                    <LuCrown className="mx-auto text-2xl" />
                    Partner
                  </Link>
                  <DailyLeagueStat user={user} />
                  <QuestsOrStreak user={user} />
                </Row>
              ) : isMobile ? (
                <Row className={'items-center gap-1 sm:gap-2'}>
                  <SendMessageButton toUser={user} currentUser={currentUser} />
                  <FollowButton userId={user.id} />
                </Row>
              ) : (
                <Row className="items-center gap-1 sm:gap-2">
                  <SendMessageButton toUser={user} currentUser={currentUser} />
                  <FollowButton userId={user.id} />
                  <MoreOptionsUserButton user={user} />
                </Row>
              )}
            </Row>
            <Col className={'mx-4 mt-1'}>
              <ProfilePublicStats user={user} currentUser={currentUser} />
              {user.bio && (
                <div className="sm:text-md mt-1 text-sm">
                  <Linkify text={user.bio}></Linkify>
                </div>
              )}
              <UserHandles
                website={user.website}
                twitterHandle={user.twitterHandle}
                discordHandle={user.discordHandle}
                className="mt-2"
              />
            </Col>
          </Col>
        )}

        <Col className="mx-4">
          <QueryUncontrolledTabs
            trackingName={'profile tabs'}
            labelsParentClassName={'gap-0 sm:gap-4'}
            labelClassName={'pb-2 pt-2'}
            tabs={buildArray(
              isCurrentUser && {
                title: 'Summary',
                prerender: true,
                stackedTabIcon: <PresentationChartLineIcon className="h-5" />,
                content: (
                  <PortfolioSummary
                    className="mt-4"
                    user={user}
                    balanceChanges={balanceChanges}
                  />
                ),
              },
              (!!user.lastBetTime || hasBetBalanceChanges) && {
                title: 'Trades',
                prerender: true,
                stackedTabIcon: <ManaCircleIcon className="h-5 w-5" />,
                content: (
                  <>
                    <Spacer h={2} />
                    {!isCurrentUser && (
                      <>
                        <PortfolioValueSection
                          userId={user.id}
                          defaultTimePeriod={
                            currentUser?.id === user.id ? 'weekly' : 'monthly'
                          }
                          lastUpdatedTime={user.metricsLastUpdated}
                          hideAddFundsButton
                        />
                        <Spacer h={4} />
                      </>
                    )}
                    <UserBetsTable user={user} />
                  </>
                ),
              },
              (user.creatorTraders.allTime > 0 ||
                (user.freeQuestionsCreated ?? 0) > 0) && {
                title: 'Questions',
                prerender: true,
                stackedTabIcon: <ScaleIcon className="h-5" />,
                content: (
                  <>
                    <Spacer h={4} />
                    <UserContractsList
                      creator={user}
                      rating={rating}
                      reviewCount={reviewCount}
                      averageRating={averageRating}
                    />
                  </>
                ),
              },
              {
                title: 'Comments',
                stackedTabIcon: <ChatAlt2Icon className="h-5" />,
                content: (
                  <Col>
                    <UserCommentsList user={user} />
                  </Col>
                ),
              },
              isCurrentUser && {
                title: 'Topics',
                prerender: false,
                stackedTabIcon: <TagIcon className="h-5" />,
                content: <YourTopicsSection className="w-full" user={user} />,
              },
              {
                title: 'Balance log',
                stackedTabIcon: <ViewListIcon className="h-5" />,
                content: (
                  <BalanceChangeTable
                    user={user}
                    balanceChanges={balanceChanges}
                  />
                ),
                queryString: balanceChangesKey,
              },
              {
                title: 'Payments',
                stackedTabIcon: <CashIcon className="h-5" />,
                content: (
                  <>
                    <Spacer h={4} />
                    <UserPayments userId={user.id} />
                  </>
                ),
              }
            )}
          />
        </Col>
      </Col>
    </Page>
  )
}

type FollowsDialogTab = 'following' | 'followers'

function ProfilePublicStats(props: {
  user: User
  currentUser: User | undefined | null
  className?: string
}) {
  const { user, className, currentUser } = props
  const isCurrentUser = user.id === currentUser?.id
  const [followsOpen, setFollowsOpen] = useState(false)
  const [followsTab, setFollowsTab] = useState<FollowsDialogTab>('following')
  const followingIds = useFollows(user.id)
  const followerIds = useFollowers(user.id)
  const openFollowsDialog = (tabName: FollowsDialogTab) => {
    setFollowsOpen(true)
    setFollowsTab(tabName)
  }

  const leagueInfo = useLeagueInfo(user.id)

  return (
    <Row
      className={clsx(
        'text-ink-600 flex-wrap items-center gap-x-2 text-sm',
        className
      )}
    >
      <TextButton onClick={() => openFollowsDialog('following')}>
        <span className={clsx('font-semibold')}>
          {followingIds?.length ?? ''}
        </span>{' '}
        Following
      </TextButton>
      <TextButton onClick={() => openFollowsDialog('followers')}>
        <span className={clsx('font-semibold')}>
          {followerIds?.length ?? ''}
        </span>{' '}
        Followers
      </TextButton>

      {isCurrentUser && <UserLikedContractsButton user={user} />}

      {!isCurrentUser && leagueInfo && (
        <Link
          className={linkClass}
          href={getLeaguePath(
            leagueInfo.season,
            leagueInfo.division,
            leagueInfo.cohort,
            user.id
          )}
        >
          <TrophyIcon className="mb-1 mr-1 inline h-4 w-4" />
          <span className={clsx('font-semibold')}>
            {DIVISION_NAMES[leagueInfo.division ?? '']}
          </span>{' '}
          Rank {leagueInfo.rank}
        </Link>
      )}

      <Link
        href={'/' + user.username + '/calibration'}
        className={clsx(linkClass, 'text-sm')}
      >
        <ChartBarIcon className="mb-1 mr-1 inline h-4 w-4" />
        Calibration
      </Link>
      <ShareButton user={user} currentUser={currentUser} />

      <FollowsDialog
        user={user}
        defaultTab={followsTab}
        followingIds={followingIds}
        followerIds={followerIds}
        isOpen={followsOpen}
        setIsOpen={setFollowsOpen}
      />
    </Row>
  )
}

const ShareButton = (props: {
  user: User
  currentUser: User | undefined | null
}) => {
  const { user, currentUser } = props
  const isSameUser = currentUser?.id === user.id
  const url = `https://${ENV_CONFIG.domain}/${user.username}${
    !isSameUser && currentUser ? referralQuery(currentUser.username) : ''
  }`
  const [isOpen, setIsOpen] = useState(false)

  return (
    <Row className={'items-center'}>
      <CopyLinkOrShareButton
        url={url}
        iconClassName={'h-3'}
        className={'gap-1 p-0'}
        eventTrackingName={'share user page'}
        tooltip={'Copy link to profile'}
        size={'2xs'}
      >
        <span className={'text-sm'}>Share</span>
      </CopyLinkOrShareButton>

      <Modal open={isOpen} setOpen={setIsOpen}>
        <Col className="bg-canvas-0 max-h-[90vh] rounded pt-6">
          <div className="px-6 pb-1 text-center text-xl">{user.name}</div>
          <CopyLinkRow url={url} eventTrackingName="copy referral link" />
          <QRCode url={url} className="mt-4 self-center" />
        </Col>
      </Modal>
    </Row>
  )
}

function FollowsDialog(props: {
  user: User
  followingIds: string[] | undefined
  followerIds: string[] | undefined
  defaultTab: FollowsDialogTab
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
}) {
  const { user, followingIds, followerIds, defaultTab, isOpen, setIsOpen } =
    props

  const currentUser = useUser()
  const myFollowedIds = useFollows(currentUser?.id)
  const suggestedUserIds = useDiscoverUsers(
    isOpen ? user.id : undefined, // don't bother fetching this unless someone looks
    myFollowedIds ?? [],
    50
  )

  usePrefetchUsers([
    ...(followerIds ?? []),
    ...(followingIds ?? []),
    ...(suggestedUserIds ?? []),
  ])

  return (
    <Modal open={isOpen} setOpen={setIsOpen}>
      <Col className="bg-canvas-0 max-h-[90vh] rounded pt-6">
        <div className="px-6 pb-1 text-center text-xl">{user.name}</div>
        <Tabs
          className="mx-6"
          tabs={[
            {
              title: 'Following',
              content: <FollowList userIds={followingIds} />,
            },
            {
              title: 'Followers',
              content: <FollowList userIds={followerIds} />,
            },
            {
              title: 'Similar',
              content: <FollowList userIds={suggestedUserIds} />,
            },
          ]}
          defaultIndex={defaultTab === 'following' ? 0 : 1}
        />
      </Col>
    </Modal>
  )
}
