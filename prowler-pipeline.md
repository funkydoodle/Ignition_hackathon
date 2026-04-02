# Prowler Pipeline — Autonomous Smart Wallet Discovery

## Overview

The Prowler Pipeline is an independent wallet discovery system that identifies high-conviction traders by finding wallets appearing across multiple trending Solana tokens. Rather than relying solely on static wallet lists or third-party rankings, Prowler continuously discovers new "runner catchers" — wallets with a pattern of appearing in tokens that go on to perform well.

Discovered wallets feed directly into the main alert pipeline as smart wallets, creating a self-reinforcing intelligence loop: better wallets lead to better alerts, which generate more outcome data, which improves future wallet discovery.

---

## Architecture

```
Phase 1: Daily Collection
+-----------------+     +-------------------+     +------------------+
| Birdeye         |---->| Top 20 Trending   |---->| Top 20 Traders   |
| Trending API    |     | Tokens (<=24h)    |     | Per Token (PnL)  |
+-----------------+     +-------------------+     +------------------+
                                                         |
                                                         v
                                                  +--------------+
                                                  | trending_    |
                                                  | token_traders|
                                                  | (DB table)   |
                                                  +--------------+

Phase 2: Twice-Weekly Cross-Reference
+--------------+     +-------------------+     +-----------------+
| trending_    |---->| Find wallets on   |---->| Calculate       |
| token_traders|     | 2+ distinct tokens|     | Prowler Score   |
+--------------+     +-------------------+     +-----------------+
                                                      |
                                               +------+------+
                                               |             |
                                               v             v
                                        +-----------+  +-----------+
                                        | Candidate |  | Rejected  |
                                        | Queue     |  | (below    |
                                        | (review)  |  |  minimum) |
                                        +-----------+  +-----------+
                                               |
                                               v
Phase 3: Promotion
+-----------+     +-------------------+     +------------------+
| Admin     |---->| Promote with Tier |---->| Smart Wallets    |
| Review    |     | Assignment        |     | Table (active)   |
+-----------+     +-------------------+     +------------------+
```

---

## How It Works

### Phase 1 — Daily Collection

Every 24 hours, Prowler:
1. Fetches the top 20 trending tokens from Birdeye (filtered to tokens <=24h old)
2. For each token, fetches the top 20 traders ranked by PnL from Solanatracker
3. Stores each wallet-token pair with PnL, volume, trade count, and rank
4. Prunes records older than 14 days to prevent stale data accumulation

This creates a rolling window of "who is trading what" across the trending Solana ecosystem.

### Phase 2 — Cross-Reference Scoring

Twice weekly, Prowler analyzes the collected data:
1. **Cross-reference**: Find wallets appearing on 2+ distinct trending tokens
2. **Score**: Calculate a Prowler Score (0-100) using three weighted components
3. **Filter**: Only candidates above the minimum score threshold proceed
4. **Queue**: Qualifying candidates enter the review queue

#### Prowler Score (0-100) — Three Components

| Component | Range | What It Measures |
|-----------|-------|------------------|
| **Cross-Reference Signal** | 0-40 | How many distinct trending tokens the wallet appears on. More tokens = stronger signal that the wallet has consistent alpha, not luck on one token. |
| **Alpha & Conviction** | 0-35 | Performance quality based on ROI metrics. Rewards wallets with strong returns, not just presence. Uses a multi-band classification system. |
| **Rank Signal** | 0-25 | Average rank position among top 20 traders per token. A wallet consistently ranking in the top 5 scores higher than one always at position 18. |

The three-component design prevents gaming: a wallet can't score high by appearing on many tokens with poor performance (low alpha), or by having one great trade but no consistency (low cross-ref).

#### Human vs Bot Classification

Wallets are classified as human or bot based on trade frequency heuristics. Human traders receive a small scoring bonus since human conviction is a stronger signal than algorithmic trading patterns.

### Phase 3 — Promotion

Candidates don't auto-promote. They sit in a review queue where the admin can:
- **Promote**: Assign a tier (1/2/3) based on Prowler Score and promote to the active smart wallets table
- **Reject**: Remove with reasoning
- **Batch promote**: Use score thresholds to promote in bulk

Promoted wallets receive tier-weighted influence in the main alert pipeline:
- **Tier 1 (Elite)**: Full weight in smart wallet scoring
- **Tier 2 (Strong)**: Reduced weight
- **Tier 3 (Emerging)**: Minimal weight, monitored for promotion

---

## Passive Prowler — Self-Learning Variant

In addition to the active pipeline, a **Passive Prowler** runs continuously alongside the main alert system:

1. Monitors ALL alerted tokens (not just trending) for wallet appearances
2. Identifies wallets appearing across 3+ alerted tokens
3. Scores wallets by **outcome data** — did the tokens they appeared in become runners, rugs, or slow bleeds?
4. Wallets consistently appearing in runners score high; wallets associated with rugs score near zero

This creates a self-learning loop: as Ignition alerts on more tokens and tracks their outcomes, the passive prowler builds an increasingly accurate picture of which wallets have genuine alpha.

### Active vs Passive Comparison

| Aspect | Active Prowler | Passive Prowler |
|--------|---------------|-----------------|
| **Data source** | Birdeye trending tokens | All Ignition-alerted tokens |
| **Scoring basis** | PnL, rank, cross-ref count | Historical outcome (runner/rug/slow bleed) |
| **Schedule** | Daily collection, twice-weekly scoring | Continuous |
| **Discovery rate** | Higher (broader net) | Lower but higher quality |
| **Learning** | Static scores at discovery time | Evolves as more outcomes resolve |

---

## Source Tracking

Every smart wallet maintains a `source` field recording how it was discovered:

| Source | Origin |
|--------|--------|
| `manual` | Added by admin via dashboard |
| `birdeye` | Weekly Birdeye top trader refresh |
| `prowler` | Active Prowler pipeline |
| `passive_prowler` | Passive Prowler (outcome-based) |
| `nansen-dca` | Nansen DCA whale detection |

Source tracking enables:
- Performance analysis per discovery method (which source produces the best wallets?)
- Deactivation policies (birdeye wallets rotate weekly; prowler wallets are permanent)
- Conflict resolution when a wallet is discovered by multiple sources

---

## Admin Dashboard

The Prowler admin page provides three tabs:

1. **Automated**: View scheduled collection/cross-ref status, next run times, and recent results
2. **Manual**: Trigger ad-hoc collection or cross-reference runs, select specific trending tokens
3. **Passive Prowler**: Browse passive candidates, view outcome distributions, promote to active

Each tab includes progress tracking for long-running operations and detailed logging.

---

## Design Decisions

**Why not auto-promote?** Auto-promotion risks injecting low-quality wallets that degrade alert quality. The manual review gate ensures a human validates that the candidate's pattern matches genuine trading skill, not coincidental presence.

**Why separate collection and scoring schedules?** Daily collection is lightweight (API calls + DB writes). Scoring involves cross-referencing the entire rolling window — more expensive. Separating them allows high-frequency data ingestion without constant recalculation.

**Why 14-day rolling window?** Solana meme token cycles move fast. Wallets that were active 30 days ago may have rotated to different strategies. 14 days captures current trading patterns while building enough cross-reference data for statistical significance.

**Why three scoring components instead of one?** Single-metric scoring is gameable. Cross-ref alone rewards presence without performance. PnL alone rewards one lucky trade. Rank alone rewards being in less-competitive pools. The three-component system requires consistency across all dimensions.
