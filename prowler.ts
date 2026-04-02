/**
 * Prowler Pipeline — Type Definitions
 *
 * Types for the autonomous smart wallet discovery system.
 * Prowler identifies high-conviction traders by finding wallets
 * appearing across multiple trending Solana tokens.
 */

export type TraderType = 'human' | 'bot' | 'unknown';
export type WalletTier = 1 | 2 | 3;
export type WalletSource =
  | 'birdeye'
  | 'manual'
  | 'prowler'
  | 'passive_prowler'
  | 'nansen-dca';

/** Record of a trader found on a trending token */
export interface TrendingTokenTraderRecord {
  id: number;
  walletAddress: string;
  tokenAddress: string;
  tokenSymbol: string;
  pnl: number;
  volume: number;
  tradeCount: number;
  rank: number; // Position among top 20 traders for this token
  collectedAt: Date;
}

/** Candidate discovered by the Prowler cross-reference process */
export interface ProwlerCandidate {
  address: string;
  crossRefCount: number; // Number of distinct trending tokens wallet appears on
  tokens: {
    address: string;
    symbol: string;
    pnl: number;
    volume: number;
    rank: number;
  }[];
  avgPnlVolumeRatio: number;
  avgRank: number; // Average rank across all appearances
  prowlerScore: number; // 0-100 composite score
  traderType: TraderType;
  tier: WalletTier; // Assigned at promotion time based on score
  source?: 'prowler' | 'passive_prowler';
}

/** Result of a Prowler refresh cycle */
export interface ProwlerRefreshResult {
  tokensScanned: number;
  tradersCollected: number;
  candidatesFound: number;
  promoted: number;
  updated: number;
  totalActive: number;
  duration: number;
  promotedWallets: WalletInfo[];
}

/** Smart wallet record in the active wallet table */
export interface SmartWalletRecord {
  id: number;
  address: string;
  label: string | null;
  tier: WalletTier;
  traderType: TraderType;
  winRate: number | null;
  pnl: number | null;
  volume: number | null;
  tradeCount: number | null;
  source: WalletSource;
  isActive: boolean;
  addedAt: Date;
  lastRefreshedAt: Date | null;
}

/** Compact wallet info returned in results */
export interface WalletInfo {
  address: string;
  tier: WalletTier;
  traderType: TraderType;
  score: number | null;
  pnl: number | null;
  volume: number | null;
  tradeCount: number | null;
  winRate: number | null;
}
