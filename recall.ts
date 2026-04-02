/**
 * Ignition Recall — Type Definitions
 *
 * Types for the 6-dimension historical intelligence engine.
 * Recall enriches every alert with institutional memory by comparing
 * the current token against all past performance data.
 */

/** Per-wallet historical performance across all past alerts */
export interface WalletIntelEntry {
  tier: number; // 1, 2, or 3
  traderType: string; // 'human', 'bot', 'unknown'
  source: string; // 'manual', 'birdeye', 'prowler', etc.
  alertCount: number; // Past alerts this wallet appeared in
  hit2xRate: number; // 0-1, % of past alerts that hit 2x
  hit5xRate: number; // 0-1, % that hit 5x
  rugRate: number; // 0-1, % that rugged
  avgPeakMultiplier: number; // Avg peak across all appearances
  avgTimeToPeakMs: number | null; // Milliseconds to reach peak
  totalPnlUsd: number | null; // Sum of realized PnL
  currentHoldingPercentage: number | null;
  currentHoldingAmount: number | null;
  currentHoldingValueUsd: number | null;
  avgHoldingValueUsd: number | null; // Historical avg holding value
}

/** Aggregated summary of past tokens with similar narratives */
export interface SimilarCallsSummary {
  matchCount: number; // Number of similar past calls found
  mcRange: string; // e.g. "$100K-$400K"
  avgPeakMultiplier: number;
  avgTimeToPeakFormatted: string; // e.g. "4h"
  hit2xRate: number;
}

/** Deployer's historical launch track record */
export interface DeployerNetworkSummary {
  pastTokenCount: number;
  runnerCount: number;
  rugCount: number;
  slowBleedCount: number;
  avgPeakMultiplier: number;
  viaSharedBundleWallets: boolean; // True if connection via bundle wallets
}

/** Track record of the token's bundle wallets across past launches */
export interface BundleRecurrenceSummary {
  pastTokenCount: number;
  runnerCount: number;
  rugCount: number;
  avgPeakMultiplier: number;
}

/** Co-occurrence patterns of holding wallets across past tokens */
export interface WalletClusterSummary {
  clusterSize: number; // Number of wallets in cluster
  coOccurrenceCount: number; // Past tokens they appeared together in
  hit2xRate: number;
  avgPeakMultiplier: number;
}

/** Whether the current token's narrative theme is heating or cooling */
export interface NarrativeTrendSummary {
  trend: 'heating' | 'cooling' | 'stable';
  narrative: string; // First 3-4 words of lore
  recentAvgPeak: number;
  priorAvgPeak: number;
  periodLabel: string; // e.g. "last 2 weeks"
}

/** Complete recall context assembled for a single token */
export interface RecallContext {
  walletIntel: WalletIntelEntry[];
  similarCalls: SimilarCallsSummary | null;
  deployerNetwork: DeployerNetworkSummary | null;
  bundleRecurrence: BundleRecurrenceSummary | null;
  walletCluster: WalletClusterSummary | null;
  narrativeTrend: NarrativeTrendSummary | null;
}
