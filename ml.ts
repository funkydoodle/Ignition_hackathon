/**
 * Intelligence Engine — Type Definitions
 *
 * Types for the XGBoost runner prediction service.
 * The Intelligence Engine predicts whether a token will be a "runner"
 * (>=2x peak multiplier within 24h) based on 30+ features.
 */

/** Feature categories fed to the model */
export interface PredictionFeatures {
  // Market metrics (log-transformed at inference time)
  marketCap: number;
  volume1h: number;
  volume24h: number | null;
  liquidity: number;
  globalFeesSol: number | null;

  // Holder analysis
  holdersAtAlert: number;
  top10HolderPercent: number;
  devWalletPercent: number | null;

  // Smart wallet signals
  smartWalletsHolding: number;
  smartWalletScore: number | null;

  // Composite scores from DD engine
  compositeScore: number;
  volumeScore: number;
  socialScore: number;
  holderDistScore: number;
  contextScore: number;

  // Social / Twitter
  sentimentScore: number | null;
  mentionCount: number | null;
  kolTweetCount: number | null;
  twitterFollowers: number | null;
  twitterAccountAgeDays: number | null;

  // On-chain reputation
  rugcheckScore: number | null;
  rugcheckInsiders: number | null;

  // Bundle metrics
  bundleWalletCount: number | null;
  bundleInitialPct: number | null;
  bundleCurrentPct: number | null;
  bundleSoldPct: number | null;

  // Nansen whale flow
  nansenNetFlow1hUsd: number | null;
  nansenNetFlow24hUsd: number | null;
  nansenTraderCount: number | null;

  // Deployer reputation
  deployerRunnerRate: number | null;
  deployerRugRate: number | null;
  deployerTotalLaunches: number;

  // Wallet skill aggregation (derived from historical alert outcomes)
  avgWalletRunnerRate: number | null;
  highAlphaCount: number | null;
  walletsWithHistory: number | null;

  // Categorical features (handled natively by XGBoost)
  launchpad: string; // 'pumpfun' | 'bags' | 'bonkfun' | ...
  detectionCategory: string; // 'A' (fresh) | 'B' (volume)
  bundleStatus: string | null; // 'clean' | 'partial_exit' | 'holding'
  riskRating: string | null; // 'green' | 'yellow' | 'red'
  triggerType: string; // 'volume' | 'smart_wallet' | 'both' | 'migration' | 'trending_call'
}

/** Response from the Intelligence Engine /predict endpoint */
export interface PredictionResponse {
  probability: number; // 0.0-1.0, runner likelihood
  blocked: boolean; // Whether this token would be blocked at current threshold
  model_version: string;
}

/** Health check response */
export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  model_loaded: boolean;
  model_format: 'onnx' | 'xgboost_json';
  uptime_seconds: number;
}

/** Gate decision logic (applied in Node.js client) */
export type GateDecision =
  | { action: 'pass'; reason: 'above_threshold' | 'ml_disabled' | 'service_unavailable' }
  | { action: 'block'; reason: 'below_threshold' }
  | { action: 'shadow'; reason: 'shadow_mode'; wouldBlock: boolean };
