/**
 * Page controller for Taskmarket Live Visualizer (7 dedicated views).
 * Loads server-fetched same-origin snapshot.json and hydrates interactive charts,
 * URL-synced filters, and accessible tables.
 */

import {
  escapeHtml,
  fmtHours,
  fmtInt,
  fmtPct,
  fmtSec,
  fmtUsd,
  fmtUtc,
  getParam,
  initNavbar,
  initShareBar,
  loadSnapshot,
  setParams,
  wireTablist,
} from './core.js';

import {
  renderBreakdownBars,
  renderCapitalFlowSankey,
  renderConcentrationLorenz,
  renderDecisionLatencyPlot,
  renderHourOfWeekHeatmap,
  renderLiveFeed,
  renderModeHeatmap,
  renderMortalityMatrix,
  renderSwarmConvergence,
  renderTimeSeriesCharts,
  renderWeeklyPostersChart,
} from './charts.js';

function hydrateHeroMosaic() {
  const readout = document.getElementById('hero-mosaic-readout');
  const tiles = document.querySelectorAll('.mosaic-tile');
  if (!readout || !tiles.length) return;
  const defaultMsg = readout.textContent;
  for (const tile of tiles) {
    const msg = tile.dataset.detail || defaultMsg;
    tile.addEventListener('pointerenter', () => {
      readout.textContent = msg;
    });
    tile.addEventListener('focus', () => {
      readout.textContent = msg;
    });
    tile.addEventListener('click', () => {
      readout.textContent = msg;
    });
  }
}

function hydrateOverview(snap) {
  hydrateHeroMosaic();
  let range = getParam('range', '30d');
  if (!['7d', '30d', '90d', 'all'].includes(range)) range = '30d';
  let bucket = getParam('bucket', 'day');
  if (!['day', 'week'].includes(bucket)) bucket = 'day';
  let breakdownScope = getParam('scope', 'platform');
  if (!['platform', 'tempo', 'base'].includes(breakdownScope)) breakdownScope = 'platform';

  const agentsEl = document.getElementById('ts-agents-chart');
  const volEl = document.getElementById('ts-volume-chart');
  const readoutEl = document.getElementById('ts-readout');

  const drawTs = () => {
    const rows = snap.timeSeries?.[bucket]?.[range] || [];
    renderTimeSeriesCharts({ rows, agentsContainer: agentsEl, volumeContainer: volEl, readoutEl, bucket });
  };

  const rangeCtrl = wireTablist(document.getElementById('ts-range-tabs'), (val) => {
    range = val;
    setParams({ range, bucket });
    drawTs();
  });
  const bucketCtrl = wireTablist(document.getElementById('ts-bucket-tabs'), (val) => {
    bucket = val;
    setParams({ range, bucket });
    drawTs();
  });
  rangeCtrl?.setValue(range);
  bucketCtrl?.setValue(bucket);
  drawTs();

  const statusBars = document.getElementById('breakdown-status-bars');
  const modeBars = document.getElementById('breakdown-mode-bars');
  const scopeNote = document.getElementById('breakdown-scope-note');

  const drawBreakdowns = () => {
    if (breakdownScope === 'platform') {
      renderBreakdownBars(statusBars, snap.breakdowns.platform.status, 'status', 'completed');
      renderBreakdownBars(modeBars, snap.breakdowns.platform.mode, 'mode', 'bounty');
      if (scopeNote) {
        scopeNote.textContent = `Source: /api/stats/breakdowns (${fmtInt(snap.headline.platform.totalTasksBreakdown)} platform tasks across both chains).`;
      }
    } else {
      const cData = snap.breakdowns.byChain[breakdownScope];
      renderBreakdownBars(statusBars, cData.status, 'status', 'completed');
      renderBreakdownBars(modeBars, cData.mode, 'mode', 'bounty');
      if (scopeNote) {
        scopeNote.textContent = `Source: paginated /api/tasks?chainId=${breakdownScope === 'tempo' ? '4217' : '8453'} (${fmtInt(cData.total)} public ${breakdownScope === 'tempo' ? 'Tempo' : 'Base'} tasks).`;
      }
    }
  };

  const scopeCtrl = wireTablist(document.getElementById('breakdown-scope-tabs'), (val) => {
    breakdownScope = val;
    setParams({ scope: val });
    drawBreakdowns();
  });
  scopeCtrl?.setValue(breakdownScope);
  drawBreakdowns();

  // Mini weekly posters chart on Overview as well (required minimum view right from home!)
  renderWeeklyPostersChart({
    weeks: snap.weeklyPostersAndChains,
    container: document.getElementById('overview-posters-chart'),
    readoutEl: document.getElementById('overview-posters-readout'),
    metric: 'posters',
  });

  // Mini heatmap + live feed preview on Overview so every minimum view is visible immediately on / AND deeper on sub-views
  renderHourOfWeekHeatmap({
    heatmap: snap.heatmaps.hourOfWeek['30d'],
    container: document.getElementById('overview-heatmap-chart'),
    readoutEl: document.getElementById('overview-heatmap-readout'),
  });
  renderLiveFeed({
    items: snap.activityFeed.recent.slice(0, 12),
    container: document.getElementById('overview-feed-list'),
    chainFilter: 'all',
    typeFilter: 'all',
  });
}

function hydrateFlow(snap) {
  let chain = getParam('chain', 'all');
  if (!['all', 'tempo', 'base'].includes(chain)) chain = 'all';

  const chartEl = document.getElementById('flow-sankey-chart');
  const readoutEl = document.getElementById('flow-readout');
  const tbodyEl = document.getElementById('flow-table-body');
  const summaryEl = document.getElementById('flow-insight-text');
  const dollarEl = document.getElementById('flow-dollar-strip');

  const draw = () => {
    const flow = snap.capitalFlow[chain] || snap.capitalFlow.all;
    renderCapitalFlowSankey({ flow, container: chartEl, readoutEl, tableBodyEl: tbodyEl });
    const multiPct = flow.totalUsd > 0 ? (flow.multiWinnerUsd / flow.totalUsd) * 100 : 0;
    const singlePct = Math.max(0, 100 - multiPct);
    if (summaryEl) {
      summaryEl.innerHTML = `In <strong>${escapeHtml(flow.scope)}</strong>, <strong>${fmtUsd(flow.totalUsd)}</strong> settled across <strong>${fmtInt(flow.completedTasks)}</strong> completed public tasks from <strong>${fmtInt(flow.uniquePosters)}</strong> distinct requester wallets. Single-award payouts reached <strong>${fmtInt(flow.uniqueSingleWinners)}</strong> unique winner wallets, while multi-winner split bounties accounted for <strong>${fmtUsd(flow.multiWinnerUsd)}</strong> (${fmtPct(multiPct, 1)}).`;
    }
    if (dollarEl) {
      const tempoUsd = flow.nodes
        .filter((n) => n.col === 1 && n.id.includes('tempo'))
        .reduce((s, n) => s + n.usd, 0);
      const baseUsd = flow.nodes
        .filter((n) => n.col === 1 && n.id.includes('base'))
        .reduce((s, n) => s + n.usd, 0);
      const tempoCents = Math.round((tempoUsd / Math.max(1, flow.totalUsd)) * 100);
      const baseCents = Math.max(0, 100 - tempoCents);
      const multiCents = Math.round(multiPct);
      const singleCents = Math.max(0, 100 - multiCents);
      dollarEl.innerHTML = `
        <div class="dollar-strip-head">
          <span>ANATOMY OF EVERY <strong>$1.00</strong> SETTLED (${escapeHtml(flow.scope.toUpperCase())})</span>
          <span>100% REPRODUCED FROM /API/TASKS</span>
        </div>
        <div class="dollar-bar" aria-hidden="true">
          ${tempoCents > 0 ? `<div class="dollar-seg" style="inline-size:${tempoCents}%;background:var(--magenta)"></div>` : ''}
          ${baseCents > 0 ? `<div class="dollar-seg" style="inline-size:${baseCents}%;background:var(--salmon)"></div>` : ''}
        </div>
        <div class="dollar-stats">
          <span>Chain split: <strong style="color:var(--magenta)">${tempoCents}c Tempo OUSD</strong> · <strong style="color:var(--salmon)">${baseCents}c Base USDC</strong></span>
          <span>Payout shape: <strong style="color:var(--cream)">${singleCents}c single-winner</strong> · <strong style="color:var(--paper)">${multiCents}c multi-winner pools</strong></span>
        </div>`;
    }
  };

  const ctrl = wireTablist(document.getElementById('flow-chain-tabs'), (val) => {
    chain = val;
    setParams({ chain });
    draw();
  });
  ctrl?.setValue(chain);
  draw();
}

function hydrateSwarm(snap) {
  const tasks = snap.swarmConvergence?.tasks || [];
  if (!tasks.length) return;

  const listEl = document.getElementById('swarm-task-list');
  const radarEl = document.getElementById('swarm-radar-chart');
  const curveEl = document.getElementById('swarm-curve-chart');
  const readoutEl = document.getElementById('swarm-readout');
  const tbodyEl = document.getElementById('swarm-table-body');
  const headerEl = document.getElementById('swarm-selected-meta');

  let selectedCode = getParam('task', tasks[0].referenceCode);
  let activeTask = tasks.find((t) => t.referenceCode === selectedCode) || tasks[0];

  const renderList = () => {
    listEl.innerHTML = tasks
      .map(
        (t) => `
        <li>
          <button type="button" class="swarm-item-btn" data-code="${escapeHtml(t.referenceCode)}" aria-pressed="${t.referenceCode === activeTask.referenceCode ? 'true' : 'false'}">
            <div class="swarm-item-meta">
              <span><span class="pill ${t.chainId === 4217 ? 'pill-tempo' : 'pill-base'}">${escapeHtml(t.chain)}</span> ${escapeHtml(t.referenceCode)}</span>
              <span>${fmtUsd(t.rewardUsd)} · ${fmtInt(t.submissionCount)} subs</span>
            </div>
            <div class="swarm-item-title">${escapeHtml(t.title)}</div>
            <div class="swarm-item-meta">
              <span>1st: +${fmtSec(t.firstArrivalSec)}</span>
              <span>5th: ${t.fifthArrivalSec !== null ? `+${fmtSec(t.fifthArrivalSec)}` : 'n/a'}</span>
              <span>TAP: ${fmtPct(t.tapVerifiedSharePct, 0)}</span>
            </div>
          </button>
        </li>`
      )
      .join('');

    for (const btn of listEl.querySelectorAll('.swarm-item-btn')) {
      btn.addEventListener('click', () => {
        const code = btn.dataset.code;
        const found = tasks.find((x) => x.referenceCode === code);
        if (!found) return;
        activeTask = found;
        setParams({ task: code });
        renderList();
        renderSelected();
      });
    }
  };

  const renderSelected = () => {
    if (headerEl) {
      headerEl.innerHTML = `
        <strong>${escapeHtml(activeTask.referenceCode)}</strong> · ${escapeHtml(activeTask.title)}
        <span class="pill ${activeTask.chainId === 4217 ? 'pill-tempo' : 'pill-base'}" style="margin-inline-start:0.4rem;">${escapeHtml(activeTask.chain)}</span>
        <span class="pill" style="margin-inline-start:0.25rem;">${fmtUsd(activeTask.rewardUsd)} ${escapeHtml(activeTask.symbol)}</span>
        <span class="pill pill-magenta" style="margin-inline-start:0.25rem;">1st in +${fmtSec(activeTask.firstArrivalSec)}</span>`;
    }
    renderSwarmConvergence({
      task: activeTask,
      radarContainer: radarEl,
      curveContainer: curveEl,
      readoutEl,
      replayBtn: document.getElementById('swarm-replay-btn'),
      tableBodyEl: tbodyEl,
    });
  };

  renderList();
  renderSelected();
}

function hydrateInsights(snap) {
  const diag = snap.diagnostics;

  // 1. Concentration Lorenz + Top-10 Poster Table (switchable Tempo / Base / Combined)
  renderConcentrationLorenz({
    tempoConc: diag.concentration.tempo,
    baseConc: diag.concentration.base,
    container: document.getElementById('lorenz-chart'),
  });

  let concScope = getParam('conc', 'tempo');
  if (!['tempo', 'base', 'combined'].includes(concScope)) concScope = 'tempo';
  const concTbody = document.getElementById('conc-table-body');
  const concMetrics = document.getElementById('conc-metrics-line');

  const drawConcTable = () => {
    const c = diag.concentration[concScope];
    if (concMetrics) {
      concMetrics.innerHTML = `Unique posters: <strong>${fmtInt(c.uniquePosters)}</strong> · Top-1 share: <strong>${fmtPct(c.top1TaskSharePct, 1)}</strong> · Top-5 share: <strong style="color:var(--magenta)">${fmtPct(c.top5TaskSharePct, 1)}</strong> · HHI: <strong>${fmtInt(c.hhiTasks)}</strong> · Gini: <strong>${c.giniTasks.toFixed(3)}</strong>`;
    }
    if (concTbody) {
      concTbody.innerHTML = c.topPosters
        .map(
          (p, i) => `
          <tr>
            <th scope="row">#${i + 1} ${escapeHtml(p.shortAddress)}</th>
            <td class="num" data-label="Tasks">${fmtInt(p.tasks)}</td>
            <td class="num" data-label="Share">${fmtPct(p.taskSharePct, 1)}</td>
            <td class="num" data-label="Escrow Posted">${fmtUsd(p.rewardUsd)}</td>
            <td class="num" data-label="Completion">${fmtPct(p.completionRatePct, 1)}</td>
            <td class="num" data-label="Expired+Cancel">${fmtPct(p.deathRatePct, 1)}</td>
            <td data-label="Chain">${escapeHtml(p.chains)}</td>
          </tr>`
        )
        .join('');
    }
  };
  const concCtrl = wireTablist(document.getElementById('conc-scope-tabs'), (val) => {
    concScope = val;
    setParams({ conc: val });
    drawConcTable();
  });
  concCtrl?.setValue(concScope);
  drawConcTable();

  // 2. Time to Decision Distribution
  renderDecisionLatencyPlot({
    decision: diag.timeToDecision,
    container: document.getElementById('latency-chart'),
    readoutEl: document.getElementById('latency-readout'),
  });

  // 3. Task Mortality & Ghost-Open Anatomy (toggle count vs USD)
  let mortMode = getParam('mort', 'tasks');
  if (!['tasks', 'usd'].includes(mortMode)) mortMode = 'tasks';
  const mortContainer = document.getElementById('mortality-bars');
  const drawMort = () => {
    renderMortalityMatrix({ mortality: diag.mortality, container: mortContainer, mode: mortMode });
  };
  const mortCtrl = wireTablist(document.getElementById('mortality-mode-tabs'), (val) => {
    mortMode = val;
    setParams({ mort: val });
    drawMort();
  });
  mortCtrl?.setValue(mortMode);
  drawMort();

  // Populate mortality by reward tier table
  const tierBody = document.getElementById('mortality-tier-body');
  if (tierBody) {
    tierBody.innerHTML = diag.mortality.combined.byRewardTier
      .map(
        (b) => `
        <tr>
          <th scope="row">${escapeHtml(b.label)}</th>
          <td class="num" data-label="Tasks">${fmtInt(b.total)}</td>
          <td class="num" data-label="Completed">${fmtInt(b.completed)} (${fmtPct(b.completionRatePct, 1)})</td>
          <td class="num" data-label="Ghost-Open">${fmtInt(b.ghostOpen)}</td>
          <td class="num" data-label="Expired+Cancel">${fmtInt(b.expired + b.cancelled)} (${fmtPct(b.formalDeathRatePct, 1)})</td>
          <td class="num" data-label="Escrow Posted">${fmtUsd(b.rewardPostedUsd)}</td>
        </tr>`
      )
      .join('');
  }
}

function hydrateActivity(snap) {
  let hmRange = getParam('range', '30d');
  if (!['7d', '30d', '90d', 'all'].includes(hmRange)) hmRange = '30d';

  const drawHeatmaps = () => {
    renderHourOfWeekHeatmap({
      heatmap: snap.heatmaps.hourOfWeek[hmRange],
      container: document.getElementById('hm-hour-chart'),
      readoutEl: document.getElementById('hm-hour-readout'),
    });
    renderModeHeatmap({
      heatmap: snap.heatmaps.mode[hmRange],
      container: document.getElementById('hm-mode-chart'),
      readoutEl: document.getElementById('hm-mode-readout'),
    });
  };

  const hmCtrl = wireTablist(document.getElementById('hm-range-tabs'), (val) => {
    hmRange = val;
    setParams({ range: val });
    drawHeatmaps();
  });
  hmCtrl?.setValue(hmRange);
  drawHeatmaps();

  let feedChain = getParam('chain', 'all');
  let feedType = getParam('type', 'all');
  const feedEl = document.getElementById('live-feed-list');
  const drawFeed = () => {
    renderLiveFeed({ items: snap.activityFeed.recent, container: feedEl, chainFilter: feedChain, typeFilter: feedType });
  };
  const chainCtrl = wireTablist(document.getElementById('feed-chain-tabs'), (val) => {
    feedChain = val;
    setParams({ chain: val });
    drawFeed();
  });
  const typeCtrl = wireTablist(document.getElementById('feed-type-tabs'), (val) => {
    feedType = val;
    setParams({ type: val });
    drawFeed();
  });
  chainCtrl?.setValue(feedChain);
  typeCtrl?.setValue(feedType);
  drawFeed();
}

function hydrateChains(snap) {
  let metric = getParam('metric', 'posters');
  if (!['posters', 'tasks'].includes(metric)) metric = 'posters';

  const drawWeekly = () => {
    renderWeeklyPostersChart({
      weeks: snap.weeklyPostersAndChains,
      container: document.getElementById('chains-weekly-chart'),
      readoutEl: document.getElementById('chains-weekly-readout'),
      metric,
    });
  };

  const ctrl = wireTablist(document.getElementById('chains-metric-tabs'), (val) => {
    metric = val;
    setParams({ metric: val });
    drawWeekly();
  });
  ctrl?.setValue(metric);
  drawWeekly();

  renderBreakdownBars(document.getElementById('tempo-mode-bars'), snap.breakdowns.byChain.tempo.mode, 'mode', 'bounty');
  renderBreakdownBars(document.getElementById('base-mode-bars'), snap.breakdowns.byChain.base.mode, 'mode', 'bounty');

  const tbody = document.getElementById('weekly-posters-table-body');
  if (tbody) {
    tbody.innerHTML = [...snap.weeklyPostersAndChains]
      .reverse()
      .slice(0, 16)
      .map(
        (w) => `
        <tr>
          <th scope="row">${escapeHtml(w.week)}</th>
          <td class="num" data-label="Combined Posters">${fmtInt(w.combinedDistinctPosters)}</td>
          <td class="num" data-label="Tempo Posters">${fmtInt(w.tempoDistinctPosters)}</td>
          <td class="num" data-label="Base Posters">${fmtInt(w.baseDistinctPosters)}</td>
          <td class="num" data-label="Tempo Tasks">${fmtInt(w.tempoTasks)}</td>
          <td class="num" data-label="Base Tasks">${fmtInt(w.baseTasks)}</td>
          <td class="num" data-label="Tempo Escrow">${fmtUsd(w.tempoRewardUsd)}</td>
          <td class="num" data-label="Base Escrow">${fmtUsd(w.baseRewardUsd)}</td>
        </tr>`
      )
      .join('');
  }
}

async function boot() {
  initNavbar();
  initShareBar();

  const page = document.body.dataset.page || 'overview';
  if (page === 'methods') return; // Methods page is 100% pre-rendered static HTML

  try {
    const snap = await loadSnapshot();
    const asOfEl = document.getElementById('header-asof');
    if (asOfEl) {
      asOfEl.innerHTML = `<span class="asof-dot" aria-hidden="true"></span>Data as of ${escapeHtml(fmtUtc(snap.meta.fetchedAt))}`;
    }

    if (page === 'overview') hydrateOverview(snap);
    else if (page === 'flow') hydrateFlow(snap);
    else if (page === 'swarm') hydrateSwarm(snap);
    else if (page === 'insights') hydrateInsights(snap);
    else if (page === 'activity') hydrateActivity(snap);
    else if (page === 'chains') hydrateChains(snap);
  } catch (err) {
    console.error('Failed to hydrate live snapshot:', err);
  }
}

boot();
