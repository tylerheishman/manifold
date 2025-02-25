import { APIError, APIHandler } from 'api/helpers/endpoint'
import {
  log,
  getContractSupabase,
  revalidateContractStaticProps,
  getUser,
  processPaginated,
} from 'shared/utils'
import * as admin from 'firebase-admin'
import { trackPublicEvent } from 'shared/analytics'
import { throwErrorIfNotMod } from 'shared/helpers/auth'
import { removeUndefinedProps } from 'common/util/object'
import { recordContractEdit } from 'shared/record-contract-edit'
import { buildArray } from 'common/util/array'
import { anythingToRichText } from 'shared/tiptap'
import { isEmpty } from 'lodash'
import { Contract } from 'common/contract'
import { createCommentOrUpdatedContractNotification } from 'shared/create-notification'

export const updateMarket: APIHandler<'market/:contractId/update'> = async (
  body,
  auth
) => {
  const { contractId, ...fields } = body
  if (isEmpty(fields))
    throw new APIError(400, 'Must provide some change to the contract')

  const {
    visibility,
    addAnswersMode,
    closeTime,
    sort,
    question,
    coverImageUrl,
    isPolitics,

    description: raw,
    descriptionHtml: html,
    descriptionMarkdown: markdown,
    descriptionJson: jsonString,
  } = fields

  const description = anythingToRichText({ raw, html, markdown, jsonString })

  const contract = await getContractSupabase(contractId)
  if (!contract) throw new APIError(404, `Contract ${contractId} not found`)
  if (contract.creatorId !== auth.uid) await throwErrorIfNotMod(auth.uid)

  const modOnlyFields = ['isPolitics']
  const modOnlyFieldsChanged = Object.keys(fields).some((key) =>
    modOnlyFields.includes(key)
  )
  if (modOnlyFieldsChanged) await throwErrorIfNotMod(auth.uid)

  await trackPublicEvent(
    auth.uid,
    'update market',
    removeUndefinedProps({
      contractId,
      visibility,
      closeTime,
      addAnswersMode,
    })
  )

  await firestore.doc(`contracts/${contractId}`).update(
    removeUndefinedProps({
      question,
      coverImageUrl,
      closeTime,
      visibility,
      unlistedById: visibility === 'unlisted' ? auth.uid : undefined,
      addAnswersMode,
      sort,
      description,
      isPolitics,
    })
  )

  log(`updated fields: ${Object.keys(fields).join(', ')}`)

  if (question || closeTime || visibility || description) {
    await recordContractEdit(
      contract,
      auth.uid,
      buildArray([
        question && 'question',
        closeTime && 'closeTime',
        visibility && 'visibility',
        description && 'description',
      ])
    )
  }

  const continuation = async () => {
    log(`Revalidating contract ${contract.id}.`)
    await revalidateContractStaticProps(contract)

    log(`Updating lastUpdatedTime for contract ${contract.id}.`)
    await firestore.collection('contracts').doc(contract.id).update({
      lastUpdatedTime: Date.now(),
    })

    if (closeTime !== undefined) {
      await handleUpdatedCloseTime(contract, closeTime, auth.uid)
    }

    //TODO: Now that we don't have private contracts, do we really need to update visibilities?
    if (visibility) {
      await updateContractSubcollectionsVisibility(contract.id, visibility)
    }
  }

  return {
    result: { success: true },
    continue: continuation,
  }
}

const firestore = admin.firestore()

async function handleUpdatedCloseTime(
  previousContract: Contract,
  newCloseTime: number,
  updaterId: string
) {
  const contractUpdater = await getUser(updaterId)
  if (!contractUpdater) throw new Error('Could not find contract updater')
  const sourceText = newCloseTime.toString()

  await createCommentOrUpdatedContractNotification(
    previousContract.id,
    'contract',
    'updated',
    contractUpdater,
    sourceText,
    previousContract
  )
}

async function updateContractSubcollectionsVisibility(
  contractId: string,
  newVisibility: 'public' | 'unlisted'
) {
  const contractRef = firestore.collection('contracts').doc(contractId)
  const batchSize = 500

  // Update bets' visibility
  const betsRef = contractRef.collection('bets')
  await processPaginated(betsRef, batchSize, (ts) => {
    const updatePromises = ts.docs.map((doc) => {
      return doc.ref.update({ visibility: newVisibility })
    })
    return Promise.all(updatePromises)
  })
}
