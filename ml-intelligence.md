# Intelligence Engine — XGBoost Runner Prediction

## Overview

The Intelligence Engine is an XGBoost binary classifier that predicts whether a token will be a "runner" (reaches >=2x peak multiplier within 24 hours of alert). It operates as an optional gate in the alert pipeline — tokens with low runner probability can be blocked from posting, dramatically improving channel signal quality.

The model ingests 30+ features from the full DD report, capturing market quality, holder structure, smart wallet conviction, social momentum, on-chain reputation, bundle risk, and whale flow — all in a single prediction.

---

## Performance

### Model Metrics (Cross-Validated)

| Metric | Value |
|--------|-------|
| PR-AUC | 0.84 +/- 0.06 |
| ROC-AUC | 0.93 +/- 0.03 |
| Training samples | 325 (73 runners, 252 non-runners) |
| Cross-validation | Repeated Stratified K-Fold (5 splits x 10 repeats = 50 folds) |

### Backtest Results (367 Historical Alerts)

#### At 2x Take-Profit

| Strategy | Trades | Win% | Rug% | EV/Trade (SOL) | Total PnL (SOL) | Sharpe |
|----------|--------|------|------|-----------------|------------------|--------|
| **ML High Conf (>=0.6)** | 57 | 87.7% | 1.8% | +0.77 | +44.17 | 1.28 |
| **ML + SW>=1** | 72 | 83.3% | 5.6% | +0.69 | +49.66 | 0.99 |
| **ML + SW>=3** | 34 | 82.4% | 11.8% | +0.66 | +22.44 | 0.90 |
| Baseline (all alerts) | 367 | 29.4% | 35.7% | -0.29 | -107.63 | -0.34 |

#### At 3x Take-Profit

| Strategy | Trades | Win% | Rug% | EV/Trade (SOL) | Total PnL (SOL) | Sharpe |
|----------|--------|------|------|-----------------|------------------|--------|
| **ML + SW>=3** | 34 | 61.8% | 11.8% | +0.93 | +31.50 | 0.68 |
| **ML High Conf (>=0.6)** | 57 | 52.6% | 1.8% | +0.81 | +46.05 | 0.62 |
| **ML + SW>=1** | 72 | 48.6% | 5.6% | +0.68 | +48.85 | 0.51 |
| Baseline (all alerts) | 367 | 16.3% | 35.7% | -0.33 | -120.26 | -0.31 |

**Key finding**: ML-filtered strategies convert a losing baseline (-0.29 SOL/trade) into consistently profitable signals (+0.66 to +0.77 SOL/trade at 2x). The model simultaneously filters rugs (1.8% rug rate vs 35.7% baseline) and selects quality (87.7% win rate vs 29.4% baseline).

---

## Feature Architecture

The model ingests 30+ features organized into eight categories. All features are captured at alert time from the DD report — no look-ahead bias.

### Feature Categories

```
+------------------+     +------------------+     +------------------+
|  Market Metrics  |     | Holder Analysis  |     |  Smart Wallet    |
|                  |     |                  |     |  Signals         |
| - Market cap     |     | - Holder count   |     | - SW holding     |
| - Volume (1h)    |     | - Top 10 conc.   |     | - SW score       |
| - Volume (24h)   |     | - Dev wallet %   |     | - Wallet skill   |
| - Liquidity      |     |                  |     |   aggregation    |
| - Global fees    |     |                  |     |                  |
+------------------+     +------------------+     +------------------+

+------------------+     +------------------+     +------------------+
|  Social/Twitter  |     | On-Chain Reputa- |     |  Bundle Metrics  |
|                  |     | tion             |     |                  |
| - Sentiment      |     | - Rugcheck score |     | - Wallet count   |
| - Mentions       |     | - Rugcheck       |     | - Initial %      |
| - KOL tweets     |     |   insiders       |     | - Current %      |
| - Followers      |     |                  |     | - Sold %         |
| - Account age    |     |                  |     |                  |
+------------------+     +------------------+     +------------------+

+------------------+     +------------------+
|  Deployer Rep.   |     |  Whale Flow      |
|                  |     |  (Nansen)        |
| - Runner rate    |     | - Net flow (1h)  |
| - Rug rate       |     | - Net flow (24h) |
| - Total launches |     | - Trader count   |
+------------------+     +------------------+
```

### Derived Features

Beyond raw inputs, the model uses engineered features that capture relationships between dimensions:

| Feature | What It Captures |
|---------|-----------------|
| Volume-to-MC ratio | Relative trading intensity vs. market cap |
| Liquidity-to-MC ratio | How well-supported the price is relative to size |
| 24h-to-1h volume ratio | Whether volume is accelerating or decelerating |
| Deployer-wallet interaction | Synergy between deployer quality and wallet quality |
| Bundle exit velocity | How quickly bundle wallets are selling |

### Categorical Features

Five categorical features are handled natively by XGBoost (no one-hot encoding needed):

- **Launchpad**: PumpFun, BAGS, BonkFun, etc.
- **Detection category**: A (fresh, <=12h) or B (volume, >12h)
- **Bundle status**: clean, partial_exit, holding
- **Risk rating**: green, yellow, red
- **Trigger type**: volume, smart_wallet, both, migration, trending_call

### Wallet Skill Aggregation

A novel feature group that derives per-wallet historical performance metrics:

- **Average wallet runner rate**: Mean hit rate of all smart wallets holding the token, computed from past alert outcomes
- **High alpha count**: Number of holding wallets with runner rates above an elite threshold
- **Wallets with history**: How many holding wallets have sufficient past data for statistical confidence

These features capture "wallet quality" beyond simple counts — a token held by 3 wallets with 80% runner rates is very different from one held by 3 wallets with no history.

---

## Training Pipeline

### Data Flow

```
Resolved Alerts (DB)           Feature Engineering         Model Training
+------------------+     +------------------------+     +------------------+
| alerts +         |---->| Log transforms         |---->| XGBoost          |
| trackedTokens    |     | Derived ratios         |     | - Binary classif.|
| (outcome labels) |     | Categorical encoding   |     | - Class imbalance|
+------------------+     | Null handling (native) |     |   handling       |
                          +------------------------+     | - Regularization |
                                                         +--------+---------+
                                                                  |
                                              +-------------------+
                                              |                   |
                                              v                   v
                                    +------------------+  +------------------+
                                    |  Cross-Validation|  |  Export          |
                                    |  (5x10 StratKF)  |  |  - XGBoost JSON |
                                    |  Threshold tuning|  |  - ONNX format  |
                                    +------------------+  +------------------+
```

### Key Design Choices

**Class imbalance handling**: Runners are ~22% of the dataset. `scale_pos_weight` is set to the ratio of negatives to positives (~3.5x), telling the model that missing a runner is 3.5x worse than a false positive.

**Conservative threshold tuning**: The threshold is selected to maintain >=95% recall — catch virtually all true runners, then maximize precision at that recall point. This means some false positives pass through, but almost no real runners are blocked.

**Aggressive regularization**: L1 and L2 penalties, max tree depth limits, subsample and column sampling — all tuned to prevent overfitting on a relatively small dataset. The model generalizes to unseen tokens rather than memorizing training patterns.

**Log transforms**: Market cap, volume, and liquidity span several orders of magnitude ($200K to $50M+). Log transforms normalize these distributions for better split finding.

**Null handling**: XGBoost natively handles missing values. Tokens from the Trending Call pipeline may lack certain features (no candidate scores, no bundle data). The model learns optimal split directions for null values during training, eliminating the need for imputation.

---

## Deployment Architecture

```
+-------------------+         Private Network         +-------------------+
|  Node.js App      |<------------------------------>|  FastAPI Service   |
|  (Railway)        |          /predict               |  (Railway)        |
|                   |          /health                 |                   |
|  mlRunner.ts      |          /upload-model           |  ONNX Runtime     |
|  (client library) |                                  |  or XGBoost JSON  |
+-------------------+                                  +-------------------+
```

### Inference Flow

1. DD pipeline completes → all 30+ features available in DDReport
2. `mlRunner.ts` extracts features, maps to model schema
3. POST to FastAPI `/predict` endpoint (3s timeout)
4. FastAPI transforms features (log, derived ratios), runs ONNX inference
5. Returns `{ probability: 0.72, blocked: false }`
6. Node.js applies gate logic based on runtime config

### Hot-Swap Model Updates

New models can be deployed without service restart:

1. Train locally with latest data
2. Upload via `/upload-model` endpoint (auth-protected)
3. FastAPI atomically swaps the in-memory model
4. New predictions use the updated model immediately

### Fault Tolerance

| Failure | Behavior |
|---------|----------|
| ML service unreachable | Token passes through ungated (null-on-failure) |
| ML service timeout (>3s) | Token passes through ungated |
| Model returns error | Token passes through ungated |
| Invalid feature data | XGBoost handles nulls natively; prediction still runs |

The pipeline never blocks on ML failures. Alerts always post if the ML service is down.

---

## Shadow Mode Deployment

The Intelligence Engine supports a graduated deployment strategy:

1. **Disabled**: No ML predictions. Baseline alert quality.
2. **Shadow mode**: Predictions are computed and logged on every alert, but never block tokens. Operators can inspect:
   - Prediction accuracy over time (precision/recall/F1)
   - What the model would have blocked vs. what actually rugged
   - Threshold simulator: interactively adjust the threshold and see projected impact
3. **Live gate**: Predictions actively filter tokens. Below-threshold tokens are blocked from posting.

This allows operators to validate model quality on live data before trusting it to gate alerts.

---

## Admin Dashboard

The Intelligence Engine tab in the admin Insights page provides:

- **Prediction accuracy**: Precision, recall, F1 computed against resolved outcomes
- **Gate statistics**: Tokens blocked vs. passed, false negatives (blocked tokens that would have been runners)
- **Confusion matrix**: True/false positive/negative counts
- **Probability distribution**: Histogram of prediction scores across all alerts
- **Threshold simulator**: Interactive slider showing win rate, rug rate, and trade count at any threshold

---

## Retraining Cadence

The model is retrained approximately bi-weekly as new outcomes resolve (~40-60 new data points per cycle). Each retraining run:

1. Exports all resolved alerts with outcomes from the admin API
2. Runs the full training pipeline (feature engineering → XGBoost → cross-validation → threshold tuning)
3. Compares new model metrics against the current deployed model
4. If improved: exports to ONNX, uploads via hot-swap endpoint
5. Publishes metrics (PR-AUC, ROC-AUC, feature importance) for audit

As the dataset grows, model accuracy improves — more training data means better generalization across market conditions, narratives, and deployer patterns.
