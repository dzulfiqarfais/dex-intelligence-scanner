# DEX Intelligence Scanner

Standalone Next.js market-intelligence project.

## Modules

- **DEX Scanner** — DEX Screener discovery, liquidity, transaction flow, momentum, market-risk heuristic.
- **Remora Intelligence v2** — CoinMarketCap small-cap screening, tagged whale + smart-money behavior, large-buy detection, security gate, local scan-delta tracking, browser alerts.
- **Telegram background endpoint** — \`/api/cron/remora\`, ready when \`TELEGRAM_BOT_TOKEN\`, \`TELEGRAM_CHAT_ID\`, and \`CRON_SECRET\` are configured.

## Environment variables (optional)

\`\`\`
CMC_API_KEY=
BIRDEYE_API_KEY=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
CRON_SECRET=
\`\`\`

Without \`CMC_API_KEY\`, the scanner uses CoinMarketCap's keyless public API. A free key is recommended for higher limits.

## Important

Scores and whale labels are analytical heuristics/evidence summaries, not automatic trade instructions or guarantees of future price movement.


## Caller Reputation Database v1

Remora includes a browser-persistent caller observation database for verified GMGN/FOMO/Birdeye/Nansen research. It tracks:
- entry-before-call behavior
- post-call dumping
- observed ROI
- rug/scam exposure
- thesis quality
- sample-size confidence

Reputation is deliberately shrunk toward neutral when observations are scarce. This local store keeps the DEX project separate from the existing Fais Finance Supabase project. A dedicated server database can replace the local adapter later without changing the scoring model.
