import { useEffect, useState } from 'react'
import { noop, uniq, intersection } from 'lodash'

import { Col } from 'web/components/layout/col'
import { useUser } from 'web/hooks/use-user'
import { Modal } from 'web/components/layout/modal'
import { PillButton } from 'web/components/buttons/pill-button'
import { Button } from 'web/components/buttons/button'
import { getSubtopics, removeEmojis, TOPICS_TO_SUBTOPICS } from 'common/topics'
import { api, followTopic, followUser } from 'web/lib/firebase/api'
import { Group } from 'common/group'
import { Row } from 'web/components/layout/row'
import { updateUser } from 'web/lib/firebase/users'
import { unfollowTopic } from 'web/lib/supabase/groups'
import { track } from 'web/lib/service/analytics'

export function TopicSelectorDialog(props: {
  skippable: boolean
  trendingTopics: Group[]
  userInterestedTopics: Group[]
  userBetInTopics: Group[]
  onClose?: () => void
  setFeedKey?: (key: string) => void
}) {
  const {
    skippable,
    userInterestedTopics,
    trendingTopics,
    userBetInTopics,
    onClose,
    setFeedKey,
  } = props

  const user = useUser()

  const [userSelectedTopics, setUserSelectedTopics] = useState<
    string[] | undefined
  >()

  const topics = Object.keys(TOPICS_TO_SUBTOPICS)

  useEffect(() => {
    if (userBetInTopics.length > 0) {
      userBetInTopics.forEach((group) => selectTopic(group.id))
    } else if (userInterestedTopics.length > 0) {
      userInterestedTopics.forEach((group) => selectTopic(group.id))
    }
  }, [])

  const selectTopic = (groupId: string) => {
    if (selectedTopics.includes(groupId)) {
      if (user) unfollowTopic(groupId, user.id).catch((e) => console.error(e))
      setUserSelectedTopics((tops) => (tops ?? []).filter((t) => t !== groupId))
    } else {
      setUserSelectedTopics((tops) => uniq([...(tops ?? []), groupId]))
      if (user) followTopic({ groupId }).catch((e) => console.error(e))
    }
  }

  const [isLoading, setIsLoading] = useState(false)

  const closeDialog = async (skipUpdate: boolean) => {
    setIsLoading(true)

    if (user && !skipUpdate) {
      // Don't await as this takes a long time.
      api('update-user-embedding', {}).then(() => {
        if (setFeedKey) {
          console.log('setting feed key to regenerate home feed')
          setFeedKey('feed-after-updating-user-with-topics')
        }
      })
    }

    if (user) await updateUser(user.id, { shouldShowWelcome: false })

    onClose?.()

    // if user is following us politics
    if (
      intersection(selectedTopics, [
        'AjxQR8JMpNyDqtiqoA96',
        'pYwsGvORZFlcq7QrkI6n',
        'cEzcLXuitr6o4VPI01Q1',
      ]).length > 0
    ) {
      await followUser('vuI5upWB8yU00rP7yxj95J2zd952') // follow @ManifoldPolitics
    }
  }
  const selectedTopics: string[] = userSelectedTopics ?? []

  const pillButton = (
    topicWithEmoji: string,
    topicName: string,
    groupIds: string[]
  ) => (
    <PillButton
      key={topicName}
      selected={groupIds.every((g) => selectedTopics.includes(g))}
      onSelect={() => {
        groupIds.map((g) => selectTopic(g))
        track('onboarding select topic', { name: topicName })
      }}
    >
      {topicWithEmoji}
    </PillButton>
  )

  return (
    <Modal
      open
      setOpen={skippable ? closeDialog : noop}
      className="bg-canvas-0 overflow-hidden rounded-md"
      size={'lg'}
    >
      <Col className="h-[32rem] overflow-y-auto">
        <div className="bg-canvas-0 sticky top-0 px-5 py-4">
          <p className="text-primary-700 mb-2 text-2xl">What interests you?</p>
          <span>Select 3 or more topics.</span>
        </div>
        <Col className={'mb-4 px-5'}>
          <div className="text-ink-700 text-sm">
            {userInterestedTopics.length > 0 || userBetInTopics.length > 0
              ? 'Suggested'
              : 'Trending now'}
          </div>
          <Row className={'flex-wrap gap-1 '}>
            {trendingTopics.map((group) => (
              <div className="" key={group.id + '-section'}>
                {pillButton(group.name, removeEmojis(group.name), [group.id])}
              </div>
            ))}
          </Row>
        </Col>

        {topics.map((topic) => (
          <div className="mb-3 px-4" key={topic + '-section'}>
            <div className="text-ink-700 text-sm">{topic.slice(3)}</div>
            <Row className="flex flex-wrap gap-x-1 gap-y-1.5">
              {getSubtopics(topic)
                .filter(([_, __, groupId]) => !!groupId)
                .map(([subtopicWithEmoji, subtopic, groupIds]) => {
                  return pillButton(subtopicWithEmoji, subtopic, groupIds)
                })}
            </Row>
          </div>
        ))}

        <div className="from-canvas-0 pointer-events-none sticky bottom-0 bg-gradient-to-t to-transparent text-right">
          <span className="pointer-events-auto inline-flex gap-2 p-6 pt-2">
            {skippable && (
              <Button
                onClick={() => closeDialog(true)}
                color="gray-white"
                className="bg-canvas-50 text-ink"
              >
                Skip
              </Button>
            )}
            <Button
              onClick={() => closeDialog(false)}
              disabled={(userSelectedTopics ?? []).length <= 2}
              loading={isLoading}
            >
              Done
            </Button>
          </span>
        </div>
      </Col>
    </Modal>
  )
}
