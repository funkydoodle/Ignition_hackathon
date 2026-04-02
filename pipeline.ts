/**
 * Nox Ignition — DD Pipeline (Showcase)
 *
 * This is a simplified, annotated walkthrough of the full due diligence pipeline.
 * It shows the real flow from token discovery to alert posting.
 *
 * Implementation details (scoring weights, thresholds, prompts) are redacted.
 * Service internals return null on failure — the pipeline never throws.
 */

// ============================================================================
// IMPORTS — External APIs & Internal Services
// ============================================================================

// Market data (primary + fallback)
import { dexscreenerService } from '../services/dexscreener.js';        // Market data, SOL price — no API key
import { solanatrackerService } from '../services/solanatracker.js';    // Global fees, top 100 holders, bundle data
import { solscanService } from '../services/solscan.js';                // Holder count, top 10 concentration

// Intelligence layers
import { grokService } from '../services/grok.js';                      // X/Twitter sentiment via xAI (grok-4.1-turbo)
import { rugcheckService } from '../services/rugcheck.js';              // Contract safety scoring
import { nansenService } from '../services/nansen.js';                  // Smart money netflow + DCA data
import { birdeyeTraderService } from '../services/birdeyeTraders.js';   // Wallet PnL for entry MC calculation
import { githubService } from '../services/github.js';                  // Repo analysis for AI tokens

// Internal systems
import { recallService } from '../dd/recall.js';                        // 6-dimension historical intelligence
import { mlRunnerService } from '../services/mlRunner.js';              // XGBoost runner prediction (FastAPI)
import { autoTraderService } from '../services/autoTrader.js';          // Autonomous trading agent
import { alertQueue } from '../queue/alertQueue.js';                    // Ranked alert queue with rate limiting
import { telegramService } from '../bot/index.js';                      // Telegram bot + channel posting
import { runtimeConfig } from '../admin/services/runtimeConfig.js';     // DB-backed runtime configuration

import type { DDReport, Token, TokenTrigger, RecallContext } from '../types/index.js';

// ============================================================================
// PHASE 0: Token Discovery (DexScreener Polling)
// ============================================================================

/**
 * Every 60 seconds, poll DexScreener for new Solana token pairs.
 * Filter by minimum market cap and 24h volume (runtime-configurable).
 * Skip tokens already seen in the last 48 hours.
 */
async function pollForNewTokens(): Promise<void> {
  const seenTokens = new Set<string>(/* 48h TTL cache */);

  const newTokens = await dexscreenerService.pollNewSolanaPairs(
    runtimeConfig.getMigrationThresholds().MIN_MARKET_CAP,
    runtimeConfig.getMigrationThresholds().MIN_VOLUME_24H_SOL,
    seenTokens
  );

  for (const tokenData of newTokens) {
    await processNewToken(tokenData);
  }
}

// ============================================================================
// PHASE 1: 3-Criteria Screening
// ============================================================================

/**
 * Every token must pass all 3 criteria before entering the DD pipeline.
 * Tokens failing Criteria 2 or 3 enter pending queues for periodic rechecking.
 *
 * Criteria 1: MC >= threshold + Vol >= threshold  (already filtered by DexScreener poll)
 * Criteria 2: Global fees >= threshold SOL         (Solanatracker)
 * Criteria 3: Smart wallets holding >= threshold    (Solanatracker top 100 holders)
 *
 * All thresholds are runtime-configurable via the admin dashboard.
 */
async function processNewToken(tokenData: DexscreenerTokenData): Promise<void> {
  // Criteria 1 already passed (DexScreener poll filters by MC + volume)

  // Criteria 2: Check global fees
  const feesSol = await solanatrackerService.getGlobalFees(tokenData.poolAddress);
  if (feesSol < runtimeConfig.getGlobalFees().MIN_FEES_SOL) {
    // Add to pending fees queue — recheck every 10 min, max 2 hours
    pendingFeesQueue.add(tokenData);
    return;
  }

  // Criteria 3: Check smart wallet holdings
  const swHoldings = await solanatrackerService.getSmartWalletHoldings(
    tokenData.address,
    getActiveSmartWalletAddresses()
  );
  if (swHoldings.count < runtimeConfig.getMigrationThresholds().MIN_SMART_WALLETS_HOLDING) {
    // Add to pending SW queue — recheck every 10 min, max 2 hours
    pendingSwCheckQueue.add(tokenData, swHoldings.count);
    return;
  }

  // All 3 criteria passed — proceed to full DD
  await runFullPipeline(tokenData, swHoldings);
}

// ============================================================================
// PHASE 2: Full Due Diligence
// ============================================================================

/**
 * The DD engine orchestrates all data fetches and analysis in parallel
 * where possible, assembling a comprehensive DDReport.
 */
async function performDueDiligence(
  token: Token,
  trigger: TokenTrigger
): Promise<DDReport | null> {
  // Fetch market data (DexScreener primary, SolanaTracker fallback)
  const tokenData = await fetchMarketData(token.address);
  if (!tokenData) return null;

  // ── Parallel fetch: on-chain enrichment ──────────────────────────────
  const [rugcheckData, bundleData, tokenInfo, nansenNetflow] = await Promise.all([
    rugcheckService.getTokenSummary(token.address),       // Contract safety score
    solanatrackerService.getBundlers(token.address),       // Bundle wallet analysis
    solanatrackerService.getTokenInfo(token.address),      // Creator/deployer info
    nansenService.getSmartMoneyNetflow(token.address),     // SM inflow/outflow
  ]);

  // Extract deployer address (SolanaTracker preferred, Rugcheck fallback)
  const deployerAddress = tokenInfo?.token?.creation?.creator
    ?? rugcheckData?.creator
    ?? null;

  // Check deployer blacklist — skip if flagged
  if (deployerAddress && await isDeployerBlacklisted(deployerAddress)) {
    return null;
  }

  // Get deployer historical reputation (runner rate, rug rate, total launches)
  const deployerSnapshot = deployerAddress
    ? await deployerProfilesRepository.upsertOnAlert(deployerAddress, token.address)
    : null;

  // ── Parallel fetch: sentiment + holders ──────────────────────────────
  const [xSearchResults, holderMetrics] = await Promise.all([
    // X/Twitter sentiment analysis via Grok (grok-4.1-turbo)
    // Searches by token ticker + address, extracts lore/narrative
    grokService.searchXForTokenTwoLayer(
      tokenData.symbol,
      token.address,
      tokenData.twitterLinkInfo   // profile / community / tweet URL from DexScreener
    ),

    // Holder metrics from Solscan Pro API
    solscanService.getHolderMetrics(token.address),
  ]);

  const lore = xSearchResults.lore;  // Token backstory/narrative from X

  // ── Phase 2.5: Ignition Recall (needs lore from above) ──────────────
  // 6-dimension historical intelligence: wallet intel, similar calls,
  // deployer network, bundle recurrence, wallet clusters, narrative trends
  const recallContext = await recallService.buildRecallContext(
    trigger.holdingWallets || [],
    lore,
    tokenData.marketCap,
    deployerAddress,
    bundleData?.wallets?.map(w => w.wallet) ?? null
  ).catch(() => null);  // Graceful degradation — never blocks pipeline

  // ── Build smart wallet entry data ────────────────────────────────────
  // Fetch each smart wallet's average buy cost via Birdeye PnL API
  // to calculate their entry market cap (what MC they bought at)
  const smartWalletEntries = await buildSmartWalletEntries(
    trigger.holdingWallets,
    token.address,
    tokenData.price,
    tokenData.marketCap
  );

  // ── Assemble DD Report ───────────────────────────────────────────────
  const ddReport: DDReport = {
    // Token identity
    tokenAddress: token.address,
    poolAddress: token.poolAddress || tokenData.poolAddress,
    dexId: tokenData.dexId,
    ticker: tokenData.symbol,
    name: tokenData.name,
    launchpad: token.launchpad,

    // Market data snapshot
    marketCap: tokenData.marketCap,
    price: tokenData.price,
    volume1h: tokenData.volume1h,
    volume24h: tokenData.volume24h,
    liquidity: tokenData.liquidity,
    buyCount1h: tokenData.buyCount1h,
    sellCount1h: tokenData.sellCount1h,
    globalFeesSol: token.globalFeesSol,

    // Holder analysis (Solscan)
    holderCount: holderMetrics?.holderCount ?? 0,
    top10HolderPercent: holderMetrics?.top10HolderPercent ?? 0,
    devWalletPercent: holderMetrics?.topHolders?.[0]?.percent,

    // Social (DexScreener + Grok)
    twitterHandle: tokenData.twitterHandle,
    lore,

    // Memory enrichment
    deployerAddress,
    deployerRunnerRate: deployerSnapshot?.runnerRate ?? null,
    deployerRugRate: deployerSnapshot?.rugRate ?? null,
    deployerTotalLaunches: deployerSnapshot?.totalLaunches ?? 0,

    // Rugcheck
    rugcheckScore: rugcheckData?.scoreNormalised ?? null,
    rugcheckInsiders: rugcheckData?.graphInsidersDetected ?? null,

    // Bundle analysis (Solanatracker)
    bundleWalletCount: bundleData?.total ?? null,
    bundleInitialPct: bundleData?.initialPercentage ?? null,
    bundleCurrentPct: bundleData?.currentPercentage ?? null,
    bundleSoldPct: bundleData?.soldPercentage ?? null,
    bundleStatus: bundleData?.status ?? null,

    // Nansen smart money netflow
    nansenNetFlow1hUsd: nansenNetflow?.net_flow_1h_usd,
    nansenNetFlow24hUsd: nansenNetflow?.net_flow_24h_usd,
    nansenTraderCount: nansenNetflow?.trader_count,

    // Ignition Recall (6 dimensions)
    recallWalletIntel: recallContext?.walletIntel,
    recallSimilarCalls: recallContext?.similarCalls,
    recallDeployerNetwork: recallContext?.deployerNetwork,
    recallBundleRecurrence: recallContext?.bundleRecurrence,
    recallWalletCluster: recallContext?.walletCluster,
    recallNarrativeTrend: recallContext?.narrativeTrend,

    // Trigger + timing
    triggerType: trigger.triggerType,
    smartWalletsHolding: token.smartWalletsHolding,
    smartWalletEntries,
    detectionCategory: token.detectionCategory,
    migratedAt: token.migratedAt,
    launchedAt: token.launchedAt,
    analyzedAt: new Date(),
  };

  return ddReport;
}

// ============================================================================
// PHASE 3: Scoring
// ============================================================================

/**
 * Composite score = weighted sum of 5 factors.
 * All weights are runtime-configurable (must sum to 1.0).
 * Smart wallet scoring uses tier-weighted count, not raw count.
 *
 * Scoring formula weights and thresholds are REDACTED.
 */
async function scoreCandidate(token, trigger, ddReport): Promise<TokenCandidate> {
  const scores = {
    volume:             calculateVolumeScore(ddReport),
    smartWallet:        calculateSmartWalletScore(trigger.holdingWallets),
    social:             calculateSocialScore(ddReport),
    holderDistribution: calculateHolderScore(ddReport),
    contextRelevance:   calculateContextScore(ddReport),
  };

  const compositeScore = calculateCompositeScore(scores);
  // Risk rating: GREEN / YELLOW / RED based on configurable thresholds
  ddReport.riskRating = calculateRiskRating(ddReport);

  return { token, trigger, score: compositeScore, scores };
}

// ============================================================================
// PHASE 4: Intelligence Engine (ML Gate)
// ============================================================================

/**
 * XGBoost binary classifier predicts runner probability (0.0-1.0).
 * 30+ features from the DD report are sent to the FastAPI service.
 *
 * Gate logic:
 *   - ML disabled → pass through
 *   - Service unavailable / timeout (3s) → pass through
 *   - Shadow mode → log prediction, never block
 *   - probability >= threshold → pass
 *   - probability < threshold → block (token not posted)
 */
async function applyMLGate(
  ddReport: DDReport,
  scores: RankingScores,
  compositeScore: number
): Promise<{ passed: boolean; probability: number | null }> {
  const prediction = await mlRunnerService.predict(ddReport, scores, compositeScore);

  ddReport.mlRunnerProbability = prediction?.probability ?? null;

  if (mlRunnerService.shouldBlock(prediction, ddReport)) {
    return { passed: false, probability: prediction?.probability ?? null };
  }

  return { passed: true, probability: prediction?.probability ?? null };
}

// ============================================================================
// PHASE 5: Alert Posting + Auto-Trading
// ============================================================================

/**
 * Token passed all gates. Now:
 *   1. Add to ranked alert queue (sorted by composite score)
 *   2. Queue processes tokens at rate limit (MAX_ALERTS_PER_HOUR)
 *   3. Format DD report as Telegram message
 *   4. Post to channel
 *   5. Fire auto-trader buy in parallel (if enabled + above ML threshold)
 *   6. Save alert to database with all DD data
 *   7. Start 24h milestone + rug tracking
 */
async function postAlert(candidate: TokenCandidate, ddReport: DDReport): Promise<void> {
  // Format the alert message (channel format — concise)
  const message = formatNightCallAlert(ddReport);

  // Post to Telegram channel + fire auto-trader buy in parallel
  // Alert posting is NEVER blocked by trade failures
  const [telegramResult, tradeResult] = await Promise.allSettled([
    // Post to channel
    telegramService.postToChannel(message),

    // Auto-trader: buy if enabled + ML probability above autotrader threshold
    autoTraderService.executeBuyIfEligible(ddReport),
  ]);

  // Save alert to database (includes all DD fields + ML probability)
  const alertId = await alertsRepository.create({
    ddReport,
    channelMessageId: telegramResult.status === 'fulfilled'
      ? telegramResult.value.messageId
      : undefined,
  });

  // Save wallet holdings snapshot for this alert (powers Recall engine)
  await alertsRepository.saveWalletHoldings(alertId, candidate.trigger.holdingWallets);

  // Write episode to Graphiti knowledge graph (async, fire-and-forget)
  // This enriches the Recall engine for future alerts
  graphitiMemoryService.writeEpisode({
    name: `alert-${alertId}`,
    episodeBody: buildEpisodeBody(ddReport),
    sourceDescription: 'ignition-calls',
    referenceTime: new Date().toISOString(),
  });

  // Start 24h tracking for milestones (2x-10x) and rug detection
  milestoneTracker.track(alertId, ddReport);
}

// ============================================================================
// PHASE 6: 24h Tracking (Milestones + Rug Detection)
// ============================================================================

/**
 * After posting, every alerted token is tracked for 24 hours:
 *
 *   Milestones: When price hits 2x, 3x, 4x, 5x, 6x, 7x, 8x, 9x, 10x
 *               from alert MC → post milestone update as reply to original message
 *
 *   Rug detection: Dev wallet sells >50% of holdings
 *                  OR price drops >80% from alert
 *                  OR liquidity removed from pool
 *                  → post rug alert as reply to original message
 *
 *   SW Exit: Smart wallet count decreases by 2+ from last alerted count
 *            → post SW exit warning as reply
 *
 *   SW Ape: Smart wallet count increases by 2+ after alert
 *           → post SW ape signal as reply
 *
 *   Night Call Boost: Token later appears in Trending Call pipeline
 *                     → post cross-pipeline confirmation as reply
 */

// ============================================================================
// FULL PIPELINE ORCHESTRATION
// ============================================================================

async function runFullPipeline(tokenData, swHoldings): Promise<void> {
  const token = buildTokenObject(tokenData, swHoldings);
  const trigger = buildTriggerObject(token, swHoldings);

  // Phase 2: Full due diligence
  const ddReport = await performDueDiligence(token, trigger);
  if (!ddReport) return;

  // Phase 3: Scoring
  const candidate = await scoreCandidate(token, trigger, ddReport);

  // Phase 4: ML gate
  const mlResult = await applyMLGate(ddReport, candidate.scores, candidate.score);
  if (!mlResult.passed) return;  // Blocked by Intelligence Engine

  // Phase 5: Queue for alert posting
  alertQueue.add(candidate, ddReport);
  // Queue processes at rate limit → postAlert() called when slot available
}
