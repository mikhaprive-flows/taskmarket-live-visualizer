/**
 * Static multi-page site generator for Taskmarket Live Visualizer.
 * Builds 7 standalone HTML routes with pre-rendered headline numbers,
 * per-view 1200x630 Brand Kit OG share cards, minified server snapshot JSON,
 * and self-hosted SIL OFL Brand Kit fonts.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchAndBuildSnapshot } from './fetch-snapshot.mjs';
import { generateAllOgCards } from './generate-og.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'src');
const DATA_PATH = path.join(ROOT, 'data', 'snapshot.json');
const DIST_DIR = path.join(ROOT, 'dist');

const DEFAULT_SITE_URL = (process.env.SITE_URL || 'https://mikhaprive-flows.github.io/taskmarket-live-visualizer').replace(/\/+$/, '');
const REPO_URL = (process.env.REPO_URL || 'https://github.com/mikhaprive-flows/taskmarket-live-visualizer').replace(/\/+$/, '');

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtInt(n) {
  return Math.round(Number(n || 0)).toLocaleString('en-US');
}

function fmtUsd(n) {
  return `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtHours(h) {
  if (h === null || h === undefined) return 'n/a';
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 48) return `${Number(h).toFixed(1)}h`;
  return `${(Number(h) / 24).toFixed(1)}d`;
}

function fmtSec(s) {
  if (s === null || s === undefined) return 'n/a';
  const v = Math.round(Number(s));
  if (v < 60) return `${v}s`;
  const m = Math.floor(v / 60);
  const rem = v % 60;
  return rem ? `${m}m ${rem}s` : `${m}m`;
}

function fmtUtc(iso) {
  if (!iso) return 'UTC';
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

const NAV_ITEMS = [
  { slug: 'overview', href: '', label: 'Overview' },
  { slug: 'flow', href: 'flow/', label: 'Capital Flow' },
  { slug: 'swarm', href: 'swarm/', label: 'Swarm' },
  { slug: 'insights', href: 'insights/', label: 'Diagnostics' },
  { slug: 'activity', href: 'activity/', label: 'Activity & Feed' },
  { slug: 'chains', href: 'chains/', label: 'Chains & Posters' },
  { slug: 'methods', href: 'methods/', label: 'Methods' },
];

function renderShell({
  slug,
  title,
  description,
  eyebrow,
  h1Html,
  lead,
  bodyHtml,
  asOf,
  baseRel,
  siteUrl,
  ogSlug,
}) {
  const canonical = slug === 'overview' ? `${siteUrl}/` : `${siteUrl}/${slug}/`;
  const ogImg = `${siteUrl}/og/${ogSlug}.png`;
  const navLinks = NAV_ITEMS.map((item) => {
    const href = item.href ? `${baseRel}/${item.href}` : `${baseRel}/`;
    const cur = item.slug === slug ? ' aria-current="page"' : '';
    return `<li><a href="${href}"${cur}>${esc(item.label)}</a></li>`;
  }).join('\n          ');

  return `<!doctype html>
<html lang="en" data-base="${baseRel}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)} | Taskmarket Live Visualizer</title>
  <meta name="description" content="${esc(description)}" />
  <link rel="canonical" href="${esc(canonical)}" />
  <meta name="theme-color" content="#12100E" />
  <link rel="icon" type="image/png" href="${baseRel}/assets/brand/taskmarket-mark.png" />

  <!-- Open Graph & X Share Card (regenerated hourly with live market numbers) -->
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Taskmarket Live Visualizer" />
  <meta property="og:title" content="${esc(title)} · Taskmarket Live Visualizer" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:url" content="${esc(canonical)}" />
  <meta property="og:image" content="${esc(ogImg)}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="${esc(`${title} live market snapshot card`)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(title)} · Taskmarket Live Visualizer" />
  <meta name="twitter:description" content="${esc(description)}" />
  <meta name="twitter:image" content="${esc(ogImg)}" />

  <link rel="preload" href="${baseRel}/assets/fonts/DepartureMono-Regular.woff2" as="font" type="font/woff2" crossorigin />
  <link rel="preload" href="${baseRel}/assets/fonts/InstrumentSerif-Regular.ttf" as="font" type="font/ttf" crossorigin />
  <link rel="stylesheet" href="${baseRel}/styles/main.css" />
</head>
<body data-page="${esc(slug)}">
  <a href="#main-heading" class="skip-link visually-hidden">Skip to main content</a>

  <header class="site-header">
    <div class="header-inner">
      <div class="brand-group">
        <a class="site-logo" href="${baseRel}/" aria-label="Taskmarket Live Visualizer overview">
          <img src="${baseRel}/assets/brand/taskmarket-lockup.png" alt="Taskmarket" width="121" height="28" />
        </a>
        <span class="asof-pill" id="header-asof"><span class="asof-dot" aria-hidden="true"></span>Data as of ${esc(asOf)}</span>
      </div>

      <nav class="site-nav" aria-label="Primary">
        <button
          class="menu-button"
          type="button"
          popovertarget="site-menu"
          popovertargetaction="toggle"
          aria-controls="site-menu"
        >
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
          <span>Menu</span>
        </button>

        <ul id="site-menu" class="site-menu" popover="auto">
          ${navLinks}
        </ul>
      </nav>
    </div>
  </header>

  <main class="page-shell">
    <section class="hero">
      <div class="hero-copy">
        <div class="eyebrow">${esc(eyebrow)}</div>
        <h1 id="main-heading" tabindex="-1">${h1Html}</h1>
        <p class="hero-lead">${esc(lead)}</p>
      </div>
      <div class="share-bar">
        <button type="button" class="btn btn-primary" id="copy-view-link">Copy view link</button>
        <a class="btn btn-mono" href="${baseRel}/og/${esc(ogSlug)}.png" download="taskmarket-${esc(ogSlug)}-card.png">Download card PNG</a>
      </div>
    </section>

    ${bodyHtml}
  </main>

  <footer class="site-footer">
    <div class="footer-inner">
      <div>
        <img src="${baseRel}/assets/brand/taskmarket-lockup.png" alt="Taskmarket" width="112" height="26" />
        <p class="footer-disclaimer">
          <strong>Made for a paid Taskmarket bounty (TSK-BRK611AN) and is not an official Taskmarket product.</strong>
          Read-only public dashboard. No wallet connection, no login, no cookies, no analytics or personal tracking. Every figure is server-fetched from <code>https://api.taskmarket.dev</code> as of <code>${esc(asOf)}</code>.
        </p>
      </div>
      <div class="footer-links">
        <a href="${baseRel}/methods/">Methods &amp; Endpoints</a>
        <a href="${baseRel}/data/snapshot.json">Raw Snapshot JSON</a>
        <a href="${esc(REPO_URL)}" rel="noopener noreferrer">MIT Source Repo</a>
        <a href="https://taskmarket.dev" rel="noopener noreferrer">taskmarket.dev</a>
      </div>
    </div>
  </footer>

  <div id="live-toast" class="toast" role="status" aria-live="polite" aria-atomic="true"></div>
  <script type="module" src="${baseRel}/js/app.js"></script>
</body>
</html>`;
}

function buildOverviewBody(snap, baseRel) {
  const p = snap.headline.platform;
  const tempo = snap.headline.tempo;
  const base = snap.headline.base;
  const growth = snap.diagnostics.growth;
  const dec = snap.diagnostics.timeToDecision;
  const swarm = snap.swarmConvergence.summary;
  const latestWk = snap.weeklyPostersAndChains[snap.weeklyPostersAndChains.length - 1] || {};
  const paidDelta = growth.metrics.find((m) => m.key === 'paidUsd')?.deltaPct ?? 0;

  return `
    <div class="kpi-grid">
      <article class="kpi-card">
        <span class="kpi-label">Registered workers</span>
        <span class="kpi-value">${fmtInt(p.registeredWorkers)}</span>
        <span class="kpi-sub">${fmtInt(p.agentActors)} agents · ${fmtInt(p.humanActors)} humans</span>
      </article>
      <article class="kpi-card is-accent">
        <span class="kpi-label">Active agents (7d)</span>
        <span class="kpi-value">${fmtInt(p.activeAgents7d)}</span>
        <span class="kpi-sub">${fmtInt(p.activeWorkers7d)} active workers total</span>
      </article>
      <article class="kpi-card">
        <span class="kpi-label">Live open tasks</span>
        <span class="kpi-value">${fmtInt(p.openTasks)}</span>
        <span class="kpi-sub">${fmtInt(tempo.liveOpenTasks)} Tempo · ${fmtInt(base.liveOpenTasks)} Base</span>
      </article>
      <article class="kpi-card">
        <span class="kpi-label">Completed tasks</span>
        <span class="kpi-value">${fmtInt(p.completedTasksBreakdown)}</span>
        <span class="kpi-sub">${fmtInt(p.totalTasksBreakdown)} total platform tasks</span>
      </article>
      <article class="kpi-card">
        <span class="kpi-label">Paid workers by chain</span>
        <span class="kpi-value">${fmtInt(tempo.paidWorkers)} / ${fmtInt(base.paidWorkers)}</span>
        <span class="kpi-sub">Tempo OUSD / Base USDC</span>
      </article>
    </div>

    <section class="section-block panel">
      <div class="panel-head">
        <div>
          <h2>Market pulse over time</h2>
          <p class="panel-sub">Daily active agents, tasks posted, rewards put up, and rewards paid from <code>/api/stats/platform-time-series</code>.</p>
        </div>
        <div class="controls-row">
          <div id="ts-range-tabs" class="tablist-scroller" focusgroup="tablist nomemory" aria-label="Time range">
            <button type="button" class="tab-btn" role="tab" data-value="7d" aria-selected="false">7d</button>
            <button type="button" class="tab-btn" role="tab" data-value="30d" aria-selected="true" focusgroupstart>30d</button>
            <button type="button" class="tab-btn" role="tab" data-value="90d" aria-selected="false">90d</button>
            <button type="button" class="tab-btn" role="tab" data-value="all" aria-selected="false">All</button>
          </div>
          <div id="ts-bucket-tabs" class="tablist-scroller" focusgroup="tablist nomemory" aria-label="Time bucket">
            <button type="button" class="tab-btn" role="tab" data-value="day" aria-selected="true" focusgroupstart>Day</button>
            <button type="button" class="tab-btn" role="tab" data-value="week" aria-selected="false">Week</button>
          </div>
        </div>
      </div>

      <div class="insight-callout">
        <strong>7-day momentum (${esc(growth.recentWindow)}):</strong>
        Rewards paid rose <strong>${paidDelta >= 0 ? '+' : ''}${paidDelta}%</strong> vs the prior 7 complete days, while Tempo now accounts for <strong>${Math.round(((latestWk.tempoTasks || 0) / Math.max(1, latestWk.totalTasks || 1)) * 100)}%</strong> of current-week public task volume.
      </div>

      <div id="ts-readout" class="chart-readout" aria-live="polite">Loading time series...</div>

      <div class="two-col">
        <figure class="chart-figure">
          <div id="ts-agents-chart" class="chart-stage"></div>
          <figcaption class="chart-legend">
            <span class="legend-item"><span class="legend-swatch" style="background:var(--magenta)"></span>Active agents (line)</span>
            <span class="legend-item"><span class="legend-swatch" style="background:rgba(217,160,151,0.5)"></span>Tasks posted (bars, right axis)</span>
          </figcaption>
        </figure>
        <figure class="chart-figure">
          <div id="ts-volume-chart" class="chart-stage"></div>
          <figcaption class="chart-legend">
            <span class="legend-item"><span class="legend-swatch" style="background:var(--salmon)"></span>Rewards put up (USD)</span>
            <span class="legend-item"><span class="legend-swatch" style="background:var(--magenta)"></span>Rewards paid out (USD)</span>
          </figcaption>
        </figure>
      </div>
    </section>

    <section class="section-block">
      <div class="view-cards">
        <a class="view-card" href="${baseRel}/flow/">
          <div>
            <div class="view-card-top"><span class="pill pill-magenta">Signature View</span><span class="pill">Interactive Sankey</span></div>
            <h3>Capital Flow River</h3>
            <p>Trace ${fmtUsd(snap.capitalFlow.all.totalUsd)} in settled escrow from requester wallets through chain and mode conduits to winners.</p>
          </div>
          <div class="view-card-stat"><span>${fmtInt(snap.capitalFlow.all.completedTasks)} settled tasks</span><span>Open view -></span></div>
        </a>

        <a class="view-card" href="${baseRel}/swarm/">
          <div>
            <div class="view-card-top"><span class="pill pill-magenta">Signature View</span><span class="pill">Arrival Radar</span></div>
            <h3>Swarm Convergence</h3>
            <p>Watch agents converge on newly escrowed tasks on a log-time radial map with optional chronological replay.</p>
          </div>
          <div class="view-card-stat"><span>Fastest 1st entry: +${fmtSec(swarm.fastestArrivalSec)}</span><span>Open view -></span></div>
        </a>

        <a class="view-card" href="${baseRel}/insights/">
          <div>
            <div class="view-card-top"><span class="pill">Deep Analysis</span><span class="pill">4 Diagnostics</span></div>
            <h3>Market Diagnostics</h3>
            <p>Posting concentration, median time to decision (${fmtHours(dec.tempo.medianHours)} Tempo vs ${fmtHours(dec.base.medianHours)} Base), and task mortality.</p>
          </div>
          <div class="view-card-stat"><span>${tempo.formalDeathRatePct}% vs ${base.formalDeathRatePct}% dead</span><span>Open view -></span></div>
        </a>
      </div>
    </section>

    <section class="section-block panel deferred-section">
      <div class="panel-head">
        <div>
          <h2>Tasks by status and mode</h2>
          <p class="panel-sub" id="breakdown-scope-note">Platform-wide breakdown from <code>/api/stats/breakdowns</code> plus per-chain splits from <code>/api/tasks</code>.</p>
        </div>
        <div id="breakdown-scope-tabs" class="tablist-scroller" focusgroup="tablist nomemory" aria-label="Breakdown scope">
          <button type="button" class="tab-btn" role="tab" data-value="platform" aria-selected="true" focusgroupstart>Platform API</button>
          <button type="button" class="tab-btn" role="tab" data-value="tempo" aria-selected="false">Tempo (4217)</button>
          <button type="button" class="tab-btn" role="tab" data-value="base" aria-selected="false">Base (8453)</button>
        </div>
      </div>
      <div class="two-col">
        <div>
          <h3>By status</h3>
          <div id="breakdown-status-bars" class="bar-list"></div>
        </div>
        <div>
          <h3>By mode</h3>
          <div id="breakdown-mode-bars" class="bar-list"></div>
        </div>
      </div>
    </section>

    <section class="section-block panel deferred-section">
      <div class="panel-head">
        <div>
          <h2>Distinct task posters per week</h2>
          <p class="panel-sub">Unique requester wallets per ISO week computed directly from full paginated <code>/api/tasks?chainId=4217</code> and <code>8453</code>.</p>
        </div>
        <a class="btn btn-mono" href="${baseRel}/chains/">Full chain &amp; poster view -></a>
      </div>
      <div id="overview-posters-readout" class="chart-readout" aria-live="polite"></div>
      <div id="overview-posters-chart" class="chart-stage"></div>
      <div class="chart-legend">
        <span class="legend-item"><span class="legend-swatch" style="background:var(--magenta)"></span>Tempo distinct posters</span>
        <span class="legend-item"><span class="legend-swatch" style="background:var(--salmon)"></span>Base distinct posters</span>
        <span class="legend-item"><span class="legend-swatch" style="background:var(--paper)"></span>Combined deduplicated posters (dashed line)</span>
      </div>
    </section>

    <section class="section-block two-col deferred-section">
      <div class="panel">
        <div class="panel-head">
          <div>
            <h2>Activity heatmap (30d UTC)</h2>
            <p class="panel-sub">Hour-of-week density from <code>/api/stats/activity-heatmap</code>.</p>
          </div>
          <a class="btn btn-mono" href="${baseRel}/activity/">Full heatmaps -></a>
        </div>
        <div id="overview-heatmap-readout" class="chart-readout" aria-live="polite"></div>
        <div id="overview-heatmap-chart" class="chart-stage"></div>
      </div>

      <div class="panel">
        <div class="panel-head">
          <div>
            <h2>Live activity feed</h2>
            <p class="panel-sub">Latest server-fetched events from <code>/api/stats/activity-feed</code> (${snap.activityFeed.summary.eventsPerHour} events/hr).</p>
          </div>
          <a class="btn btn-mono" href="${baseRel}/activity/">Filter feed -></a>
        </div>
        <ul id="overview-feed-list" class="feed-list"></ul>
      </div>
    </section>`;
}

function buildFlowBody(snap) {
  const f = snap.capitalFlow.all;
  return `
    <div class="kpi-grid">
      <article class="kpi-card is-accent">
        <span class="kpi-label">Completed public volume</span>
        <span class="kpi-value">${fmtUsd(f.totalUsd)}</span>
        <span class="kpi-sub">${fmtInt(f.completedTasks)} settled tasks</span>
      </article>
      <article class="kpi-card">
        <span class="kpi-label">Unique paying posters</span>
        <span class="kpi-value">${fmtInt(f.uniquePosters)}</span>
        <span class="kpi-sub">Wallets with >= 1 settled task</span>
      </article>
      <article class="kpi-card">
        <span class="kpi-label">Unique single-award winners</span>
        <span class="kpi-value">${fmtInt(f.uniqueSingleWinners)}</span>
        <span class="kpi-sub">Truncated hex addresses only</span>
      </article>
      <article class="kpi-card">
        <span class="kpi-label">Multi-winner split pools</span>
        <span class="kpi-value">${fmtUsd(f.multiWinnerUsd)}</span>
        <span class="kpi-sub">${fmtInt(f.multiWinnerTasks)} bounties (awardCount &gt; 1)</span>
      </article>
    </div>

    <section class="section-block panel">
      <div class="panel-head">
        <div>
          <h2>Poster -> Conduit -> Winner capital flow</h2>
          <p class="panel-sub">Every ribbon width is strictly proportional to settled escrow USD from paginated <code>/api/tasks</code>. Multi-winner tasks are grouped into a dedicated split-pool node so no split payout is over-attributed to a single address.</p>
        </div>
        <div id="flow-chain-tabs" class="tablist-scroller" focusgroup="tablist nomemory" aria-label="Filter chain">
          <button type="button" class="tab-btn" role="tab" data-value="all" aria-selected="true" focusgroupstart>All chains</button>
          <button type="button" class="tab-btn" role="tab" data-value="tempo" aria-selected="false">Tempo OUSD</button>
          <button type="button" class="tab-btn" role="tab" data-value="base" aria-selected="false">Base USDC</button>
        </div>
      </div>

      <div id="flow-insight-text" class="insight-callout"></div>
      <div id="flow-readout" class="chart-readout" aria-live="polite"></div>
      <div id="flow-sankey-chart" class="chart-stage"></div>
      <div class="chart-legend">
        <span class="legend-item"><span class="legend-swatch" style="background:var(--magenta)"></span>Tempo (OUSD) corridor</span>
        <span class="legend-item"><span class="legend-swatch" style="background:var(--salmon)"></span>Base (USDC) corridor</span>
        <span class="legend-item"><span class="legend-swatch" style="background:var(--paper)"></span>Multi-winner split pools</span>
      </div>
    </section>

    <section class="section-block panel deferred-section">
      <div class="panel-head">
        <div>
          <h2>Top capital corridors (accessible data table)</h2>
          <p class="panel-sub">Exact tabular breakdown of the largest poster-to-conduit and conduit-to-winner flows shown above.</p>
        </div>
      </div>
      <div tabindex="0" role="region" aria-labelledby="flow-table-cap" class="table-wrapper">
        <table class="data-table">
          <caption id="flow-table-cap">Largest settled capital flow corridors by USD volume</caption>
          <thead>
            <tr>
              <th scope="col">Source</th>
              <th scope="col">Target</th>
              <th scope="col" class="num">Volume (USD)</th>
              <th scope="col" class="num">Tasks</th>
              <th scope="col" class="num">Share</th>
            </tr>
          </thead>
          <tbody id="flow-table-body"></tbody>
        </table>
      </div>
    </section>`;
}

function buildSwarmBody(snap) {
  const s = snap.swarmConvergence.summary;
  return `
    <div class="kpi-grid">
      <article class="kpi-card is-accent">
        <span class="kpi-label">Fastest first entry</span>
        <span class="kpi-value">+${fmtSec(s.fastestArrivalSec)}</span>
        <span class="kpi-sub">Elapsed from task creation</span>
      </article>
      <article class="kpi-card">
        <span class="kpi-label">Median first arrival</span>
        <span class="kpi-value">+${fmtSec(s.medianFirstArrivalSec)}</span>
        <span class="kpi-sub">Across ${fmtInt(s.tasksTracked)} high-activity tasks</span>
      </article>
      <article class="kpi-card">
        <span class="kpi-label">Median 5th arrival</span>
        <span class="kpi-value">+${fmtSec(s.medianFifthArrivalSec)}</span>
        <span class="kpi-sub">Time to reach 5 competitors</span>
      </article>
      <article class="kpi-card">
        <span class="kpi-label">Arrivals timestamped</span>
        <span class="kpi-value">${fmtInt(s.totalArrivalsMeasured)}</span>
        <span class="kpi-sub">Via /api/tasks/{id}/submissions</span>
      </article>
    </div>

    <section class="section-block panel">
      <div class="panel-head">
        <div>
          <h2>Radial swarm convergence constellation</h2>
          <p class="panel-sub">Concentric rings measure log-scaled minutes after <code>createdAt</code>. Closer to the magenta core means faster agent detection. Larger dots denote agents with higher prior completed task counts.</p>
        </div>
        <button type="button" id="swarm-replay-btn" class="btn btn-primary">Play arrival replay</button>
      </div>

      <div id="swarm-selected-meta" class="insight-callout"></div>

      <div class="swarm-layout">
        <div>
          <h3 style="margin-block-end:0.65rem;">Recent high-velocity tasks</h3>
          <ul id="swarm-task-list" class="swarm-list"></ul>
        </div>
        <div>
          <div id="swarm-readout" class="chart-readout" aria-live="polite"></div>
          <div class="two-col">
            <div id="swarm-radar-chart" class="chart-stage"></div>
            <div>
              <h3 style="margin-block-end:0.5rem;">Cumulative arrivals (log time)</h3>
              <div id="swarm-curve-chart" class="chart-stage"></div>
              <div class="chart-legend">
                <span class="legend-item"><span class="legend-swatch" style="background:var(--paper);border:1px solid var(--magenta)"></span>TAP-verified agent</span>
                <span class="legend-item"><span class="legend-swatch" style="background:var(--salmon)"></span>Standard agent</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="section-block panel deferred-section">
      <div class="panel-head">
        <div>
          <h2>First 15 arrivals on selected task</h2>
          <p class="panel-sub">Exact arrival order and latency computed from <code>submittedAt - createdAt</code>. Wallet addresses are truncated hex only.</p>
        </div>
      </div>
      <div tabindex="0" role="region" aria-labelledby="swarm-table-cap" class="table-wrapper">
        <table class="data-table">
          <caption id="swarm-table-cap">Chronological first 15 agent submissions</caption>
          <thead>
            <tr>
              <th scope="col">Order</th>
              <th scope="col">Agent Wallet</th>
              <th scope="col" class="num">Latency</th>
              <th scope="col" class="num">Prior Wins</th>
              <th scope="col">TAP Check</th>
              <th scope="col" class="num">Submitted UTC</th>
            </tr>
          </thead>
          <tbody id="swarm-table-body"></tbody>
        </table>
      </div>
    </section>`;
}

function buildInsightsBody(snap) {
  const diag = snap.diagnostics;
  const concT = diag.concentration.tempo;
  const concB = diag.concentration.base;
  const dec = diag.timeToDecision;
  const mT = diag.mortality.tempo;
  const mB = diag.mortality.base;

  const growthCards = diag.growth.metrics
    .map((m) => {
      const up = m.deltaPct !== null && m.deltaPct >= 0;
      const valStr = m.unit === 'USD' ? fmtUsd(m.recent) : fmtInt(m.recent);
      const priorStr = m.unit === 'USD' ? fmtUsd(m.prior) : fmtInt(m.prior);
      return `
        <article class="kpi-card">
          <span class="kpi-label">${esc(m.label)}</span>
          <span class="kpi-value">${valStr}</span>
          <span class="kpi-delta ${up ? 'is-up' : 'is-down'}">${m.deltaPct === null ? 'n/a' : `${up ? '+' : ''}${m.deltaPct}%`} vs ${priorStr}</span>
        </article>`;
    })
    .join('');

  return `
    <section class="section-block">
      <div class="panel">
        <div class="panel-head">
          <div>
            <h2>1. What is growing (7-day momentum)</h2>
            <p class="panel-sub">Complete 7-day UTC window (<code>${esc(diag.growth.recentWindow)}</code>) compared against the prior 7 complete days (<code>${esc(diag.growth.priorWindow)}</code>), excluding the partial trailing UTC day.</p>
          </div>
        </div>
        <div class="kpi-grid" style="margin-block-end:0;">${growthCards}</div>
      </div>
    </section>

    <section class="section-block two-col">
      <div class="panel">
        <div class="panel-head">
          <div>
            <h2>2. How concentrated posting is</h2>
            <p class="panel-sub">Lorenz curve of requester task share: further from the dashed equality line means fewer wallets generate most demand.</p>
          </div>
        </div>
        <div class="insight-callout">
          <strong>Tempo is far more concentrated than Base:</strong>
          On Tempo, <strong>${fmtInt(concT.uniquePosters)}</strong> wallets posted all <strong>${fmtInt(concT.totalTasks)}</strong> public tasks — the top 5 wallets account for <strong>${concT.top5TaskSharePct}%</strong> (HHI <code>${concT.hhiTasks}</code>). On Base, <strong>${fmtInt(concB.uniquePosters)}</strong> wallets posted <strong>${fmtInt(concB.totalTasks)}</strong> tasks with top-5 share at <strong>${concB.top5TaskSharePct}%</strong> (HHI <code>${concB.hhiTasks}</code>).
        </div>
        <div id="lorenz-chart" class="chart-stage"></div>
        <div class="chart-legend">
          <span class="legend-item"><span class="legend-swatch" style="background:var(--magenta)"></span>Tempo (Gini ${concT.giniTasks.toFixed(3)})</span>
          <span class="legend-item"><span class="legend-swatch" style="background:var(--salmon)"></span>Base (Gini ${concB.giniTasks.toFixed(3)})</span>
          <span class="legend-item"><span class="legend-swatch" style="background:var(--line)"></span>Perfect equality</span>
        </div>
      </div>

      <div class="panel">
        <div class="panel-head">
          <div>
            <h2>3. Time to a decision</h2>
            <p class="panel-sub">${esc(dec.sampleNote)}</p>
          </div>
        </div>
        <div class="insight-callout">
          <strong>Tempo clears orders of magnitude faster:</strong>
          Median time from posting to first on-chain settlement is <strong>${fmtHours(dec.tempo.medianHours)}</strong> on Tempo (IQR ${fmtHours(dec.tempo.p25Hours)} - ${fmtHours(dec.tempo.p75Hours)}) compared with <strong>${fmtHours(dec.base.medianHours)}</strong> on Base (IQR ${fmtHours(dec.base.p25Hours)} - ${fmtHours(dec.base.p75Hours)}).
        </div>
        <div id="latency-readout" class="chart-readout" aria-live="polite"></div>
        <div id="latency-chart" class="chart-stage"></div>
      </div>
    </section>

    <section class="section-block panel deferred-section">
      <div class="panel-head">
        <div>
          <h2>Top 10 requester wallets by task volume</h2>
          <p class="panel-sub" id="conc-metrics-line"></p>
        </div>
        <div id="conc-scope-tabs" class="tablist-scroller" focusgroup="tablist nomemory" aria-label="Concentration chain">
          <button type="button" class="tab-btn" role="tab" data-value="tempo" aria-selected="true" focusgroupstart>Tempo</button>
          <button type="button" class="tab-btn" role="tab" data-value="base" aria-selected="false">Base</button>
          <button type="button" class="tab-btn" role="tab" data-value="combined" aria-selected="false">Combined</button>
        </div>
      </div>
      <div tabindex="0" role="region" aria-labelledby="conc-table-cap" class="table-wrapper">
        <table class="data-table">
          <caption id="conc-table-cap">Top 10 requester wallets (truncated hex addresses, no guessed identities)</caption>
          <thead>
            <tr>
              <th scope="col">Requester Wallet</th>
              <th scope="col" class="num">Tasks</th>
              <th scope="col" class="num">Share</th>
              <th scope="col" class="num">Escrow Posted</th>
              <th scope="col" class="num">Completion</th>
              <th scope="col" class="num">Dead Rate</th>
              <th scope="col">Chain</th>
            </tr>
          </thead>
          <tbody id="conc-table-body"></tbody>
        </table>
      </div>
    </section>

    <section class="section-block panel deferred-section">
      <div class="panel-head">
        <div>
          <h2>4. Tasks that died (mortality &amp; ghost-open anatomy)</h2>
          <p class="panel-sub">Separates formally <code>expired</code> and <code>cancelled</code> tasks from "ghost-open" tasks whose <code>status</code> is still <code>open</code> on-chain even though <code>expiryTime</code> has passed.</p>
        </div>
        <div id="mortality-mode-tabs" class="tablist-scroller" focusgroup="tablist nomemory" aria-label="Mortality unit">
          <button type="button" class="tab-btn" role="tab" data-value="tasks" aria-selected="true" focusgroupstart>By task count</button>
          <button type="button" class="tab-btn" role="tab" data-value="usd" aria-selected="false">By escrow USD</button>
        </div>
      </div>

      <div class="insight-callout">
        <strong>A 10x mortality gap between chains:</strong>
        Only <strong>${mT.formalDeathRatePct}%</strong> of Tempo tasks ended expired or cancelled (<strong>${mT.completionRatePct}%</strong> completed), compared with <strong>${mB.formalDeathRatePct}%</strong> formal deaths on Base (<strong>${fmtUsd(mB.rewardExpiredUsd + mB.rewardCancelledUsd)}</strong> unpaid/reclaimed). Across both chains, another <strong>${fmtInt(mT.ghostOpenTasks + mB.ghostOpenTasks)}</strong> tasks sit in ghost-open limbo past their submission deadline.
      </div>

      <div id="mortality-bars"></div>

      <div class="chart-legend" style="margin-block-end:1.25rem;">
        <span class="legend-item"><span class="legend-swatch" style="background:#E74079"></span>Completed</span>
        <span class="legend-item"><span class="legend-swatch" style="background:#D9A097"></span>Live open</span>
        <span class="legend-item"><span class="legend-swatch" style="background:#EFE9E2"></span>In progress</span>
        <span class="legend-item"><span class="legend-swatch" style="background:#8A5A54"></span>Ghost-open (past expiry)</span>
        <span class="legend-item"><span class="legend-swatch" style="background:#5E554D"></span>Expired</span>
        <span class="legend-item"><span class="legend-swatch" style="background:#3B342E"></span>Cancelled</span>
      </div>

      <div tabindex="0" role="region" aria-labelledby="mort-tier-cap" class="table-wrapper">
        <table class="data-table">
          <caption id="mort-tier-cap">Outcome breakdown by reward tier (combined public tasks)</caption>
          <thead>
            <tr>
              <th scope="col">Reward Tier</th>
              <th scope="col" class="num">Tasks</th>
              <th scope="col" class="num">Completed</th>
              <th scope="col" class="num">Ghost-Open</th>
              <th scope="col" class="num">Expired + Cancelled</th>
              <th scope="col" class="num">Escrow Posted</th>
            </tr>
          </thead>
          <tbody id="mortality-tier-body"></tbody>
        </table>
      </div>
    </section>`;
}

function buildActivityBody(snap) {
  const peak30 = snap.heatmaps.peaks['30d']?.peak;
  const fSum = snap.activityFeed.summary;
  return `
    <div class="kpi-grid">
      <article class="kpi-card is-accent">
        <span class="kpi-label">Peak UTC hour (30d)</span>
        <span class="kpi-value">${peak30 ? `${peak30.dayLabel} ${String(peak30.hourUtc).padStart(2, '0')}:00` : 'n/a'}</span>
        <span class="kpi-sub">${peak30 ? `${fmtInt(peak30.count)} events in slot` : ''}</span>
      </article>
      <article class="kpi-card">
        <span class="kpi-label">Live event rate</span>
        <span class="kpi-value">${fSum.eventsPerHour}/hr</span>
        <span class="kpi-sub">${fmtInt(fSum.sampledEvents)} events over ${fSum.spanHours}h</span>
      </article>
      <article class="kpi-card">
        <span class="kpi-label">Distinct active actors</span>
        <span class="kpi-value">${fmtInt(fSum.uniqueActors)}</span>
        <span class="kpi-sub">In latest ${fSum.spanHours}h feed window</span>
      </article>
      <article class="kpi-card">
        <span class="kpi-label">Feed chain split</span>
        <span class="kpi-value">${fmtInt(fSum.chainCounts.tempo)} / ${fmtInt(fSum.chainCounts.base)}</span>
        <span class="kpi-sub">Tempo / Base recent events</span>
      </article>
    </div>

    <section class="section-block panel">
      <div class="panel-head">
        <div>
          <h2>UTC hour-of-week &amp; mode heatmaps</h2>
          <p class="panel-sub">Rendered directly from <code>/api/stats/activity-heatmap</code> across all four ranges.</p>
        </div>
        <div id="hm-range-tabs" class="tablist-scroller" focusgroup="tablist nomemory" aria-label="Heatmap range">
          <button type="button" class="tab-btn" role="tab" data-value="7d" aria-selected="false">7d</button>
          <button type="button" class="tab-btn" role="tab" data-value="30d" aria-selected="true" focusgroupstart>30d</button>
          <button type="button" class="tab-btn" role="tab" data-value="90d" aria-selected="false">90d</button>
          <button type="button" class="tab-btn" role="tab" data-value="all" aria-selected="false">All</button>
        </div>
      </div>

      <h3 style="margin-block-end:0.5rem;">Hour of week (UTC)</h3>
      <div id="hm-hour-readout" class="chart-readout" aria-live="polite"></div>
      <div id="hm-hour-chart" class="chart-stage" style="margin-block-end:1.5rem;"></div>

      <h3 style="margin-block-end:0.5rem;">Task mode by date (latest 31 active dates in range)</h3>
      <div id="hm-mode-readout" class="chart-readout" aria-live="polite"></div>
      <div id="hm-mode-chart" class="chart-stage"></div>
    </section>

    <section class="section-block panel deferred-section">
      <div class="panel-head">
        <div>
          <h2>Live activity feed</h2>
          <p class="panel-sub">Server-cached stream from <code>/api/stats/activity-feed</code>. Filter by chain or event type.</p>
        </div>
        <div class="controls-row">
          <div id="feed-chain-tabs" class="tablist-scroller" focusgroup="tablist nomemory" aria-label="Feed chain filter">
            <button type="button" class="tab-btn" role="tab" data-value="all" aria-selected="true" focusgroupstart>All chains</button>
            <button type="button" class="tab-btn" role="tab" data-value="tempo" aria-selected="false">Tempo</button>
            <button type="button" class="tab-btn" role="tab" data-value="base" aria-selected="false">Base</button>
          </div>
          <div id="feed-type-tabs" class="tablist-scroller" focusgroup="tablist nomemory" aria-label="Feed event type filter">
            <button type="button" class="tab-btn" role="tab" data-value="all" aria-selected="true" focusgroupstart>All events</button>
            <button type="button" class="tab-btn" role="tab" data-value="task_submitted" aria-selected="false">Entries</button>
            <button type="button" class="tab-btn" role="tab" data-value="task_created" aria-selected="false">New tasks</button>
          </div>
        </div>
      </div>
      <ul id="live-feed-list" class="feed-list"></ul>
    </section>`;
}

function buildChainsBody(snap) {
  const t = snap.headline.tempo;
  const b = snap.headline.base;
  const weeks = snap.weeklyPostersAndChains;
  const peakWeek = weeks.reduce((best, w) => (!best || w.combinedDistinctPosters > best.combinedDistinctPosters ? w : best), null);

  return `
    <div class="two-col section-block">
      <article class="panel">
        <div class="panel-head">
          <div>
            <span class="pill pill-tempo">Chain 4217 · OUSD</span>
            <h2 style="margin-block-start:0.5rem;">Tempo</h2>
          </div>
          <span class="kpi-value" style="color:var(--magenta);">${fmtUsd(t.rewardCompletedUsd)}</span>
        </div>
        <div class="kpi-grid" style="margin-block-end:1rem;">
          <div class="kpi-card"><span class="kpi-label">Public tasks</span><span class="kpi-value">${fmtInt(t.totalTasks)}</span><span class="kpi-sub">${fmtInt(t.liveOpenTasks)} live open · ${fmtInt(t.ghostOpenTasks)} ghost-open</span></div>
          <div class="kpi-card"><span class="kpi-label">Paid workers</span><span class="kpi-value">${fmtInt(t.paidWorkers)}</span><span class="kpi-sub">${fmtInt(t.activeWallets)} active wallets</span></div>
          <div class="kpi-card"><span class="kpi-label">Unique posters</span><span class="kpi-value">${fmtInt(t.uniquePosters)}</span><span class="kpi-sub">Median reward ${fmtUsd(t.medianRewardUsd)}</span></div>
          <div class="kpi-card"><span class="kpi-label">Completion / Dead</span><span class="kpi-value">${t.completionRatePct}%</span><span class="kpi-sub">${t.formalDeathRatePct}% expired + cancelled</span></div>
        </div>
        <h3>Tempo mode mix</h3>
        <div id="tempo-mode-bars" class="bar-list"></div>
      </article>

      <article class="panel">
        <div class="panel-head">
          <div>
            <span class="pill pill-base">Chain 8453 · USDC</span>
            <h2 style="margin-block-start:0.5rem;">Base</h2>
          </div>
          <span class="kpi-value" style="color:var(--salmon);">${fmtUsd(b.rewardCompletedUsd)}</span>
        </div>
        <div class="kpi-grid" style="margin-block-end:1rem;">
          <div class="kpi-card"><span class="kpi-label">Public tasks</span><span class="kpi-value">${fmtInt(b.totalTasks)}</span><span class="kpi-sub">${fmtInt(b.liveOpenTasks)} live open · ${fmtInt(b.ghostOpenTasks)} ghost-open</span></div>
          <div class="kpi-card"><span class="kpi-label">Paid workers</span><span class="kpi-value">${fmtInt(b.paidWorkers)}</span><span class="kpi-sub">${fmtInt(b.activeWallets)} active wallets</span></div>
          <div class="kpi-card"><span class="kpi-label">Unique posters</span><span class="kpi-value">${fmtInt(b.uniquePosters)}</span><span class="kpi-sub">Median reward ${fmtUsd(b.medianRewardUsd)}</span></div>
          <div class="kpi-card"><span class="kpi-label">Completion / Dead</span><span class="kpi-value">${b.completionRatePct}%</span><span class="kpi-sub">${b.formalDeathRatePct}% expired + cancelled</span></div>
        </div>
        <h3>Base mode mix</h3>
        <div id="base-mode-bars" class="bar-list"></div>
      </article>
    </div>

    <section class="section-block panel">
      <div class="panel-head">
        <div>
          <h2>Distinct task posters per week &amp; chain migration</h2>
          <p class="panel-sub">Computed from every public task's <code>requester</code> wallet and <code>createdAt</code> UTC week (Monday start) across both chains.</p>
        </div>
        <div id="chains-metric-tabs" class="tablist-scroller" focusgroup="tablist nomemory" aria-label="Weekly metric">
          <button type="button" class="tab-btn" role="tab" data-value="posters" aria-selected="true" focusgroupstart>Distinct posters</button>
          <button type="button" class="tab-btn" role="tab" data-value="tasks" aria-selected="false">Tasks posted</button>
        </div>
      </div>

      ${peakWeek ? `<div class="insight-callout"><strong>Peak weekly poster breadth:</strong> Week of <strong>${esc(peakWeek.week)}</strong> reached <strong>${fmtInt(peakWeek.combinedDistinctPosters)}</strong> distinct requester wallets (${fmtInt(peakWeek.baseDistinctPosters)} Base, ${fmtInt(peakWeek.tempoDistinctPosters)} Tempo). Since early November, new posting volume migrated overwhelmingly onto Tempo OUSD.</div>` : ''}

      <div id="chains-weekly-readout" class="chart-readout" aria-live="polite"></div>
      <div id="chains-weekly-chart" class="chart-stage"></div>
      <div class="chart-legend">
        <span class="legend-item"><span class="legend-swatch" style="background:var(--magenta)"></span>Tempo (OUSD)</span>
        <span class="legend-item"><span class="legend-swatch" style="background:var(--salmon)"></span>Base (USDC)</span>
        <span class="legend-item"><span class="legend-swatch" style="background:var(--paper)"></span>Deduplicated combined posters</span>
      </div>
    </section>

    <section class="section-block panel deferred-section">
      <div class="panel-head">
        <div>
          <h2>Weekly ledger table (last 16 active weeks)</h2>
          <p class="panel-sub">Exact counts of distinct requester addresses and tasks posted per week on Tempo and Base.</p>
        </div>
      </div>
      <div tabindex="0" role="region" aria-labelledby="weekly-table-cap" class="table-wrapper">
        <table class="data-table">
          <caption id="weekly-table-cap">Weekly distinct task posters, tasks, and escrowed rewards</caption>
          <thead>
            <tr>
              <th scope="col">Week (UTC Mon)</th>
              <th scope="col" class="num">Combined Posters</th>
              <th scope="col" class="num">Tempo Posters</th>
              <th scope="col" class="num">Base Posters</th>
              <th scope="col" class="num">Tempo Tasks</th>
              <th scope="col" class="num">Base Tasks</th>
              <th scope="col" class="num">Tempo Escrow</th>
              <th scope="col" class="num">Base Escrow</th>
            </tr>
          </thead>
          <tbody id="weekly-posters-table-body"></tbody>
        </table>
      </div>
    </section>`;
}

function buildMethodsBody(snap, baseRel) {
  const m = snap.meta;
  const endpointLis = m.endpointsUsed.map((ep) => `<li><code>${esc(m.apiBase)}${esc(ep)}</code></li>`).join('\n');
  const sampleRows = (m.verificationSamples || [])
    .map(
      (v) => `
      <tr>
        <th scope="row">${esc(v.metric)}</th>
        <td class="num" data-label="Value">${fmtInt(v.value)}</td>
        <td data-label="Endpoint"><code>${esc(v.endpoint)}</code></td>
        <td data-label="JSON Field"><code>${esc(v.field)}</code></td>
      </tr>`
    )
    .join('');

  const ogCardsPreview = ['overview', 'flow', 'swarm', 'insights', 'activity', 'chains']
    .map(
      (s) => `
      <figure class="og-preview-card" style="margin:0;">
        <img src="${baseRel}/og/${s}.png" alt="Live OG share card for ${s} view" loading="lazy" width="1200" height="630" />
        <figcaption style="padding:0.6rem 0.8rem;display:flex;justify-content:space-between;align-items:center;font-family:var(--font-mono);font-size:0.74rem;color:var(--muted);">
          <span>/${s === 'overview' ? '' : `${s}/`}</span>
          <a href="${baseRel}/og/${s}.png" download="taskmarket-${s}-card.png">Download PNG</a>
        </figcaption>
      </figure>`
    )
    .join('');

  return `
    <section class="section-block panel">
      <div class="panel-head">
        <div>
          <h2>Data freshness &amp; server-fetch architecture</h2>
          <p class="panel-sub">This dashboard never calls <code>api.taskmarket.dev</code> from the browser. All data is fetched server-side, validated, cached, and served from the same origin.</p>
        </div>
      </div>

      <div class="insight-callout">
        <strong>Snapshot audit:</strong>
        Fetched at <code>${esc(m.fetchedAt)}</code> via <strong>${fmtInt(m.apiRequests)}</strong> server-side HTTP requests in <strong>${(m.fetchDurationMs / 1000).toFixed(2)}s</strong>.
        Scheduled GitHub Actions builds refresh the live site every <strong>30 minutes</strong> (<code>17,47 * * * *</code> UTC) and GitHub Pages CDN caches assets with <code>max-age=600</code> (<code>&gt;= 60s</code>). Self-hosted Node mode (<code>npm start</code>) refreshes every 30 minutes and sends <code>Cache-Control: public, max-age=60, stale-while-revalidate=300</code>.
      </div>

      <h3>API scope note (Tempo vs Base)</h3>
      <p style="color:var(--muted);margin-block:0.4rem 1.1rem;">${esc(m.apiScopeNote)}</p>

      <h3>Endpoints queried</h3>
      <ul style="color:var(--muted);line-height:1.75;padding-inline-start:1.25rem;margin-block:0.5rem 1.25rem;">
        ${endpointLis}
      </ul>

      <h3>Spot-check verification table (as of ${esc(fmtUtc(m.fetchedAt))})</h3>
      <div tabindex="0" role="region" aria-labelledby="verify-table-cap" class="table-wrapper">
        <table class="data-table">
          <caption id="verify-table-cap">Exact verbatim API figures captured in this snapshot</caption>
          <thead>
            <tr>
              <th scope="col">Metric</th>
              <th scope="col" class="num">Snapshot Value</th>
              <th scope="col">Public API Endpoint</th>
              <th scope="col">Field</th>
            </tr>
          </thead>
          <tbody>${sampleRows}</tbody>
        </table>
      </div>
    </section>

    <section class="section-block panel deferred-section">
      <div class="panel-head">
        <div>
          <h2>Derived metric formulas</h2>
          <p class="panel-sub">Every derived statistic on this site is deterministically reproducible from the raw snapshot JSON.</p>
        </div>
      </div>
      <ul style="color:var(--muted);line-height:1.7;padding-inline-start:1.25rem;">
        <li><strong>Distinct task posters per week:</strong> Group every task in paginated <code>/api/tasks?chainId=4217</code> and <code>8453</code> by UTC Monday week of <code>createdAt</code>, and count unique lowercased <code>requester</code> addresses per chain and in a combined deduplicated <code>Set</code>.</li>
        <li><strong>Capital flow river:</strong> Filter public tasks with <code>status === "completed"</code> and <code>reward &gt; 0</code> (6-decimal micro-units divided by <code>1,000,000</code>). Tasks with <code>awardCount === 1</code> route to <code>primaryAward.workerAddress</code>; tasks with <code>awardCount &gt; 1</code> route to the explicit <em>Multi-winner split pools</em> node to preserve flow conservation without over-attributing split awards.</li>
        <li><strong>Swarm convergence latency:</strong> For the 10 most active recent tasks, fetch <code>/api/tasks/{id}/submissions</code> and compute exact <code>submittedAt - createdAt</code> in seconds per arrival.</li>
        <li><strong>Time to decision:</strong> Across the 30 most recent completed Tempo tasks and 30 most recent completed Base tasks, fetch <code>/api/tasks/{id}</code> and compute <code>min(awards[].settledAt) - createdAt</code> in hours.</li>
        <li><strong>Ghost-open vs dead tasks:</strong> Tasks with <code>status === "open"</code> and <code>submissionWindowOpen === false</code> (or <code>expiryTime &lt; fetchedAt</code>) are separated from live open tasks so the live count matches <code>/api/market/stats.openTasks</code> exactly.</li>
        <li><strong>Wallet privacy &amp; neutrality:</strong> All addresses are rendered strictly as truncated hex (<code>0x1234...abcd</code>). No guessed names or human identities are attached to any wallet address.</li>
      </ul>

      <h3 style="margin-block-start:1.25rem;">One-command self-host deploy</h3>
      <pre class="code-block">git clone ${esc(REPO_URL)}.git
cd taskmarket-live-visualizer
npm install &amp;&amp; npm run deploy</pre>
      <p style="color:var(--muted);font-size:0.86rem;margin-block-start:0.5rem;">Or run via Docker: <code>docker build -t taskmarket-visualizer . &amp;&amp; docker run -p 8080:8080 taskmarket-visualizer</code></p>
    </section>

    <section class="section-block panel deferred-section">
      <div class="panel-head">
        <div>
          <h2>Per-view live share cards (1200x630 PNG)</h2>
          <p class="panel-sub">Each route ships its own Open Graph &amp; Twitter summary card regenerated on every hourly refresh with live Brand Kit numbers.</p>
        </div>
      </div>
      <div class="three-col">${ogCardsPreview}</div>
    </section>`;
}

async function copyDir(src, dst) {
  await fs.mkdir(dst, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      await copyDir(s, d);
    } else {
      await fs.copyFile(s, d);
    }
  }
}

export async function buildSite({ snapshot = null, siteUrl = DEFAULT_SITE_URL } = {}) {
  let snap = snapshot;
  if (!snap) {
    try {
      snap = JSON.parse(await fs.readFile(DATA_PATH, 'utf8'));
    } catch {
      snap = await fetchAndBuildSnapshot({ writeDisk: true });
    }
  }

  await fs.mkdir(DIST_DIR, { recursive: true });
  await Promise.all([
    copyDir(path.join(SRC_DIR, 'assets'), path.join(DIST_DIR, 'assets')),
    copyDir(path.join(SRC_DIR, 'styles'), path.join(DIST_DIR, 'styles')),
    copyDir(path.join(SRC_DIR, 'js'), path.join(DIST_DIR, 'js')),
  ]);

  // Write minified same-origin snapshot.json
  await fs.mkdir(path.join(DIST_DIR, 'data'), { recursive: true });
  await fs.writeFile(path.join(DIST_DIR, 'data', 'snapshot.json'), JSON.stringify(snap), 'utf8');

  // Render all 7 live Brand Kit OG PNG cards
  const ogCards = await generateAllOgCards(snap, path.join(DIST_DIR, 'og'));

  // Write .nojekyll so GitHub Pages serves everything cleanly
  await fs.writeFile(path.join(DIST_DIR, '.nojekyll'), '', 'utf8');

  const asOf = fmtUtc(snap.meta.fetchedAt);
  const pages = [
    {
      slug: 'overview',
      outPath: path.join(DIST_DIR, 'index.html'),
      baseRel: '.',
      ogSlug: 'overview',
      title: 'Live Market Overview',
      description: `Live Taskmarket pulse as of ${asOf}: ${fmtInt(snap.headline.platform.activeAgents7d)} active agents (7d), ${fmtInt(snap.headline.platform.openTasks)} live open tasks, ${fmtInt(snap.headline.platform.completedTasksBreakdown)} completed tasks across Tempo and Base.`,
      eyebrow: 'Live Market Pulse · Tempo (4217) & Base (8453)',
      h1Html: 'The live <em>pulse</em> of Taskmarket.',
      lead: 'A public, server-fetched picture of active agents, posted escrow, settled payouts, and dual-chain activity across Tempo OUSD and Base USDC.',
      bodyHtml: buildOverviewBody(snap, '.'),
    },
    {
      slug: 'flow',
      outPath: path.join(DIST_DIR, 'flow', 'index.html'),
      baseRel: '..',
      ogSlug: 'flow',
      title: 'Capital Flow River',
      description: `Trace ${fmtUsd(snap.capitalFlow.all.totalUsd)} in completed Taskmarket escrow from requester wallets through chain and mode conduits to winning agents.`,
      eyebrow: 'Escrow Settlement Topology',
      h1Html: 'Where escrow <em>flows</em> on-chain.',
      lead: 'Completed public task rewards traced from top requester wallets through Tempo and Base mode conduits to single winners and multi-winner split pools.',
      bodyHtml: buildFlowBody(snap),
    },
    {
      slug: 'swarm',
      outPath: path.join(DIST_DIR, 'swarm', 'index.html'),
      baseRel: '..',
      ogSlug: 'swarm',
      title: 'Swarm Convergence Radar',
      description: `Live agent convergence velocity on Taskmarket: fastest first submission in +${fmtSec(snap.swarmConvergence.summary.fastestArrivalSec)}, median first arrival in +${fmtSec(snap.swarmConvergence.summary.medianFirstArrivalSec)}.`,
      eyebrow: 'Real-Time Submission Arrival Velocity',
      h1Html: 'How the <em>swarm</em> converges.',
      lead: 'Exact submission arrival timestamps plotted radially from task creation so you can see how quickly autonomous agents detect and compete on new tasks.',
      bodyHtml: buildSwarmBody(snap),
    },
    {
      slug: 'insights',
      outPath: path.join(DIST_DIR, 'insights', 'index.html'),
      baseRel: '..',
      ogSlug: 'insights',
      title: 'Market Diagnostics',
      description: `Non-obvious Taskmarket diagnostics: Tempo median decision ${fmtHours(snap.diagnostics.timeToDecision.tempo.medianHours)} vs Base ${fmtHours(snap.diagnostics.timeToDecision.base.medianHours)}, posting concentration, task mortality, and 7-day momentum.`,
      eyebrow: 'Concentration · Latency · Mortality · Growth',
      h1Html: 'What the <em>market</em> reveals.',
      lead: 'Four structural diagnostics computed directly from public Taskmarket data: requester concentration, time to settlement, tasks that died, and 7-day momentum.',
      bodyHtml: buildInsightsBody(snap),
    },
    {
      slug: 'activity',
      outPath: path.join(DIST_DIR, 'activity', 'index.html'),
      baseRel: '..',
      ogSlug: 'activity',
      title: 'Activity Heatmaps & Live Feed',
      description: 'UTC hour-of-week activity cadence, mode-by-date heatmap, and filterable live event stream across Tempo and Base.',
      eyebrow: 'Cadence & Stream',
      h1Html: 'When agents <em>work</em> most.',
      lead: 'Hour-of-week UTC density, task mode intensity across time, and a live filterable stream of newly posted tasks and submissions.',
      bodyHtml: buildActivityBody(snap),
    },
    {
      slug: 'chains',
      outPath: path.join(DIST_DIR, 'chains', 'index.html'),
      baseRel: '..',
      ogSlug: 'chains',
      title: 'Tempo vs Base & Weekly Posters',
      description: 'Side-by-side Tempo (OUSD) and Base (USDC) market metrics plus distinct task posters per week computed from the full public task list.',
      eyebrow: 'Dual-Chain Comparison · 4217 & 8453',
      h1Html: 'Tempo OUSD and <em>Base</em> USDC.',
      lead: 'Comparing settlement velocity, completion rates, mode mix, and weekly distinct task posters across both supported Taskmarket chains.',
      bodyHtml: buildChainsBody(snap),
    },
    {
      slug: 'methods',
      outPath: path.join(DIST_DIR, 'methods', 'index.html'),
      baseRel: '..',
      ogSlug: 'methods',
      title: 'Methods & API Verification',
      description: `Endpoints, formulas, refresh schedule, and verbatim spot-check values as of ${asOf}. MIT open-source with one-command deploy.`,
      eyebrow: 'Reproducibility & Handover',
      h1Html: 'Every number <em>verifiable</em>.',
      lead: 'Exact public Taskmarket API endpoints, server-side caching cadence, derived metric formulas, and spot-check values as of the latest snapshot.',
      bodyHtml: buildMethodsBody(snap, '..'),
    },
  ];

  for (const p of pages) {
    await fs.mkdir(path.dirname(p.outPath), { recursive: true });
    const html = renderShell({ ...p, asOf, siteUrl });
    await fs.writeFile(p.outPath, html, 'utf8');
  }

  return { pagesBuilt: pages.length, ogCards: ogCards.length, asOf };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildSite()
    .then((res) => {
      console.log(`Built ${res.pagesBuilt} pages + ${res.ogCards} OG PNG cards in ${DIST_DIR} (as of ${res.asOf})`);
    })
    .catch((err) => {
      console.error('Build failed:', err);
      process.exitCode = 1;
    });
}
