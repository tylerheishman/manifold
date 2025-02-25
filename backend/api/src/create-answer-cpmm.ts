import * as admin from 'firebase-admin'
import { groupBy, partition, sumBy } from 'lodash'
import { CPMMMultiContract, Contract, add_answers_mode } from 'common/contract'
import { User } from 'common/user'
import { CandidateBet, getBetDownToOneMultiBetInfo } from 'common/new-bet'
import { Answer, getMaximumAnswers } from 'common/answer'
import { APIError, APIHandler } from './helpers/endpoint'
import { ANSWER_COST } from 'common/economy'
import { randomString } from 'common/util/random'
import { getUnfilledBetsAndUserBalances, updateMakers } from './place-bet'
import { FieldValue } from 'firebase-admin/firestore'
import {
  addCpmmMultiLiquidityAnswersSumToOne,
  getCpmmProbability,
} from 'common/calculate-cpmm'
import { isAdminId } from 'common/envs/constants'
import { Bet } from 'common/bet'
import { floatingEqual } from 'common/util/math'
import { noFees } from 'common/fees'
import { getCpmmInitialLiquidity } from 'common/antes'
import { addUserToContractFollowers } from 'shared/follow-market'
import { log } from 'shared/utils'
import { createNewAnswerOnContractNotification } from 'shared/create-notification'
import { removeUndefinedProps } from 'common/util/object'

export const createAnswerCPMM: APIHandler<'market/:contractId/answer'> = async (
  props,
  auth
) => {
  const { contractId, text } = props
  return await createAnswerCpmmMain(contractId, text, auth!.uid)
}

export const createAnswerCpmmMain = async (
  contractId: string,
  text: string,
  creatorId: string,
  options: {
    overrideAddAnswersMode?: add_answers_mode
    specialLiquidityPerAnswer?: number
    loverUserId?: string
  } = {}
) => {
  const { overrideAddAnswersMode, specialLiquidityPerAnswer, loverUserId } =
    options
  log('Received ' + contractId + ' ' + text)

  // Run as transaction to prevent race conditions.
  const { newAnswerId, contract, user } = await firestore.runTransaction(
    async (transaction) => {
      const contractDoc = firestore.doc(`contracts/${contractId}`)
      const contractSnap = await transaction.get(contractDoc)
      if (!contractSnap.exists) throw new APIError(404, 'Contract not found')
      const contract = contractSnap.data() as Contract

      // TODO if mechanism === 'dpm' call dpm create answer

      if (contract.mechanism !== 'cpmm-multi-1')
        throw new APIError(403, 'Requires a cpmm multiple choice contract')
      if (contract.outcomeType === 'NUMBER')
        throw new APIError(
          403,
          'Cannot create new answers for numeric contracts'
        )

      const { closeTime, shouldAnswersSumToOne } = contract
      if (closeTime && Date.now() > closeTime)
        throw new APIError(403, 'Trading is closed')

      const addAnswersMode = overrideAddAnswersMode ?? contract.addAnswersMode

      if (!addAnswersMode || addAnswersMode === 'DISABLED') {
        throw new APIError(400, 'Adding answers is disabled')
      }
      if (
        contract.addAnswersMode === 'ONLY_CREATOR' &&
        contract.creatorId !== creatorId &&
        !isAdminId(creatorId)
      ) {
        throw new APIError(
          403,
          'Only the creator or an admin can create an answer'
        )
      }

      const userDoc = firestore.doc(`users/${creatorId}`)
      const userSnap = await transaction.get(userDoc)
      if (!userSnap.exists)
        throw new APIError(401, 'Your account was not found')
      const user = userSnap.data() as User

      if (user.isBannedFromPosting) throw new APIError(403, 'You are banned')

      if (user.balance < ANSWER_COST && !specialLiquidityPerAnswer)
        throw new APIError(403, 'Insufficient balance, need M' + ANSWER_COST)

      const answersSnap = await transaction.get(
        firestore.collection(`contracts/${contractId}/answersCpmm`)
      )
      const answers = answersSnap.docs.map((doc) => doc.data() as Answer)
      const unresolvedAnswers = answers.filter((a) => !a.resolution)
      const maxAnswers = getMaximumAnswers(contract.shouldAnswersSumToOne)
      if (unresolvedAnswers.length >= maxAnswers) {
        throw new APIError(
          403,
          `Cannot add an answer: Maximum number (${maxAnswers}) of open answers reached.`
        )
      }

      let poolYes = ANSWER_COST
      let poolNo = ANSWER_COST
      let totalLiquidity = ANSWER_COST
      let prob = 0.5

      if (specialLiquidityPerAnswer) {
        if (shouldAnswersSumToOne)
          throw new APIError(
            500,
            "Can't specify specialLiquidityPerAnswer and shouldAnswersSumToOne"
          )
        prob = 0.02
        poolYes = specialLiquidityPerAnswer
        poolNo = specialLiquidityPerAnswer / (1 / prob - 1)
        totalLiquidity = specialLiquidityPerAnswer
      }

      const id = randomString()
      const n = answers.length
      const createdTime = Date.now()
      const newAnswer: Answer = removeUndefinedProps({
        id,
        index: n,
        contractId,
        createdTime,
        userId: user.id,
        text,
        isOther: false,
        poolYes,
        poolNo,
        prob,
        totalLiquidity,
        subsidyPool: 0,
        probChanges: { day: 0, week: 0, month: 0 },
        loverUserId,
      })

      if (shouldAnswersSumToOne) {
        await createAnswerAndSumAnswersToOne(
          transaction,
          user,
          contract,
          answers,
          newAnswer
        )
      } else {
        const newAnswerDoc = contractDoc
          .collection('answersCpmm')
          .doc(newAnswer.id)
        transaction.create(newAnswerDoc, newAnswer)
      }

      if (!specialLiquidityPerAnswer) {
        transaction.update(userDoc, {
          balance: FieldValue.increment(-ANSWER_COST),
          totalDeposits: FieldValue.increment(-ANSWER_COST),
        })
        transaction.update(contractDoc, {
          totalLiquidity: FieldValue.increment(ANSWER_COST),
        })
        const liquidityDoc = firestore
          .collection(`contracts/${contract.id}/liquidity`)
          .doc()
        const lp = getCpmmInitialLiquidity(
          user.id,
          contract,
          liquidityDoc.id,
          ANSWER_COST,
          createdTime,
          newAnswer.id
        )
        transaction.create(liquidityDoc, lp)
      }

      return { newAnswerId: newAnswer.id, contract, user }
    }
  )

  const { shouldAnswersSumToOne, addAnswersMode } = contract
  if (shouldAnswersSumToOne && addAnswersMode !== 'DISABLED') {
    await convertOtherAnswerShares(contractId, newAnswerId)
  }

  const continuation = async () => {
    await createNewAnswerOnContractNotification(
      newAnswerId,
      user,
      text,
      contract
    )
    await addUserToContractFollowers(contractId, creatorId)
  }
  return { result: { newAnswerId }, continue: continuation }
}

async function createAnswerAndSumAnswersToOne(
  transaction: FirebaseFirestore.Transaction,
  user: User,
  contract: CPMMMultiContract,
  answers: Answer[],
  newAnswer: Answer
) {
  const [otherAnswers, answersWithoutOther] = partition(
    answers,
    (a) => a.isOther
  )
  const otherAnswer = otherAnswers[0]
  if (!otherAnswer) {
    throw new APIError(
      500,
      '"Other" answer not found, and is required for adding new answers.'
    )
  }

  const contractDoc = firestore.doc(`contracts/${contract.id}`)
  const newAnswerDoc = contractDoc.collection('answersCpmm').doc(newAnswer.id)

  // 1. Create a mana budget including ANSWER_COST, and shares from Other.
  // 2. Keep track of excess Yes and No shares of Other. Other has been divided
  // into three pieces: mana, excessYesShares, excessNoShares.
  // 3a. Recreate liquidity for the new answer and other by spending mana.
  // 3b. Add excessYesShares to both other and the new answer's pools.
  // These Yes shares can be copied because, conceptually, if the new answer is split out of Other,
  // then original yes shares in Other should pay out if either it or Other is chosen.
  // Note that the new answer has up to ANSWER_COST liquidity, while the remainder of liquidity,
  // which could be a lot, is spent on the other answer.
  // 4. Convert excess No shares in Other into Yes shares in all the previous answers and add them
  // to previous answers' pools.
  // 5. Probability sum is now greater than 1. Bet it down equally.
  // Proof of >1 prob sum:
  // a. If there are excess Yes shares, then old answer probs are unchanged, so
  // prob of new answer + prob of other answer must be > than previous prob of other answer. Empirically true...
  // b. If there are excess No shares, then new answer & other answer each has 50% prob.
  // 6. Betting it down to 1 produces mana, which we then insert as subsidy.
  const mana = ANSWER_COST + Math.min(otherAnswer.poolYes, otherAnswer.poolNo)
  const excessYesShares = Math.max(0, otherAnswer.poolYes - otherAnswer.poolNo)
  const excessNoShares = Math.max(0, otherAnswer.poolNo - otherAnswer.poolYes)

  const answerCostOrHalf = Math.min(ANSWER_COST, mana / 2)
  const newAnswerPool = {
    YES: answerCostOrHalf + excessYesShares,
    NO: answerCostOrHalf,
  }
  const newOtherPool = {
    YES: mana - answerCostOrHalf + excessYesShares,
    NO: mana - answerCostOrHalf,
  }

  const newAnswerProb = getCpmmProbability(newAnswerPool, 0.5)
  const otherProb = getCpmmProbability(newOtherPool, 0.5)
  const n = answers.length

  newAnswer = {
    ...newAnswer,
    index: n - 1,
    poolYes: newAnswerPool.YES,
    poolNo: newAnswerPool.NO,
    prob: newAnswerProb,
    totalLiquidity: answerCostOrHalf,
  }

  const updatedOtherAnswerProps = {
    totalLiquidity: newOtherPool.NO,
    index: n,
  }

  const updatedOtherAnswer = {
    ...otherAnswer,
    ...updatedOtherAnswerProps,
    poolYes: newOtherPool.YES,
    poolNo: newOtherPool.NO,
    prob: otherProb,
  }

  const updatedPreviousAnswers = answersWithoutOther.map((a) => ({
    ...a,
    poolYes: a.poolYes + excessNoShares,
  }))

  const answersWithNewAnswer = [
    ...updatedPreviousAnswers,
    newAnswer,
    updatedOtherAnswer,
  ]
  const { unfilledBets, balanceByUserId } =
    await getUnfilledBetsAndUserBalances(transaction, contractDoc)

  // Cancel limit orders on Other answer.
  const [unfilledBetsOnOther, unfilledBetsExcludingOther] = partition(
    unfilledBets,
    (b) => b.answerId === otherAnswer.id
  )

  const { betResults, extraMana } = getBetDownToOneMultiBetInfo(
    contract,
    answersWithNewAnswer,
    unfilledBetsExcludingOther,
    balanceByUserId
  )

  log('New answer', { newAnswer })
  log('Other answer', { updatedOtherAnswer })
  log('extraMana ' + extraMana)
  log('bet amounts', {
    amounts: betResults.map((r) =>
      sumBy(r.takers.slice(0, r.takers.length - 1), (t) => t.amount)
    ),
    shares: betResults.map((r) =>
      sumBy(r.takers.slice(0, r.takers.length - 1), (t) => t.shares)
    ),
  })

  transaction.create(newAnswerDoc, newAnswer)
  transaction.update(
    contractDoc.collection('answersCpmm').doc(otherAnswer.id),
    updatedOtherAnswerProps
  )

  const poolsByAnswer = Object.fromEntries(
    betResults.map((r) => [
      r.answer.id,
      r.cpmmState.pool as { YES: number; NO: number },
    ])
  )
  for (const [answerId, pool] of Object.entries(poolsByAnswer)) {
    const { YES: poolYes, NO: poolNo } = pool
    const prob = poolNo / (poolYes + poolNo)
    log('After arbitrage answer ', {
      answerText: newAnswer.text,
      answerId,
      poolYes,
      poolNo,
      prob,
    })
  }
  const newPoolsByAnswer = addCpmmMultiLiquidityAnswersSumToOne(
    poolsByAnswer,
    extraMana
  )

  for (const result of betResults) {
    const { answer, bet, makers, ordersToCancel } = result
    const betDoc = contractDoc.collection('bets').doc()
    transaction.create(betDoc, {
      id: betDoc.id,
      userId: user.id,
      userAvatarUrl: user.avatarUrl,
      userUsername: user.username,
      userName: user.name,
      isApi: false,
      ...bet,
    })
    const pool = newPoolsByAnswer[answer.id]
    const { YES: poolYes, NO: poolNo } = pool
    const prob = getCpmmProbability(pool, 0.5)
    log('Updating answer ', {
      answerText: answer.text,
      poolYes,
      poolNo,
      prob,
    })
    transaction.update(contractDoc.collection('answersCpmm').doc(answer.id), {
      poolYes,
      poolNo,
      prob,
    })
    updateMakers(makers, betDoc.id, contractDoc, transaction)
    for (const bet of ordersToCancel) {
      transaction.update(contractDoc.collection('bets').doc(bet.id), {
        isCancelled: true,
      })
    }
  }

  for (const bet of unfilledBetsOnOther) {
    transaction.update(contractDoc.collection('bets').doc(bet.id), {
      isCancelled: true,
    })
  }
}

const firestore = admin.firestore()

async function convertOtherAnswerShares(
  contractId: string,
  newAnswerId: string
) {
  // Run as transaction to prevent race conditions.
  const { answers, betsByUserId, newAnswer, otherAnswer } =
    await firestore.runTransaction(async (transaction) => {
      const now = Date.now()
      const contractDoc = firestore.doc(`contracts/${contractId}`)
      const answersSnap = await transaction.get(
        contractDoc.collection('answersCpmm').orderBy('index')
      )
      const answers = answersSnap.docs.map((doc) => doc.data() as Answer)
      const newAnswer = answers.find((a) => a.id === newAnswerId)!
      const otherAnswer = answers.find((a) => a.isOther)!

      const betsSnap = await transaction.get(
        contractDoc.collection('bets').where('answerId', '==', otherAnswer.id)
      )
      const bets = betsSnap.docs.map((doc) => doc.data() as Bet)
      const betsByUserId = groupBy(bets, (b) => b.userId)

      // Gain YES shares in new answer for each YES share in Other.
      for (const [userId, bets] of Object.entries(betsByUserId)) {
        const position = sumBy(
          bets,
          (b) => b.shares * (b.outcome === 'YES' ? 1 : -1)
        )
        if (!floatingEqual(position, 0) && position > 0) {
          const betDoc = contractDoc.collection('bets').doc()
          const freeYesSharesBet: CandidateBet & {
            id: string
            userId: string
          } = {
            id: betDoc.id,
            contractId,
            userId,
            answerId: newAnswer.id,
            outcome: 'YES',
            shares: position,
            amount: 0,
            isCancelled: false,
            isFilled: true,
            loanAmount: 0,
            probBefore: newAnswer.prob,
            probAfter: newAnswer.prob,
            createdTime: now,
            fees: noFees,
            isAnte: false,
            isRedemption: true,
            isChallenge: false,
            visibility: bets[0].visibility,
            isApi: false,
          }
          transaction.create(betDoc, freeYesSharesBet)
        }
      }

      return { answers, betsByUserId, newAnswer, otherAnswer }
    })

  await Promise.all(
    // Convert NO shares in Other answer to YES shares in all other answers (excluding new answer).
    Object.entries(betsByUserId).map(async ([userId, bets]) => {
      // Run each in a separate transaction so we don't hit 500 doc limit.
      await firestore.runTransaction(async (transaction) => {
        const now = Date.now()
        const contractDoc = firestore.doc(`contracts/${contractId}`)
        const noPosition = sumBy(
          bets,
          (b) => b.shares * (b.outcome === 'YES' ? -1 : 1)
        )
        if (!floatingEqual(noPosition, 0) && noPosition > 0) {
          const betDoc = contractDoc.collection('bets').doc()
          const convertNoSharesBet: CandidateBet & {
            id: string
            userId: string
          } = {
            id: betDoc.id,
            contractId,
            userId,
            answerId: otherAnswer.id,
            outcome: 'NO',
            shares: -noPosition,
            amount: 0,
            isCancelled: false,
            isFilled: true,
            loanAmount: 0,
            probBefore: otherAnswer.prob,
            probAfter: otherAnswer.prob,
            createdTime: now,
            fees: noFees,
            isAnte: false,
            isRedemption: true,
            isChallenge: false,
            visibility: bets[0].visibility,
            isApi: false,
          }
          transaction.create(betDoc, convertNoSharesBet)

          const previousAnswers = answers.filter(
            (a) => a.id !== newAnswer.id && a.id !== otherAnswer.id
          )
          for (const answer of previousAnswers) {
            const betDoc = contractDoc.collection('bets').doc()
            const gainYesSharesBet: CandidateBet & {
              id: string
              userId: string
            } = {
              id: betDoc.id,
              contractId,
              userId,
              answerId: answer.id,
              outcome: 'YES',
              shares: noPosition,
              amount: 0,
              isCancelled: false,
              isFilled: true,
              loanAmount: 0,
              probBefore: answer.prob,
              probAfter: answer.prob,
              createdTime: now,
              fees: noFees,
              isAnte: false,
              isRedemption: true,
              isChallenge: false,
              visibility: bets[0].visibility,
              isApi: false,
            }
            transaction.create(betDoc, gainYesSharesBet)
          }
        }
      })
    })
  )
  return answers
}
