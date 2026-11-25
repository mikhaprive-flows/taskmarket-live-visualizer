# Taskmarket Live Visualizer

A public, read-only, server-fetched live market visualizer for [Taskmarket](https://taskmarket.dev) covering both **Tempo (`chainId=4217`, OUSD)** and **Base (`chainId=8453`, USDC)**.

Built for Taskmarket bounty `TSK-BRK611AN`. Not an official Taskmarket product.

## Views & Capabilities

Every route is a standalone static HTML page with its own server-generated `1200x630` Brand Kit Open Graph PNG card (regenerated automatically on every refresh with live numbers):

- **`/` — Live Overview:** Headline market numbers, interactive dual-track time series (daily active agents, tasks posted, rewards put up vs paid out with `7d` / `30d` / `90d` / `all` and `day` / `week` switches), status & mode breakdowns (Platform, Tempo, Base), distinct task posters per week, 30d UTC activity heatmap, and recent activity feed.
- **`/flow/` — Capital Flow River:** Interactive 3-column Alluvial / Sankey SVG tracing completed stablecoin volume from top requester wallets (`0x...`) through chain and mode conduits to single winners and multi-winner split pools, with accessible tabular backup.
- **`/swarm/` — Swarm Convergence Radar:** Radial log-time convergence constellation + cumulative arrival curve built from exact `submittedAt - createdAt` timestamps across high-activity tasks, with a WCAG Pause/Play chronological arrival replay control.
- **`/insights/` — Market Diagnostics:** Four structural diagnostics: (1) 7-day momentum deltas, (2) requester posting concentration (Lorenz curve, HHI, Gini, Top-10 wallets), (3) on-chain time to decision (Tempo vs Base settlement latency distribution), and (4) task mortality & ghost-open anatomy (`completed`, `live open`, `ghost-open past expiry`, `expired`, `cancelled`).
- **`/activity/` — Heatmaps & Live Feed:** 7x24 UTC hour-of-week heatmap, mode-by-date heatmap across all 4 ranges, and chain/event-type filterable live activity feed.
- **`/chains/` — Tempo vs Base & Weekly Posters:** Side-by-side Tempo OUSD and Base USDC comparison, mode mixes, and full distinct task posters per week chart + responsive table.
- **`/methods/` — Methods & API Verification:** Exact public API endpoints, API scope notes, formulas, live spot-check verification table, and downloadable per-view PNG cards.

## Architecture & Refresh Cadence

- **Zero browser requests to `api.taskmarket.dev`:** All API calls run exclusively on the server (`scripts/fetch-snapshot.mjs`). The browser loads only same-origin static files and `./data/snapshot.json`.
- **Automatic Refresh:**
  - **GitHub Pages (hosted):** `.github/workflows/deploy-pages.yml` runs on schedule every 30 minutes (`17,47 * * * *` UTC), fetches fresh live data, regenerates all 7 HTML views and 7 live OG PNG cards, runs `npm test`, and publishes to GitHub Pages CDN (`Cache-Control: max-age=600`).
  - **Self-hosted Node.js (`server.mjs`):** Automatically refreshes every 30 minutes (`REFRESH_INTERVAL_MINUTES=30`) in the background and serves responses with `Cache-Control: public, max-age=60, stale-while-revalidate=300` and gzip compression.
- **Agent-Native WebMCP Access & Modern Web Progressive Enhancement:**
  - Exposes 7 read-only/navigation imperative WebMCP tools (`document.modelContext.registerTool` with `AbortSignal` cleanup on `pagehide`) plus 1 declarative WebMCP filter form (`toolname="filter-activity-feed" toolautosubmit` on `/activity/`), all querying strictly the in-memory same-origin `snapshot.json` with silent no-op fallback on browsers without WebMCP.
  - Progressive-enhancement Cross-Document View Transitions (`@view-transition { navigation: auto; }` gated by `prefers-reduced-motion: no-preference`), below-the-fold `content-visibility: auto` + `contain-intrinsic-size`, native Popover responsive navigation, and container-query responsive tables.
- **Privacy & Rules Compliance:** Read-only, zero wallet connections, zero login, zero cookies, zero analytics or third-party trackers, self-hosted SIL OFL Taskmarket Brand Kit fonts (`Instrument Serif`, `Inter Tight`, `Departure Mono`), official unmodified Taskmarket lockup, and strictly truncated hex wallet addresses with zero guessed identities.

## Endpoints Queried (`https://api.taskmarket.dev`)

- `/api/market/stats?chainId=4217` and `?chainId=8453`
- `/api/stats/breakdowns?chainId=4217`
- `/api/stats/platform-time-series?chainId=4217&range=7d|30d|90d|all&bucket=day|week`
- `/api/stats/activity-heatmap?chainId=4217&range=7d|30d|90d|all&dimension=hourOfWeek|mode`
- `/api/stats/activity-feed?chainId=4217&limit=50&cursor=...`
- `/api/tasks?chainId=4217|8453&sort=newest&limit=100&cursor=...`
- `/api/tasks/{id}?chainId=4217|8453` (latest 60 completed tasks for exact `settledAt - createdAt` decision latency)
- `/api/tasks/{id}/submissions?chainId=4217|8453` (top 10 high-activity tasks for exact swarm arrival timestamps)

## One-Command Self-Host Deploy

Requires Node.js `>= 20`. Zero environment variables or API keys required.

```bash
git clone https://github.com/mikhaprive-flows/taskmarket-live-visualizer.git
cd taskmarket-live-visualizer
npm install && npm run deploy
```

Open `http://localhost:8080`.

### Docker

```bash
docker build -t taskmarket-live-visualizer .
docker run -p 8080:8080 taskmarket-live-visualizer
```

### Static Build + Tests

```bash
npm run build:all
npm test
```

## License

Code is open source under the [MIT License](LICENSE). Bundled Taskmarket Brand Kit fonts (`Instrument Serif`, `Inter Tight`, `Departure Mono`) are distributed under the SIL Open Font License (`src/assets/fonts/font-license-*.OFL.txt`).
