import { Contract } from 'common/contract'
import { Group, GroupRole, LiteGroup, Topic } from 'common/group'
import { User } from 'common/user'
import { useEffect, useState } from 'react'
import { api, getUserIsGroupMember } from 'web/lib/firebase/api'
import { db } from 'web/lib/supabase/db'
import {
  getGroup,
  getGroupFromSlug,
  getGroupMembers,
  getGroupOfRole,
  getMemberRole,
  MEMBER_LOAD_NUM,
} from 'web/lib/supabase/group'
import {
  getGroupsWhereUserHasRole,
  getMyGroupRoles,
  listGroupsBySlug,
} from 'web/lib/supabase/groups'
import { useRealtime } from 'web/lib/supabase/realtime/use-realtime'
import { useSubscription } from 'web/lib/supabase/realtime/use-subscription'
import { usePersistentInMemoryState } from './use-persistent-in-memory-state'
import { useIsAuthorized } from './use-user'
import { Row } from 'common/supabase/utils'
import { convertGroup } from 'common/supabase/groups'
import { useAsyncData } from 'web/hooks/use-async-data'
import { isAdminId, isModId } from 'common/envs/constants'
import { useAPIGetter } from 'web/hooks/use-api-getter'

export function useIsGroupMember(groupSlug: string) {
  const [isMember, setIsMember] = usePersistentInMemoryState<
    boolean | undefined
  >(undefined, 'is-member-' + groupSlug)
  const isAuthorized = useIsAuthorized()
  useEffect(() => {
    // if there is no user
    if (isAuthorized === false) {
      setIsMember(false)
    } else if (isAuthorized) {
      getUserIsGroupMember({ groupSlug: groupSlug }).then((result) => {
        setIsMember(result.isGroupMember)
      })
    }
  }, [groupSlug, isAuthorized])
  return isMember
}

export function useMemberGroupIdsOnLoad(
  userId: string | undefined | null
): string[] | undefined {
  const [groupIds, setGroupIds] = usePersistentInMemoryState<
    string[] | undefined
  >(undefined, `member-group-ids-${userId ?? ''}`)
  useEffect(() => {
    if (!userId) return
    db.from('group_members')
      .select('group_id')
      .eq('member_id', userId)
      .then((result) => {
        if (result) {
          const groupIds = (result as any).data.map((row: any) => row.group_id)
          setGroupIds(groupIds)
        }
      })
  }, [userId])
  return groupIds
}

export function useRealtimeMemberGroupIds(
  userId: string | undefined | null
): string[] | undefined {
  const { rows } = useSubscription('group_members', {
    k: 'member_id',
    v: userId ?? '_',
  })
  return rows?.map((row) => row.group_id) ?? undefined
}

export function useRealtimeGroupContractIds(groupId: string) {
  const { rows } = useSubscription('group_contracts', {
    k: 'group_id',
    v: groupId,
  })
  return rows?.map((r) => r.contract_id)
}

export const useGroupsWithContract = (
  contract: Contract | undefined | null
) => {
  const [groups, setGroups] = useState<Group[] | undefined>()
  const groupIds = useSubscription('group_contracts', {
    k: 'contract_id',
    v: contract?.id ?? '_',
  }).rows?.map((r) => r.group_id)
  useEffect(() => {
    if (groupIds) {
      db.from('groups')
        .select('*')
        .in('id', groupIds)
        .then((result) => {
          setGroups(result.data?.map(convertGroup))
        })
    }
  }, [groupIds?.length])
  return groups
}

export function useRealtimeMemberTopics(
  userId: string | undefined | null,
  limit: number = 20
) {
  const [groups, setGroups] = usePersistentInMemoryState<
    LiteGroup[] | undefined
  >(undefined, `member-topics-${userId ?? ''}`)

  // Listen for changes in membership to re-fetch their topics
  const ids = useRealtimeMemberGroupIds(userId)
  const { data, refresh } = useAPIGetter('search-my-groups', {
    limit,
    term: '',
    type: 'lite',
  })
  useEffect(() => {
    if (!ids) return
    refresh()
  }, [ids])
  useEffect(() => {
    if (data) {
      setGroups(data.lite)
    }
  }, [JSON.stringify(data)])

  return groups
}
export function useNewUserMemberTopicsAndContracts(
  user: User | null | undefined,
  enabled: boolean
) {
  type TopicWithContracts = {
    topic: Topic
    contracts: Contract[]
  }
  const [groups, setGroups] = usePersistentInMemoryState<
    TopicWithContracts[] | undefined
  >(undefined, `member-topics-and-contracts-${user?.id ?? ''}`)

  useEffect(() => {
    if (!groups?.length) setGroups(undefined) // Show loading indicator right after selecting topics
    if (enabled)
      api('get-groups-with-top-contracts', {}).then((result) => {
        setGroups(result)
      })
    else setGroups([])
  }, [enabled, user?.shouldShowWelcome])

  return groups
}

export function useGroupRole(
  groupId: string | undefined,
  user: User | null | undefined
) {
  const [userRole, setUserRole] = useState<GroupRole | null | undefined>(
    undefined
  )
  const isMod = !user ? false : isModId(user.id) || isAdminId(user.id)
  useEffect(() => {
    getTranslatedMemberRole(groupId, user).then(setUserRole)
  }, [user, groupId])

  return isMod ? 'admin' : userRole
}

export function useRealtimeGroupMemberIds(groupId: string) {
  const { rows } = useSubscription('group_members', {
    k: 'group_id',
    v: groupId,
  })
  return rows?.map((row) => row.member_id) ?? []
}

export type Member = Row<'group_role'>

export function useRealtimeGroupMembers(
  group: Group,
  hitBottom: boolean,
  numMembers: number | undefined
) {
  const { id: groupId } = group
  const [admins, setAdmins] = useState<Member[] | undefined>(undefined)
  const [moderators, setModerators] = useState<Member[] | undefined>(undefined)
  const [members, setMembers] = useState<Member[] | undefined>(undefined)
  const [loadMore, setLoadMore] = useState<boolean>(false)
  const [offsetPage, setOffsetPage] = useState<number>(0)

  function loadMoreMembers() {
    setLoadMore(true)
    getGroupMembers(groupId, offsetPage + 1)
      .then((result) => {
        if (members) {
          setMembers([...members, ...result.data])
        } else {
          setMembers(result.data)
        }
        setOffsetPage((offsetPage) => offsetPage + 1)
      })
      .catch((e) => console.log(e))
      .finally(() => setLoadMore(false))
  }
  function fetchGroupMembers() {
    getGroupOfRole(groupId, 'admin')
      .then((result) => {
        const admins = result.data
        setAdmins(admins)
      })
      .catch((e) => console.log(e))

    getGroupOfRole(groupId, 'moderator')
      .then((result) => {
        const moderators = result.data
        setModerators(moderators)
      })
      .catch((e) => console.log(e))

    if (group.totalMembers > 250) return
    getGroupMembers(groupId, offsetPage, 0)
      .then((result) => {
        const members = result.data
        setMembers(members)
      })
      .catch((e) => console.log(e))
  }

  useEffect(() => {
    fetchGroupMembers()
  }, [])

  useEffect(() => {
    if (hitBottom && !loadMore && numMembers && numMembers > MEMBER_LOAD_NUM) {
      loadMoreMembers()
    }
  }, [hitBottom])

  const filter = { k: 'group_id', v: groupId } as const
  useRealtime({
    bindings: [{ table: 'group_members', event: '*', filter }],
    onChange: (_change) => {
      fetchGroupMembers()
    },
  })

  return { admins, moderators, members, loadMore }
}

export async function getTranslatedMemberRole(
  groupId: string | undefined,
  user: User | null | undefined
) {
  if (user && groupId) {
    try {
      const { data } = await getMemberRole(user, groupId)
      if (data.length == 0) {
        return null
      }
      return (data[0]?.role ?? 'member') as GroupRole
    } catch (e) {
      console.error(e)
    }
  }
  return null
}

export function useGroupFromSlug(groupSlug: string) {
  return useAsyncData(groupSlug, (slug) => getGroupFromSlug(slug))
}
export function useGroupFromId(groupId: string) {
  return useAsyncData(groupId, (id) => getGroup(id))
}

export function useGroupsFromIds(groupIds: string[]) {
  const groups = useAsyncData(groupIds, (ids) => Promise.all(ids.map(getGroup)))
  return groups ? groups.filter((g): g is Group => !!g) : groups
}

export function useListGroupsBySlug(groupSlugs: string[]) {
  return useAsyncData(groupSlugs, listGroupsBySlug)
}

export function useMyGroupRoles(userId: string | undefined) {
  return useAsyncData(userId, getMyGroupRoles)
}

export function useGroupsWhereUserHasRole(userId: string | undefined) {
  return useAsyncData(userId, getGroupsWhereUserHasRole)
}

export const useGroupRoles = (user: User | undefined | null) => {
  const [roles, setRoles] =
    useState<Awaited<ReturnType<typeof getMyGroupRoles>>>()

  useEffect(() => {
    if (user)
      getMyGroupRoles(user.id).then((roles) =>
        setRoles(
          roles?.sort(
            (a, b) =>
              (b.role === 'admin' ? 2 : b.role === 'moderator' ? 1 : 0) -
              (a.role === 'admin' ? 2 : a.role === 'moderator' ? 1 : 0)
          )
        )
      )
  }, [])

  const groups: Group[] =
    roles?.map((g) => ({
      id: g.group_id!,
      name: g.group_name!,
      slug: g.group_slug!,
      privacyStatus: g.privacy_status as any,
      totalMembers: g.total_members!,
      creatorId: g.creator_id!,
      createdTime: g.createdtime!,
      postIds: [],
      importanceScore: 0,
    })) ?? []

  return { roles, groups }
}
