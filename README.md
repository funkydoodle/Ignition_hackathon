# Nocturnal Ignition

**Automated Solana Token Due Diligence Engine** — Telegram bot + public channel for real-time token analysis, smart wallet intelligence, and ML-powered signal filtering.

Built for the Solana ecosystem. Powering [nocturnal.xyz](https://nocturnal.xyz).

**Live channel:** [t.me/nocturnal_ignition](https://t.me/nocturnal_ignition)

---

## What It Does

Nocturnal Ignition monitors token migrations from launchpads (PumpFun, BAGS, BonkFun) to DEX liquidity pools, performs multi-layered due diligence, and posts actionable alerts to a Telegram channel. Every token passes through a gauntlet of on-chain analysis, social intelligence, smart wallet conviction checks, historical pattern matching, and machine learning prediction before reaching users.

### Core Pipeline

```
Token Migration Detected (DexScreener polling)
    |
    v
[Criteria 1] Market Cap + Volume screening
    |
    v
[Criteria 2] Global fees verification (Solanatracker)
    |
    v
[Criteria 3] Smart wallet conviction check (min 2+ holding)
    |
    v
Full Due Diligence
  |-- On-chain: holders, top 10 concentration, dev wallet, snipers
  |-- Social: Twitter profile, followers, engagement, account age
  |-- Sentiment: Grok-powered X/Twitter narrative analysis
  |-- Context: Category classification, narrative strength
  |-- Bundle: Wallet clustering, initial/current/sold percentages
  |-- Deployer: Historical launch track record (runner/rug rates)
  |-- Rugcheck: Contract safety scoring + insider detection
  |-- Nansen: Smart money netflow (1h + 24h) + trader count
    |
    v
[Phase 2.5] Ignition Recall — 6-dimension historical intelligence
    |
    v
Composite Scoring (weighted: volume, SW, social, holder dist, context)
    |
    v
[ML Gate] XGBoost runner probability prediction (30+ features)
    |
    v
Risk Rating (GREEN / YELLOW / RED)
    |
    v
Ranked Alert Queue --> Telegram Channel Post
    |
    v
24h Tracking: Milestones (2x-10x), Rug Detection, SW Exit/Ape alerts
```

---

## Key Systems

| System | Purpose | Deep Dive |
|--------|---------|-----------|
| **Prowler Pipeline** | Autonomous smart wallet discovery via trending token cross-referencing | [docs/prowler-pipeline.md](docs/prowler-pipeline.md) |
| **Ignition Recall** | 6-dimension historical intelligence engine (institutional memory) | [docs/recall-engine.md](docs/recall-engine.md) |
| **Intelligence Engine** | XGBoost binary classifier for runner prediction + rug filtering | [docs/ml-intelligence.md](docs/ml-intelligence.md) |
| **Auto-Trader** | ML-gated autonomous trading agent via Nocturnal dev-api | — |
| **Admin Dashboard** | Runtime configuration, wallet management, pipeline monitoring | — |

---

## Architecture

```
                          +------------------+
                          |   DexScreener    |
                          |   (polling)      |
                          +--------+---------+
                                   |
                                   v
+----------+   +----------+   +----------+   +----------+
| Birdeye  |   | Solana   |   | Scanner  |   | Grok API |
| Trending |   | Tracker  |   | Service  |   | (xAI)    |
+----+-----+   +----+-----+   +----+-----+   +----+-----+
     |              |              |              |
     v              v              v              v
+----+-----+   +----+-----+   +----+-----+   +----+-----+
| Prowler  |   | SW Check |   |    DD    |   | Sentiment|
| Pipeline |   | + Fees   |   |  Engine  |   | Analysis |
+----+-----+   +----------+   +----+-----+   +----------+
     |                              |
     v                              v
+----+-----+                  +----+-----+        +----------+
|  Smart   |                  | Ignition |        |  ML      |
|  Wallet  |<----- feeds ---->|  Recall  |        |  Runner  |
|  Table   |                  +----+-----+        | (FastAPI)|
+----------+                       |              +----+-----+
                                   v                   |
                            +------+------+            |
                            |  Composite  |<-----------+
                            |  Scoring    |
                            +------+------+
                                   |
                                   v
                            +------+------+
                            |  Alert      |
                            |  Queue      |
                            +------+------+
                                   |
                    +--------------+--------------+
                    |              |              |
                    v              v              v
              +---------+   +---------+   +---------+
              |Telegram |   |  Auto   |   | Milestone|
              |Channel  |   | Trader  |   | Tracker  |
              +---------+   +---------+   +---------+
```

---

## Alert Types

| Type | Trigger | Purpose |
|------|---------|---------|
| **Night Call** | Token passes all criteria + DD + ML gate | Initial alert with full DD report |
| **Trending Call** | Social momentum detection (X + TG mentions) | Trending narrative alert |
| **Smart Wallet Ape** | +2 additional SW buy in after alert | Conviction increasing signal |
| **Smart Wallet Exit** | SW count decreases by 2+ | Early warning of smart money leaving |
| **Milestone** | Token hits 2x, 3x, 4x, 5x, 6x, 7x, 8x, 9x, 10x | Performance tracking |
| **Whale DCA** | Nansen SM wallets DCA-ing into alerted token | Institutional conviction signal |
| **Night Call Boost** | Night Call token appears in Trending pipeline | Cross-pipeline confirmation |
| **Rug Alert** | >80% price drop or >50% dev sell | Risk warning |

See [docs/example-dd-reports.md](docs/example-dd-reports.md) for full message format examples.

---

## Tech Stack

- **Runtime:** Node.js + TypeScript (ESM)
- **Bot Framework:** Grammy (Telegram)
- **Database:** SQLite via Drizzle ORM
- **ML Service:** Python FastAPI + XGBoost + ONNX Runtime
- **Knowledge Graph:** Graphiti (semantic search + entity extraction)
- **Deployment:** Railway (Node.js app + FastAPI service, private networking)
- **LLM APIs:** Grok (xAI) for sentiment, Claude for context analysis

---

## Data Sources

| Source | Data | Purpose |
|--------|------|---------|
| DexScreener | Market data, SOL price | Primary market intelligence |
| Solanatracker | Global fees, top 100 holders | Smart wallet detection, fee verification |
| Solscan | Holder data, concentration | Holder analysis |
| Birdeye | Top trader rankings, trending tokens | Wallet discovery (Prowler) |
| Grok (xAI) | X/Twitter sentiment | Narrative analysis, lore generation |
| Claude | Context analysis | Category classification |
| Nansen | Smart money netflow, DCA data | Institutional flow signals |
| Rugcheck | Contract safety scores | Risk assessment |
| GitHub | Repository activity | AI token verification |
| Graphiti | Semantic knowledge graph | Recall engine (historical intelligence) |

---

## Performance (Backtest: 367 Alerts)

| Strategy | Trades | Win% @ 2x | Rug% | EV/Trade (SOL) |
|----------|--------|-----------|------|-----------------|
| Baseline (all alerts) | 367 | 29.4% | 35.7% | -0.29 |
| ML High Confidence (>=0.6) | 57 | 87.7% | 1.8% | +0.77 |
| ML + SW>=3 | 34 | 82.4% | 11.8% | +0.66 |
| ML + SW>=1 | 72 | 83.3% | 5.6% | +0.69 |

ML-filtered strategies convert a losing baseline into consistently profitable signals. See [docs/ml-intelligence.md](docs/ml-intelligence.md) for full backtest analysis.

---

## Example Alert Output

```
NEW CALL [Fresh Token]: $GIGABRAIN (7xKp...4mN2)

MC: $1.2M | Vol (24h): $2.8M | Liq: $45.0K
Holders: 1,847 | Top 10: 28.5%
Dex: Paid
Migrated: 45min ago from PumpFun

Context: AI agent meme, built on ai16z framework, active GitHub

Risk: GREEN
Smart wallets: 7 holding

Trade on Nocturnal
```

---

## Type Definitions

Sanitized type definitions for key data structures are available in [`src/types/`](src/types/):

- [`prowler.ts`](src/types/prowler.ts) — Prowler pipeline candidates and discovery results
- [`recall.ts`](src/types/recall.ts) — Recall engine intelligence context (6 dimensions)
- [`ml.ts`](src/types/ml.ts) — ML prediction request/response schemas
