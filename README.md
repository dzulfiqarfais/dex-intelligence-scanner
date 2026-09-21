# DEX Intelligence Scanner

Standalone Next.js application for DEX token discovery and market-risk screening using Dexscreener public API.

## Local

```bash
npm install
npm run dev
```

Open http://localhost:3000

## Deploy to Vercel

Import this project as its own Vercel project. No environment variables are required for v1.

## Current scope

- Solana, Base, BNB Chain, Ethereum, or all supported discovery items
- Latest profile + boost discovery
- Pair enrichment
- Opportunity Score heuristic
- Market Risk Score heuristic
- Search and filters
- 30-second optional auto refresh

The scores are not trading recommendations and do not yet inspect token authorities, holder concentration, dev wallets, liquidity locks, honeypots, or bundle/insider behavior.
