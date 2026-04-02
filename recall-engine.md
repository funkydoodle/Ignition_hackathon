# Ignition Recall — Historical Intelligence Engine

## Overview

Ignition Recall is the system's institutional memory. It enriches every alert with six dimensions of historical context by comparing the current token against all past performance data. The goal: answer "have we seen this pattern before, and what happened?"

Recall runs at **Phase 2.5** of the DD pipeline — after sentiment analysis produces the token's lore/narrative, but before scoring and alert formatting. It adds zero new external API calls to the critical path; all intelligence comes from the local database and an optional semantic knowledge graph.

---

## The Six Intelligence Dimensions

```
                        Current Token Alert
                              |
              +---------------+---------------+
              |       |       |       |       |
              v       v       v       v       v       v
         +-------+ +-------+ +-------+ +-------+ +-------+ +-------+
         |Wallet | |Similar| |Deploy-| |Bundle | |Wallet | |Narrat-|
         |Intel  | |Calls  | |er Net | |Recur- | |Clust- | |ive    |
         |       | |       | |       | |rence  | |ers    | |Trend  |
         +---+---+ +---+---+ +---+---+ +---+---+ +---+---+ +---+---+
             |         |         |         |         |         |
             v         v         v         v         v         v
         Per-wallet  Past     Deployer   Bundle   Co-occur  Theme
         hit rates,  tokens   launch     wallet   patterns  heating/
         PnL, peak   w/ same  history:   track    across    cooling
         multiplier  narrative runner/rug record   tokens    over time
```

### 1. Smart Wallet Intel

For each smart wallet currently holding the token, queries their complete history across all past Ignition alerts:

- **Alert count**: How many past alerts has this wallet appeared in?
- **Hit rates**: What percentage of their past tokens hit 2x? 5x?
- **Rug rate**: How often did their tokens rug?
- **Average peak multiplier**: Across all appearances, how high did their tokens typically go?
- **Average time-to-peak**: How quickly do their tokens tend to peak?
- **Realized PnL**: Total profit/loss from tracked wallet-token positions

Only wallets with 2+ past alert appearances are surfaced (minimum statistical significance).

**Why it matters**: A token held by wallets with 80% hit rates and 5x average peaks is fundamentally different from one held by wallets with 20% hit rates, even if both have the same smart wallet count.

### 2. Similar Calls

Finds past tokens with matching narratives and comparable market caps:

- **Primary path**: Semantic search via Graphiti knowledge graph — finds tokens with similar entity relationships, not just keyword matches
- **Fallback path**: LLM-scored lore similarity when Graphiti is unavailable — batch-scores past token narratives against the current token's lore
- **Market cap filtering**: Only matches within 0.5x-2x of current MC (apples-to-apples comparison)
- **Aggregated outcomes**: Average peak multiplier, time-to-peak, and hit rates across all matches

**Why it matters**: "AI agent on Eliza framework" tokens at $1M MC had a 60% hit rate last month vs 15% for "generic dog meme" at the same MC. Narrative + MC range is a powerful predictor.

### 3. Deployer Network

Maps the current token's deployer address against all past launches in the knowledge graph:

- Searches for the deployer address AND any associated bundle wallets
- Looks up outcomes for all past tokens from this deployer
- Returns: past token count, runner/rug/slow-bleed distribution, average peak

**Why it matters**: Serial deployers are common in Solana meme tokens. A deployer with 8 past rugs and 0 runners is a strong negative signal, regardless of how good the current token's metrics look.

### 4. Bundle Wallet Recurrence

Checks whether the current token's bundle wallets (wallets that bought at launch in coordinated bundles) have appeared in past tokens:

- Searches each bundle wallet in the knowledge graph
- Aggregates: how many past tokens, runner/rug rates, average peak
- Flags recurring bundle networks

**Why it matters**: Coordinated bundle wallets often operate across multiple launches. If the same bundle network has been associated with past rugs, it's a strong warning signal for the current token.

### 5. Wallet Clusters

Identifies co-occurrence patterns among the current token's holding wallets:

- For each holding wallet, searches for past tokens they appeared in
- Finds pairs of current wallets that have appeared together in the same past tokens
- Aggregates hit rates and peak multipliers from those co-occurrence tokens

**Why it matters**: When 4 wallets currently holding a token have also appeared together in 3 past tokens that all hit 5x+, that's a coordinated alpha signal — these wallets may share information or follow the same strategy.

### 6. Narrative Lifecycle Trends

Analyzes whether the current token's narrative theme is heating up or cooling down:

- Searches for past tokens with similar narratives/lore
- Splits results into two time periods (recent vs. prior)
- Compares average peak multipliers between periods
- Reports trend direction: **heating** (recent outperforming), **cooling** (recent underperforming), or **stable**

**Why it matters**: Narrative cycles in meme tokens are real. "AI agent" tokens had explosive performance in early 2026 but the theme cooled as the market saturated. Catching a theme while it's heating vs. cooling materially affects expected returns.

---

## Architecture

### Dual-Layer Intelligence

```
                    +-------------------+
                    |  buildRecallContext|
                    |  (orchestrator)   |
                    +--------+----------+
                             |
              +--------------+--------------+
              |                             |
              v                             v
    +---------+---------+        +----------+----------+
    |   Local Database  |        |  Graphiti Knowledge  |
    |                   |        |  Graph (optional)    |
    +-------------------+        +----------------------+
    | - alertWalletHoldings |    | - Semantic search     |
    | - trackedTokens       |    | - Entity extraction   |
    | - walletTokenPnl      |    | - Cross-token facts   |
    | - smartWallets        |    | - Temporal reasoning   |
    +-------------------+        +----------------------+
              |                             |
              v                             v
    Wallet Intel              Similar Calls, Deployer Network,
    (always available)        Bundle Recurrence, Wallet Clusters,
                              Narrative Trends
                              (available when Graphiti configured)
```

### Graceful Degradation

Every recall function returns `null` on failure. The system degrades gracefully at multiple levels:

| Scenario | Impact |
|----------|--------|
| Graphiti not configured | Wallet Intel still works (local DB). 5 other dimensions return null. |
| Graphiti search fails | Falls back to LLM-scored similarity for Similar Calls. Others return null. |
| LLM fallback also fails | Similar Calls returns null. Other dimensions unaffected. |
| Local DB query fails | That specific dimension returns null. Alert still posts. |
| All recall fails | Alert posts without recall section. Pipeline never blocks. |

### Zero-Latency Design

Recall adds ~1-2 seconds to the DD pipeline (which already takes 5-15 seconds):

- **Wallet Intel**: ~100ms (SQLite joins on indexed columns)
- **Graphiti searches**: ~500-800ms each (semantic search is fast)
- **LLM fallback**: ~1-2s (batch scoring, only triggered if Graphiti unavailable)
- **All 6 dimensions run in parallel** via `Promise.allSettled()`

No new external market data APIs are called. All intelligence comes from data already collected by previous pipeline runs.

---

## Knowledge Graph Integration (Graphiti)

### Episode Ingestion

Every alert that passes through the DD pipeline is written to Graphiti as an "episode" — an enriched narrative document containing:

- Token identifiers (address, ticker, pool)
- Market data at alert time
- Smart wallet addresses and tiers
- Deployer address and bundle wallet addresses
- Lore/narrative from sentiment analysis
- Category, risk rating, and composite score

Graphiti automatically extracts entities and relationships from these episodes, building a growing knowledge graph of the Solana meme token ecosystem.

### Search Strategy

When Recall queries Graphiti, it uses the search endpoint with specific queries:

- **Similar Calls**: Search by lore/narrative text → extract token addresses from returned facts
- **Deployer Network**: Search by deployer address → find all tokens linked to that deployer
- **Bundle Recurrence**: Search by each bundle wallet address → find past appearances
- **Wallet Clusters**: Search by each holding wallet → find co-occurrence tokens
- **Narrative Trends**: Search by narrative keywords → time-split analysis

Token addresses are extracted from Graphiti facts using Solana address pattern matching (base58, 32-44 characters), then resolved against the local database for outcome data.

---

## Display

Recall data is shown only in **DM/Ignition Report mode** — the detailed DD report users receive when they look up a token directly. It is intentionally omitted from channel alerts (Night Call/Trending Call) to keep public alerts concise.

Each dimension is rendered as a compact section:

- **Wallet Intel**: Per-wallet breakdown with tier, alert count, hit rate, peak, PnL
- **Similar Calls**: Match count, MC range, average peak, time-to-peak, hit rate
- **Deployer Network**: Past token count, runner/rug/slow-bleed distribution
- **Bundle Recurrence**: Past token count, runner/rug distribution
- **Wallet Clusters**: Cluster size, co-occurrence count, hit rate, average peak
- **Narrative Trend**: Direction arrow (heating/cooling), recent vs. prior average peaks

---

## Design Decisions

**Why Phase 2.5 (after sentiment, before scoring)?** Recall needs the token's lore/narrative for Similar Calls and Narrative Trends. These are produced by sentiment analysis in Phase 2. Recall's output enriches the final DD report but doesn't feed into the composite score — it's additive intelligence, not a scoring input.

**Why not feed recall into scoring?** Recall signals are powerful but noisy. A deployer with 3 past rugs is a strong signal; similar calls averaging 3x is weaker. Mixing recall into the composite score would require careful calibration and introduce coupling between systems. Instead, recall is presented as independent intelligence for the user (or auto-trader) to factor in.

**Why Graphiti over a traditional database?** Graphiti's semantic search enables fuzzy matching that SQL can't do. "AI trading bot" and "autonomous trading agent" are the same narrative but would never match in a keyword search. Graphiti's entity extraction also discovers relationships we didn't explicitly model — like two seemingly unrelated tokens sharing a common deployer-associated wallet.

**Why dual-layer (Graphiti + LLM fallback)?** Graphiti is a single point of failure for 5 of 6 dimensions. The LLM fallback for Similar Calls ensures the most impactful recall dimension (narrative similarity) degrades to a slower but functional path rather than disappearing entirely.
