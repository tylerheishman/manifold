import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

import { CPMMBinaryContract, CPMMContract } from 'common/contract'
import {
  getPrivateUsersNotSent,
  getPrivateUser,
  getUser,
  isProd,
  log,
} from 'shared/utils'
import { filterDefined } from 'common/util/array'
import { DAY_MS } from 'common/util/time'
import { chunk, partition, sortBy, sum, uniq, uniqBy } from 'lodash'
import {
  PerContractInvestmentsData,
  OverallPerformanceData,
  emailMoneyFormat,
  sendWeeklyPortfolioUpdateEmail,
} from 'shared/emails'
import { contractUrl } from 'shared/utils'
import {
  getUsersRecentBetContractIds,
  getUsersContractMetricsOrderedByProfit,
} from 'common/supabase/contract-metrics'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { getContracts, getContractsByUsers } from 'common/supabase/contracts'
import { secrets } from 'common/secrets'
import {
  CURRENT_SEASON,
  DIVISION_NAMES,
  league_user_info,
} from 'common/leagues'
import * as numeral from 'numeral'
import { millisToTs, run } from 'common/supabase/utils'

const USERS_TO_EMAIL = 600
const WEEKLY_MOVERS_TO_SEND = 6
// This should(?) work until we have ~100k users (600 * 180)
export const weeklyPortfolioUpdateEmails = functions
  .runWith({
    secrets,
    memory: '4GB',
    timeoutSeconds: 540,
  })
  // every minute on Friday for three hours at 12pm PT (UTC -07:00)
  .pubsub.schedule('* 19-21 * * 5')
  .timeZone('Etc/UTC')
  .onRun(async () => {
    await sendPortfolioUpdateEmailsToAllUsers()
  })

const firestore = admin.firestore()

export async function sendPortfolioUpdateEmailsToAllUsers() {
  const privateUsers = isProd()
    ? // ian & stephen's ids
      // filterDefined([
      // await getPrivateUser('AJwLWoo3xue32XIiAVrL5SyR1WB2'),
      // await getPrivateUser('tlmGNz9kjXc2EteizMORes4qvWl2'),
      // ])
      await getPrivateUsersNotSent(
        'weeklyPortfolioUpdateEmailSent',
        'profit_loss_updates',
        // Send emails in batches
        USERS_TO_EMAIL
      )
    : filterDefined([await getPrivateUser('6hHpzvRG0pMq8PNJs7RZj2qlZGn2')])

  // get all users that haven't unsubscribed from weekly emails
  const privateUsersToSendEmailsTo = privateUsers.filter((user) => {
    return isProd()
      ? !user.notificationPreferences.opt_out_all.includes('email') &&
          user.email
      : user.notificationPreferences.profit_loss_updates.includes('email')
  })

  // Note from James: We are marking `privateUsers` (not `privateUsersToSendEmailsTo`) as sent,
  // so that we don't keep querying them above.
  await Promise.all(
    privateUsers.map(async (privateUser) => {
      await firestore.collection('private-users').doc(privateUser.id).update({
        weeklyPortfolioUpdateEmailSent: true,
      })
    })
  )

  if (privateUsersToSendEmailsTo.length === 0) {
    log('No users to send trending markets emails to')
    return
  }

  log(
    'Sending weekly portfolio emails to',
    privateUsersToSendEmailsTo.length,
    'users'
  )

  const db = createSupabaseClient()

  const userIds = privateUsersToSendEmailsTo.map((user) => user.id)
  // Get all contracts created by each user
  const usersToContractsCreated = await getContractsByUsers(
    userIds,
    db,
    Date.now() - 7 * DAY_MS
  )

  const contractIdsBetOnInLastWeek = await getUsersRecentBetContractIds(
    userIds,
    db,
    Date.now() - 7 * DAY_MS
  )

  // Get count unique bettor txns the users received over the past week
  const usersToUniqueBettorCount: { [userId: string]: number } = {}
  await Promise.all(
    userIds.map(async (id) => {
      const { count } = await run(
        db
          .from('txns')
          .select('*', { count: 'exact', head: true })
          .eq('to_id', id)
          .eq('category', 'UNIQUE_BETTOR_BONUS')
          .gt('created_time', millisToTs(Date.now() - 7 * DAY_MS))
      )

      usersToUniqueBettorCount[id] = count
    })
  )

  // Get count of likes the users received over the past week
  const usersToLikesReceived: { [userId: string]: number } = {}
  await Promise.all(
    userIds.map(async (id) => {
      const { count } = await run(
        db
          .from('user_reactions')
          .select('*', { count: 'exact', head: true })
          .eq('content_owner_id', id)
          .gte('created_time', millisToTs(Date.now() - 7 * DAY_MS))
      )
      usersToLikesReceived[id] = count
    })
  )
  // TODO: use their saved weekly portfolio update object from weekly-portfolio-updates.ts
  const usersToContractMetrics = await getUsersContractMetricsOrderedByProfit(
    userIds,
    db,
    'week'
  )
  const allWeeklyMoversContracts = (await getContracts(
    uniq(
      Object.values(usersToContractMetrics).flatMap((cms) =>
        cms.map((cm) => cm.contractId)
      )
    ),
    db
  )) as CPMMBinaryContract[]
  const pg = createSupabaseDirectClient()
  const chunks = chunk(privateUsersToSendEmailsTo, 25)
  let sent = 0
  for (const chunk of chunks) {
    await Promise.all(
      chunk.map(async (privateUser) => {
        const user = await getUser(privateUser.id)
        // Don't send to a user unless they're over 5 days old
        if (!user || user.createdTime > Date.now() - 5 * DAY_MS) return
        const leagueStat = await pg.oneOrNone(
          `
        select * from user_league_info where user_id = $1
        and season = $2 limit 1`,
          [privateUser.id, CURRENT_SEASON],
          (r: league_user_info) =>
            r
              ? numeral(r.rank).format('0o') +
                ' in ' +
                DIVISION_NAMES[r.division]
              : null
        )
        // Compute fun auxiliary stats
        const totalContractsUserBetOnInLastWeek = uniqBy(
          contractIdsBetOnInLastWeek[privateUser.id],
          (cm) => cm.contractId
        ).length
        const greenBg = 'rgba(0,160,0,0.2)'
        const redBg = 'rgba(160,0,0,0.2)'
        const clearBg = 'rgba(255,255,255,0)'
        const usersMetrics = usersToContractMetrics[privateUser.id]
        const profit = sum(usersMetrics.map((cm) => cm.from?.week.profit ?? 0))
        const roundedProfit = Math.round(profit) === 0 ? 0 : Math.floor(profit)
        const marketsCreated = (usersToContractsCreated?.[privateUser.id] ?? [])
          .length
        const performanceData = {
          profit: emailMoneyFormat(profit),
          profit_style: `background-color: ${
            roundedProfit > 0 ? greenBg : roundedProfit === 0 ? clearBg : redBg
          }`,
          markets_created: marketsCreated.toString(),
          likes_received: usersToLikesReceived[privateUser.id].toString(),
          unique_bettors: usersToUniqueBettorCount[privateUser.id].toString(),
          markets_traded: totalContractsUserBetOnInLastWeek.toString(),
          prediction_streak:
            (user.currentBettingStreak?.toString() ?? '0') + ' days',
          league_rank: leagueStat ?? 'Unranked',
        } as OverallPerformanceData

        const weeklyMoverContracts = filterDefined(
          usersToContractMetrics[user.id]
            .map((cm) => cm.contractId)
            .map((contractId) =>
              allWeeklyMoversContracts.find((c) => c.id === contractId)
            )
        )

        // Compute weekly movers stats
        const investmentValueDifferences = sortBy(
          filterDefined(
            weeklyMoverContracts.map((contract) => {
              const cpmmContract = contract as CPMMContract
              const marketProbAWeekAgo = cpmmContract.probChanges
                ? cpmmContract.prob - cpmmContract.probChanges.week
                : 0

              const cm = usersToContractMetrics[user.id].filter(
                (cm) => cm.contractId === contract.id
              )[0]
              if (!cm || !cm.from) return undefined
              const fromWeek = cm.from.week
              const profit = fromWeek.profit
              const currentValue = cm.payout

              return {
                currentValue,
                pastValue: fromWeek.prevValue,
                profit,
                contractSlug: contract.slug,
                marketProbAWeekAgo,
                questionTitle: contract.question,
                questionUrl: contractUrl(contract),
                questionProb: cpmmContract.resolution
                  ? cpmmContract.resolution
                  : Math.round(cpmmContract.prob * 100) + '%',
                profitStyle: `color: ${
                  profit > 0 ? 'rgba(0,160,0,1)' : '#a80000'
                };`,
              } as PerContractInvestmentsData
            })
          ),
          (differences) => Math.abs(differences.profit)
        ).reverse()

        // Don't show markets with abs profit < 1
        const [winningInvestments, losingInvestments] = partition(
          investmentValueDifferences.filter(
            (diff) => Math.abs(diff.profit) > 1
          ),
          (investmentsData: PerContractInvestmentsData) => {
            return investmentsData.profit > 0
          }
        )
        // Pick 3 winning investments and 3 losing investments
        const topInvestments = winningInvestments.slice(0, 3)
        const worstInvestments = losingInvestments.slice(0, 3)
        // If no bets in the last week ANd no market movers AND no markets created, don't send email
        if (
          totalContractsUserBetOnInLastWeek === 0 &&
          topInvestments.length === 0 &&
          worstInvestments.length === 0 &&
          marketsCreated === 0
        ) {
          return
        }
        await sendWeeklyPortfolioUpdateEmail(
          user,
          privateUser,
          topInvestments.concat(
            worstInvestments
          ) as PerContractInvestmentsData[],
          performanceData,
          WEEKLY_MOVERS_TO_SEND
        )
        sent++
        log(`emails sent: ${sent}/${privateUsersToSendEmailsTo.length}`)
      })
    )
  }
}
