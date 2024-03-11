import { Contract, Visibility } from 'common/contract'
import { useEffect, useState } from 'react'
import {
  getContract,
  getContracts,
  getIsPrivateContractMember,
  getPublicContractIdsInTopics,
  getPublicContractsByIds,
  getRecentPublicContractRows,
} from 'web/lib/supabase/contracts'
import { useSubscription } from 'web/lib/supabase/realtime/use-subscription'
import { useEffectCheckEquality } from './use-effect-check-equality'
import { useContractFirebase } from './use-contract-firebase'
import { difference, uniqBy } from 'lodash'

export const usePublicContracts = (
  contractIds: string[] | undefined,
  topicSlugs?: string[],
  ignoreSlugs?: string[]
) => {
  const [contracts, setContracts] = useState<Contract[] | undefined>()

  useEffectCheckEquality(() => {
    // Only query new ids
    const newIds = difference(
      contractIds ?? [],
      contracts?.map((c) => c.id) ?? []
    )
    if (newIds.length == 0) return
    if (topicSlugs) {
      getPublicContractIdsInTopics(newIds, topicSlugs, ignoreSlugs).then(
        (result) => {
          setContracts((old) => uniqBy([...result, ...(old ?? [])], 'id'))
        }
      )
    } else
      getPublicContractsByIds(newIds).then((result) => {
        setContracts((old) => uniqBy([...result, ...(old ?? [])], 'id'))
      })
  }, [contractIds, topicSlugs, ignoreSlugs])

  return contracts
}

export function useRealtimeContract(contractId: string) {
  const { rows } = useSubscription('contracts', {
    k: 'id',
    v: contractId ?? '_',
  })
  return rows != null && rows.length > 0
    ? (rows[0].data as Contract)
    : undefined
}

export function useIsPrivateContractMember(userId: string, contractId: string) {
  const [isPrivateContractMember, setIsPrivateContractMember] = useState<
    boolean | undefined | null
  >(undefined)
  useEffect(() => {
    getIsPrivateContractMember(userId, contractId).then((result) => {
      setIsPrivateContractMember(result)
    })
  }, [userId, contractId])
  return isPrivateContractMember
}

export const useContracts = (
  contractIds: string[],
  pk: 'id' | 'slug' = 'id',
  initial: Contract[] = []
) => {
  const [contracts, setContracts] = useState(initial)

  useEffectCheckEquality(() => {
    if (contractIds) {
      getContracts(contractIds, pk).then((result) => {
        setContracts(result)
      })
    }
  }, [contractIds])

  return contracts
}

export const useContract = (contractId: string | undefined) => {
  const [contract, setContract] = useState<Contract | undefined | null>(
    undefined
  )

  useEffect(() => {
    if (contractId) {
      getContract(contractId).then((result) => {
        setContract(result)
      })
    }
  }, [contractId])

  return contract
}

export function useRealtimeNewContracts(limit: number) {
  const [startTime] = useState<string>(new Date().toISOString())
  const { rows } = useSubscription(
    'contracts',
    { k: 'created_time', op: 'gte', v: startTime },
    () => getRecentPublicContractRows({ limit })
  )
  return (rows ?? []).map((r) => r.data as Contract)
}

export function useFirebasePublicContract(
  visibility: Visibility,
  contractId: string
) {
  return useContractFirebase(contractId) // useRealtimeContract(contractId)
}
