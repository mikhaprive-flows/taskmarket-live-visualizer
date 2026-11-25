/**
 * Bespoke interactive SVG visual instruments for Taskmarket Live Visualizer.
 * Zero heavy charting libraries; 100% Taskmarket Brand Kit tokens; keyboard
 * and touch accessible with dedicated readout strips.
 */

import { escapeHtml, fmtHours, fmtInt, fmtPct, fmtSec, fmtUsd, fmtUtcTime } from './core.js';

const PALETTE = {
  ground: '#12100E',
  panel: '#221E1A',
  line: '#453E37',
  lineSoft: '#312B25',
  cream: '#EFE9E2',
  paper: '#FFF6E8',
  muted: '#B0A79D',
  magenta: '#E74079',
  salmon: '#D9A097',
  maroon: '#3A1420',
};

function heatColor(ratio) {
  if (ratio <= 0) return '#1B1714';
  if (ratio < 0.12) return '#2D171E';
  if (ratio < 0.28) return '#4D1C2E';
  if (ratio < 0.5) return '#7B2544';
  if (ratio < 0.76) return '#B83362';
  if (ratio < 0.94) return '#E74079';
  return '#FFF6E8';
}

/* ==========================================================================
   1. Dual-Track Platform Time Series (Agents & Tasks + Rewards Posted vs Paid)
   ========================================================================== */
export function renderTimeSeriesCharts({ rows, agentsContainer, volumeContainer, readoutEl, bucket }) {
  if (!rows || !rows.length) return;
  const W = 880;
  const H = 260;
  const pad = { top: 20, right: 56, bottom: 34, left: 56 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const maxAgents = Math.max(1, ...rows.map((r) => r.activeAgents));
  const maxTasks = Math.max(1, ...rows.map((r) => r.tasksCreated));
  const maxUsd = Math.max(1, ...rows.map((r) => Math.max(r.rewardUsd, r.paidUsd)));
  const stepX = rows.length > 1 ? plotW / (rows.length - 1) : plotW;
  const barW = Math.max(3, Math.min(20, (plotW / Math.max(1, rows.length)) * 0.54));

  const xAt = (i) => (rows.length === 1 ? pad.left + plotW / 2 : pad.left + i * stepX);
  const yAgents = (v) => pad.top + plotH - (v / maxAgents) * plotH;
  const yTasks = (v) => pad.top + plotH - (v / maxTasks) * plotH;
  const yUsd = (v) => pad.top + plotH - (v / maxUsd) * plotH;

  const gridLines = (maxVal, fmtFn) =>
    [0, 0.25, 0.5, 0.75, 1]
      .map((f) => {
        const y = pad.top + plotH * (1 - f);
        return `
          <line x1="${pad.left}" y1="${y.toFixed(1)}" x2="${W - pad.right}" y2="${y.toFixed(1)}" stroke="${PALETTE.lineSoft}" stroke-dasharray="${f === 0 ? 'none' : '3 4'}" />
          <text x="${pad.left - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end" fill="${PALETTE.muted}" font-family="Departure Mono, monospace" font-size="10.5">${escapeHtml(fmtFn(maxVal * f))}</text>`;
      })
      .join('');

  const xTicks = () => {
    const stride = Math.max(1, Math.ceil(rows.length / 7));
    return rows
      .map((r, i) => {
        if (i !== 0 && i !== rows.length - 1 && i % stride !== 0) return '';
        const x = xAt(i);
        return `<text x="${x.toFixed(1)}" y="${H - 10}" text-anchor="middle" fill="${PALETTE.muted}" font-family="Departure Mono, monospace" font-size="10.5">${escapeHtml(r.bucket.slice(5))}</text>`;
      })
      .join('');
  };

  // Chart 1: Active Agents (line + area) + Tasks Created (bars)
  const agentPath = rows
    .map((r, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${yAgents(r.activeAgents).toFixed(1)}`)
    .join(' ');
  const agentArea = `${agentPath} L${xAt(rows.length - 1).toFixed(1)},${(pad.top + plotH).toFixed(1)} L${xAt(0).toFixed(1)},${(pad.top + plotH).toFixed(1)} Z`;

  const taskBars = rows
    .map((r, i) => {
      const h = (r.tasksCreated / maxTasks) * plotH;
      const x = xAt(i) - barW / 2;
      const y = pad.top + plotH - h;
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(0, h).toFixed(1)}" rx="2" fill="${PALETTE.salmon}" fill-opacity="0.34" />`;
    })
    .join('');

  const rightAxisTasks = [0, 0.5, 1]
    .map((f) => {
      const y = pad.top + plotH * (1 - f);
      return `<text x="${W - pad.right + 8}" y="${(y + 4).toFixed(1)}" text-anchor="start" fill="${PALETTE.salmon}" font-family="Departure Mono, monospace" font-size="10">${fmtInt(maxTasks * f)}t</text>`;
    })
    .join('');

  const hitTargets = (chartKey) =>
    rows
      .map((r, i) => {
        const x = xAt(i);
        const w = Math.max(8, plotW / Math.max(1, rows.length));
        return `<rect class="ts-hit" data-idx="${i}" data-chart="${chartKey}" tabindex="0" role="button" aria-label="${escapeHtml(`${r.bucket}: ${fmtInt(r.activeAgents)} active agents, ${fmtInt(r.tasksCreated)} tasks posted, ${fmtUsd(r.rewardUsd)} put up, ${fmtUsd(r.paidUsd)} paid`)}" x="${(x - w / 2).toFixed(1)}" y="${pad.top}" width="${w.toFixed(1)}" height="${plotH}" fill="transparent" />`;
      })
      .join('');

  agentsContainer.innerHTML = `
    <svg role="img" viewBox="0 0 ${W} ${H}" aria-label="Active agents and tasks posted over time">
      <title>Active agents and tasks posted (${escapeHtml(bucket)} buckets)</title>
      <defs>
        <linearGradient id="agAreaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${PALETTE.magenta}" stop-opacity="0.34" />
          <stop offset="100%" stop-color="${PALETTE.magenta}" stop-opacity="0.01" />
        </linearGradient>
      </defs>
      ${gridLines(maxAgents, (v) => fmtInt(v))}
      ${rightAxisTasks}
      ${taskBars}
      <path d="${agentArea}" fill="url(#agAreaGrad)" />
      <path d="${agentPath}" fill="none" stroke="${PALETTE.magenta}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />
      <line class="ts-cursor" data-cursor="agents" x1="-10" y1="${pad.top}" x2="-10" y2="${pad.top + plotH}" stroke="${PALETTE.paper}" stroke-opacity="0.55" stroke-dasharray="3 3" />
      <circle class="ts-dot" data-dot="agents" cx="-10" cy="-10" r="4.5" fill="${PALETTE.magenta}" stroke="${PALETTE.paper}" stroke-width="2" />
      ${xTicks()}
      ${hitTargets('agents')}
    </svg>`;

  // Chart 2: Rewards Put Up vs Rewards Paid Out
  const halfBar = Math.max(2, Math.min(11, (plotW / Math.max(1, rows.length)) * 0.34));
  const usdBars = rows
    .map((r, i) => {
      const cx = xAt(i);
      const hPost = (r.rewardUsd / maxUsd) * plotH;
      const hPaid = (r.paidUsd / maxUsd) * plotH;
      return `
        <rect x="${(cx - halfBar - 0.5).toFixed(1)}" y="${(pad.top + plotH - hPost).toFixed(1)}" width="${halfBar.toFixed(1)}" height="${Math.max(0, hPost).toFixed(1)}" rx="1.5" fill="${PALETTE.salmon}" fill-opacity="0.72" />
        <rect x="${(cx + 0.5).toFixed(1)}" y="${(pad.top + plotH - hPaid).toFixed(1)}" width="${halfBar.toFixed(1)}" height="${Math.max(0, hPaid).toFixed(1)}" rx="1.5" fill="${PALETTE.magenta}" />`;
    })
    .join('');

  volumeContainer.innerHTML = `
    <svg role="img" viewBox="0 0 ${W} ${H}" aria-label="Rewards put up versus rewards paid over time">
      <title>Rewards put up and rewards paid out (${escapeHtml(bucket)} buckets)</title>
      ${gridLines(maxUsd, (v) => `$${Math.round(v)}`)}
      ${usdBars}
      <line class="ts-cursor" data-cursor="volume" x1="-10" y1="${pad.top}" x2="-10" y2="${pad.top + plotH}" stroke="${PALETTE.paper}" stroke-opacity="0.55" stroke-dasharray="3 3" />
      ${xTicks()}
      ${hitTargets('volume')}
    </svg>`;

  const updateSelection = (idx) => {
    const r = rows[idx];
    if (!r) return;
    const x = xAt(idx);
    const agCursor = agentsContainer.querySelector('[data-cursor="agents"]');
    const agDot = agentsContainer.querySelector('[data-dot="agents"]');
    const volCursor = volumeContainer.querySelector('[data-cursor="volume"]');
    if (agCursor) {
      agCursor.setAttribute('x1', x.toFixed(1));
      agCursor.setAttribute('x2', x.toFixed(1));
    }
    if (agDot) {
      agDot.setAttribute('cx', x.toFixed(1));
      agDot.setAttribute('cy', yAgents(r.activeAgents).toFixed(1));
    }
    if (volCursor) {
      volCursor.setAttribute('x1', x.toFixed(1));
      volCursor.setAttribute('x2', x.toFixed(1));
    }
    if (readoutEl) {
      readoutEl.innerHTML = `
        <span><strong>${escapeHtml(r.bucket)}</strong> (${escapeHtml(bucket)})</span>
        <span>Active agents: <strong>${fmtInt(r.activeAgents)}</strong></span>
        <span>Tasks posted: <strong>${fmtInt(r.tasksCreated)}</strong></span>
        <span>Posted: <strong>${fmtUsd(r.rewardUsd)}</strong></span>
        <span>Paid: <strong style="color:var(--magenta)">${fmtUsd(r.paidUsd)}</strong> (${fmtInt(r.settlements)} payouts)</span>`;
    }
  };

  for (const el of [...agentsContainer.querySelectorAll('.ts-hit'), ...volumeContainer.querySelectorAll('.ts-hit')]) {
    const idx = Number(el.dataset.idx);
    el.addEventListener('pointerenter', () => updateSelection(idx));
    el.addEventListener('focus', () => updateSelection(idx));
    el.addEventListener('click', () => updateSelection(idx));
  }

  // Default to latest complete bucket (second-to-last if last is today partial, else last)
  updateSelection(rows.length > 2 ? rows.length - 2 : rows.length - 1);
}

/* ==========================================================================
   2. Breakdown Bars (Status & Mode)
   ========================================================================== */
export function renderBreakdownBars(container, items, keyField, hotValue) {
  if (!container) return;
  const sorted = [...(items || [])].sort((a, b) => Number(b.count || 0) - Number(a.count || 0));
  const total = sorted.reduce((s, x) => s + Number(x.count || 0), 0) || 1;
  const maxVal = sorted[0]?.count || 1;

  container.innerHTML = sorted
    .map((item) => {
      const name = item[keyField] || 'unknown';
      const count = Number(item.count || 0);
      const pct = (count / total) * 100;
      const widthPct = Math.max(1.5, (count / maxVal) * 100);
      const cls = name === hotValue ? 'is-hot' : name === 'cancelled' || name === 'expired' ? 'is-muted' : '';
      return `
        <div class="bar-row">
          <span class="bar-name">${escapeHtml(name.replace(/_/g, ' '))}</span>
          <div class="bar-track" aria-hidden="true">
            <div class="bar-fill ${cls}" style="inline-size:${widthPct.toFixed(1)}%"></div>
          </div>
          <span class="bar-val">${fmtInt(count)} (${fmtPct(pct, 1)})</span>
        </div>`;
    })
    .join('');
}

/* ==========================================================================
   3. Signature View A: Capital Flow River (3-Column Alluvial / Sankey SVG)
   ========================================================================== */
export function renderCapitalFlowSankey({ flow, container, readoutEl, tableBodyEl }) {
  if (!flow || !container) return;
  const cols = [0, 1, 2].map((c) => flow.nodes.filter((n) => n.col === c));
  const maxNodes = Math.max(1, ...cols.map((c) => c.length));

  const W = 1040;
  const padTop = 44;
  const padBottom = 30;
  const gapY = 12;
  // Ensure generous vertical space so every stacked 2-line label has >= 32px pitch
  const H = Math.max(590, padTop + padBottom + maxNodes * 38);
  const colX = [196, 520, 844];
  const nodeW = 14;
  const availH = H - padTop - padBottom;

  const totalUsd = Math.max(1, flow.totalUsd);
  const pos = new Map();

  for (let c = 0; c < 3; c += 1) {
    const list = cols[c];
    const totalGaps = Math.max(0, list.length - 1) * gapY;
    const usableH = Math.max(160, availH - totalGaps);
    const minNodeH = c === 1 ? 18 : 24;
    const rawHeights = list.map((n) => Math.max(minNodeH, (n.usd / totalUsd) * usableH));
    const sumRaw = rawHeights.reduce((a, b) => a + b, 0);
    const scale = usableH / sumRaw;
    let y = padTop;
    list.forEach((n, idx) => {
      const h = rawHeights[idx] * scale;
      pos.set(n.id, { ...n, x: colX[c] - nodeW / 2, y, h, outCursor: y, inCursor: y });
      y += h + gapY;
    });
  }

  // Deterministic label de-collision per column so stacked labels can never touch
  const labelPos = new Map();
  for (let c = 0; c < 3; c += 1) {
    const list = cols[c].map((n) => pos.get(n.id)).filter(Boolean);
    const minPitch = c === 1 ? 26 : 31;
    const minY = padTop + 12;
    const maxY = H - padBottom - 12;
    const centers = list.map((n) => Math.max(minY, Math.min(maxY, n.y + n.h / 2)));
    for (let i = 1; i < centers.length; i += 1) {
      if (centers[i] - centers[i - 1] < minPitch) {
        centers[i] = centers[i - 1] + minPitch;
      }
    }
    if (centers.length && centers[centers.length - 1] > maxY) {
      const overflow = centers[centers.length - 1] - maxY;
      centers[centers.length - 1] = maxY;
      for (let i = centers.length - 2; i >= 0; i -= 1) {
        centers[i] = Math.max(minY, Math.min(centers[i] - overflow * 0.5, centers[i + 1] - minPitch));
      }
    }
    list.forEach((n, i) => labelPos.set(n.id, centers[i]));
  }

  // Sort links consistently by target y then source y to reduce ribbon crossings
  const sortedLinks = [...flow.links].sort((a, b) => {
    const sa = pos.get(a.source);
    const sb = pos.get(b.source);
    const ta = pos.get(a.target);
    const tb = pos.get(b.target);
    if (!sa || !sb || !ta || !tb) return 0;
    return sa.y - sb.y || ta.y - tb.y;
  });

  const ribbons = [];
  for (const link of sortedLinks) {
    const s = pos.get(link.source);
    const t = pos.get(link.target);
    if (!s || !t) continue;
    const sh = (link.usd / Math.max(0.01, s.usd)) * s.h;
    const th = (link.usd / Math.max(0.01, t.usd)) * t.h;
    const sy0 = s.outCursor;
    const sy1 = sy0 + sh;
    s.outCursor = sy1;

    const ty0 = t.inCursor;
    const ty1 = ty0 + th;
    t.inCursor = ty1;

    const x0 = s.x + nodeW;
    const x1 = t.x;
    const mx = (x0 + x1) / 2;
    const isTempo = link.source.includes('tempo') || link.target.includes('tempo');
    const isMulti = link.target === 'w:multi';
    const gradId = isTempo
      ? isMulti
        ? 'url(#silkTempoMulti)'
        : 'url(#silkTempo)'
      : isMulti
        ? 'url(#silkBaseMulti)'
        : 'url(#silkBase)';

    const d = `M${x0.toFixed(1)},${sy0.toFixed(1)} C${mx.toFixed(1)},${sy0.toFixed(1)} ${mx.toFixed(1)},${ty0.toFixed(1)} ${x1.toFixed(1)},${ty0.toFixed(1)} L${x1.toFixed(1)},${ty1.toFixed(1)} C${mx.toFixed(1)},${ty1.toFixed(1)} ${mx.toFixed(1)},${sy1.toFixed(1)} ${x0.toFixed(1)},${sy1.toFixed(1)} Z`;

    ribbons.push({
      d,
      fill: gradId,
      source: link.source,
      target: link.target,
      sourceLabel: s.label,
      targetLabel: t.label,
      usd: link.usd,
      tasks: link.tasks,
    });
  }

  const nodeColor = (n) => {
    if (n.col === 1) return n.id.includes('tempo') ? PALETTE.magenta : PALETTE.salmon;
    if (n.id === 'w:multi') return PALETTE.paper;
    if (n.id.endsWith(':other')) return '#6E655D';
    return n.col === 0 ? PALETTE.cream : PALETTE.salmon;
  };

  const colTitles = [
    { x: colX[0], text: 'REQUESTER WALLETS (0x...)' },
    { x: colX[1], text: 'CHAIN & MODE CONDUITS' },
    { x: colX[2], text: 'WINNERS & SPLIT POOLS' },
  ];

  const svgNodes = [...pos.values()]
    .map((n) => {
      const cy = labelPos.get(n.id) ?? (n.y + n.h / 2);
      if (n.col === 1) {
        const badgeW = Math.min(210, Math.max(138, n.label.length * 7.2 + 18));
        const bx = n.x + nodeW / 2 - badgeW / 2;
        const by = cy - 10;
        return `
          <g class="flow-node" data-node="${escapeHtml(n.id)}" tabindex="0" role="button" aria-label="${escapeHtml(`${n.label}: ${fmtUsd(n.usd)} across ${fmtInt(n.tasks)} completed tasks`)}">
            <rect x="${n.x.toFixed(1)}" y="${n.y.toFixed(1)}" width="${nodeW}" height="${Math.max(4, n.h).toFixed(1)}" rx="3" fill="${nodeColor(n)}" />
            <rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${badgeW.toFixed(1)}" height="20" rx="4" fill="${PALETTE.ground}" fill-opacity="0.86" stroke="${PALETTE.line}" stroke-width="0.9" />
            <text x="${(n.x + nodeW / 2).toFixed(1)}" y="${(cy + 3.5).toFixed(1)}" text-anchor="middle" fill="${PALETTE.cream}" font-family="Departure Mono, monospace" font-size="10.5">${escapeHtml(n.label)}</text>
          </g>`;
      }
      const labelX = n.col === 0 ? n.x - 12 : n.x + nodeW + 12;
      const anchor = n.col === 0 ? 'end' : 'start';
      const labelY = cy - 2;
      const subY = cy + 11;
      return `
        <g class="flow-node" data-node="${escapeHtml(n.id)}" tabindex="0" role="button" aria-label="${escapeHtml(`${n.label}: ${fmtUsd(n.usd)} across ${fmtInt(n.tasks)} completed tasks`)}">
          <rect x="${n.x.toFixed(1)}" y="${n.y.toFixed(1)}" width="${nodeW}" height="${Math.max(4, n.h).toFixed(1)}" rx="3" fill="${nodeColor(n)}" />
          <text x="${labelX.toFixed(1)}" y="${labelY.toFixed(1)}" text-anchor="${anchor}" fill="${PALETTE.cream}" font-family="Departure Mono, monospace" font-size="11">${escapeHtml(n.label)}</text>
          <text x="${labelX.toFixed(1)}" y="${subY.toFixed(1)}" text-anchor="${anchor}" fill="${PALETTE.muted}" font-family="Departure Mono, monospace" font-size="10">${fmtUsd(n.usd)} · ${fmtInt(n.tasks)}t</text>
        </g>`;
    })
    .join('');

  const svgRibbons = ribbons
    .map(
      (r, idx) =>
        `<path class="flow-ribbon" data-idx="${idx}" data-source="${escapeHtml(r.source)}" data-target="${escapeHtml(r.target)}" d="${r.d}" fill="${r.fill}" fill-opacity="0.34" tabindex="0" role="button" aria-label="${escapeHtml(`${r.sourceLabel} to ${r.targetLabel}: ${fmtUsd(r.usd)} (${fmtInt(r.tasks)} tasks)`)}" />`
    )
    .join('');

  container.innerHTML = `
    <svg role="img" viewBox="0 0 ${W} ${H}" aria-label="Alluvial capital flow from task posters through chains and modes to winners">
      <title>Capital Flow River (${escapeHtml(flow.scope)})</title>
      <defs>
        <linearGradient id="silkTempo" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="${PALETTE.cream}" stop-opacity="0.78" />
          <stop offset="48%" stop-color="${PALETTE.magenta}" stop-opacity="0.95" />
          <stop offset="100%" stop-color="${PALETTE.salmon}" stop-opacity="0.88" />
        </linearGradient>
        <linearGradient id="silkTempoMulti" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="${PALETTE.magenta}" stop-opacity="0.9" />
          <stop offset="100%" stop-color="${PALETTE.paper}" stop-opacity="0.95" />
        </linearGradient>
        <linearGradient id="silkBase" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="${PALETTE.cream}" stop-opacity="0.72" />
          <stop offset="50%" stop-color="${PALETTE.salmon}" stop-opacity="0.92" />
          <stop offset="100%" stop-color="${PALETTE.salmon}" stop-opacity="0.78" />
        </linearGradient>
        <linearGradient id="silkBaseMulti" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="${PALETTE.salmon}" stop-opacity="0.88" />
          <stop offset="100%" stop-color="${PALETTE.paper}" stop-opacity="0.95" />
        </linearGradient>
      </defs>
      ${colTitles.map((t) => `<text x="${t.x}" y="18" text-anchor="middle" fill="${PALETTE.muted}" font-family="Departure Mono, monospace" font-size="11">${t.text}</text>`).join('')}
      <g class="flow-ribbons">${svgRibbons}</g>
      <g class="flow-nodes">${svgNodes}</g>
    </svg>`;

  const allRibbons = [...container.querySelectorAll('.flow-ribbon')];
  const allNodes = [...container.querySelectorAll('.flow-node')];

  const resetHighlight = () => {
    for (const r of allRibbons) r.setAttribute('fill-opacity', '0.34');
    if (readoutEl) {
      readoutEl.innerHTML = `
        <span><strong>${escapeHtml(flow.scope)}</strong></span>
        <span>Completed volume: <strong style="color:var(--magenta)">${fmtUsd(flow.totalUsd)}</strong></span>
        <span>Settled tasks: <strong>${fmtInt(flow.completedTasks)}</strong></span>
        <span class="readout-muted">Hover or focus any wallet, conduit, or ribbon to trace flow.</span>`;
    }
  };

  const highlightNode = (nodeId) => {
    const n = pos.get(nodeId);
    if (!n) return;
    for (const r of allRibbons) {
      const connected = r.dataset.source === nodeId || r.dataset.target === nodeId;
      r.setAttribute('fill-opacity', connected ? '0.82' : '0.07');
    }
    if (readoutEl) {
      const share = (n.usd / totalUsd) * 100;
      readoutEl.innerHTML = `
        <span>Selected: <strong>${escapeHtml(n.label)}</strong> (${escapeHtml(n.sublabel)})</span>
        <span>Volume: <strong style="color:var(--magenta)">${fmtUsd(n.usd)}</strong> (${fmtPct(share, 1)})</span>
        <span>Completed tasks: <strong>${fmtInt(n.tasks)}</strong></span>`;
    }
  };

  const highlightRibbon = (idx) => {
    const r = ribbons[idx];
    if (!r) return;
    allRibbons.forEach((el, i) => el.setAttribute('fill-opacity', i === idx ? '0.88' : '0.08'));
    if (readoutEl) {
      readoutEl.innerHTML = `
        <span>Corridor: <strong>${escapeHtml(r.sourceLabel)}</strong> -> <strong>${escapeHtml(r.targetLabel)}</strong></span>
        <span>Volume: <strong style="color:var(--magenta)">${fmtUsd(r.usd)}</strong></span>
        <span>Tasks: <strong>${fmtInt(r.tasks)}</strong></span>`;
    }
  };

  for (const el of allNodes) {
    const id = el.dataset.node;
    el.addEventListener('pointerenter', () => highlightNode(id));
    el.addEventListener('focus', () => highlightNode(id));
    el.addEventListener('click', () => highlightNode(id));
  }
  for (const el of allRibbons) {
    const idx = Number(el.dataset.idx);
    el.addEventListener('pointerenter', () => highlightRibbon(idx));
    el.addEventListener('focus', () => highlightRibbon(idx));
    el.addEventListener('click', () => highlightRibbon(idx));
  }
  container.addEventListener('pointerleave', resetHighlight);
  resetHighlight();

  // Populate accessible semantic table alternative
  if (tableBodyEl) {
    tableBodyEl.innerHTML = ribbons
      .slice(0, 18)
      .map(
        (r) => `
        <tr>
          <th scope="row">${escapeHtml(r.sourceLabel)}</th>
          <td data-label="Target">${escapeHtml(r.targetLabel)}</td>
          <td class="num" data-label="Volume">${fmtUsd(r.usd)}</td>
          <td class="num" data-label="Tasks">${fmtInt(r.tasks)}</td>
          <td class="num" data-label="Share">${fmtPct((r.usd / totalUsd) * 100, 1)}</td>
        </tr>`
      )
      .join('');
  }
}

/* ==========================================================================
   4. Signature View B: Swarm Convergence Constellation + Cumulative Curve
   ========================================================================== */
let activeSwarmReplayTimer = null;

export function renderSwarmConvergence({ task, radarContainer, curveContainer, readoutEl, replayBtn, tableBodyEl }) {
  if (!task || !radarContainer || !curveContainer) return;
  if (activeSwarmReplayTimer) {
    clearInterval(activeSwarmReplayTimer);
    activeSwarmReplayTimer = null;
  }

  const arrivals = task.arrivals || [];
  const W = 540;
  const H = 460;
  const cx = W / 2;
  const cy = H / 2;
  const maxR = 192;

  // Log-time rings: 1m, 5m, 30m, 3h, max
  const maxMin = Math.max(60, arrivals[arrivals.length - 1]?.dtMin || 60);
  const logMap = (dtMin) => {
    const t = Math.log10(1 + Math.max(0, dtMin)) / Math.log10(1 + maxMin);
    return 28 + t * (maxR - 28);
  };

  const ringMarks = [
    { min: 1, label: '1m' },
    { min: 5, label: '5m' },
    { min: 30, label: '30m' },
    { min: 180, label: '3h' },
    { min: Math.round(maxMin), label: fmtHours(maxMin / 60) },
  ].filter((rm, i, arr) => rm.min <= maxMin * 1.05 && (i === 0 || rm.min > arr[i - 1].min * 1.4));

  // Golden angle distribution + gentle silk-curve convergence filaments (inspired by Brand Kit convergence plate)
  const goldenAngle = 2.399963229728653;
  const points = arrivals.map((a, idx) => {
    const r = logMap(a.dtMin);
    const angle = -Math.PI / 2 + idx * goldenAngle;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    // Quadratic Bezier control point offset tangentially for organic silk filament curvature
    const midR = r * 0.54;
    const bend = (idx % 2 === 0 ? 1 : -1) * Math.min(28, r * 0.17);
    const ctrlX = cx + Math.cos(angle) * midR - Math.sin(angle) * bend;
    const ctrlY = cy + Math.sin(angle) * midR + Math.cos(angle) * bend;
    const tileSz = a.completedHistory >= 20 ? 10.4 : a.completedHistory >= 5 ? 8.2 : 6.4;
    return { ...a, idx, x, y, ctrlX, ctrlY, tileSz };
  });

  // Observatory outer degree hairlines (every 15 degrees)
  const compassTicks = Array.from({ length: 24 }, (_, i) => {
    const a = (i * Math.PI) / 12;
    const r0 = maxR + 5;
    const r1 = i % 6 === 0 ? maxR + 14 : maxR + 9;
    return `<line x1="${(cx + Math.cos(a) * r0).toFixed(1)}" y1="${(cy + Math.sin(a) * r0).toFixed(1)}" x2="${(cx + Math.cos(a) * r1).toFixed(1)}" y2="${(cy + Math.sin(a) * r1).toFixed(1)}" stroke="${PALETTE.line}" stroke-opacity="${i % 6 === 0 ? '0.8' : '0.35'}" stroke-width="${i % 6 === 0 ? '1.2' : '0.8'}" />`;
  }).join('');

  radarContainer.innerHTML = `
    <svg role="img" viewBox="0 0 ${W} ${H}" aria-label="Radial swarm convergence map showing agent arrivals over log time">
      <title>Swarm convergence filaments on ${escapeHtml(task.referenceCode)}</title>
      <defs>
        <radialGradient id="swarmCoreHalo" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="${PALETTE.paper}" stop-opacity="0.85" />
          <stop offset="28%" stop-color="${PALETTE.magenta}" stop-opacity="0.46" />
          <stop offset="68%" stop-color="${PALETTE.maroon}" stop-opacity="0.24" />
          <stop offset="100%" stop-color="${PALETTE.ground}" stop-opacity="0" />
        </radialGradient>
        <linearGradient id="ceramicCoreGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${PALETTE.paper}" />
          <stop offset="100%" stop-color="${PALETTE.salmon}" />
        </linearGradient>
      </defs>
      <circle cx="${cx}" cy="${cy}" r="118" fill="url(#swarmCoreHalo)" opacity="0.58" />
      ${compassTicks}
      ${ringMarks
        .map((rm) => {
          const r = logMap(rm.min);
          return `
            <circle cx="${cx}" cy="${cy}" r="${r.toFixed(1)}" fill="none" stroke="${PALETTE.line}" stroke-opacity="0.58" stroke-dasharray="2 5" />
            <text x="${cx + 6}" y="${(cy - r + 12).toFixed(1)}" fill="${PALETTE.muted}" font-family="Departure Mono, monospace" font-size="9.5">${escapeHtml(rm.label)}</text>`;
        })
        .join('')}
      <g class="swarm-spokes">
        ${points
          .map(
            (p) =>
              `<path class="swarm-spoke" data-idx="${p.idx}" d="M${cx},${cy} Q${p.ctrlX.toFixed(1)},${p.ctrlY.toFixed(1)} ${p.x.toFixed(1)},${p.y.toFixed(1)}" fill="none" stroke="${p.tapVerified ? PALETTE.magenta : PALETTE.salmon}" stroke-opacity="${p.tapVerified ? '0.36' : '0.24'}" stroke-width="${p.tapVerified ? '1.3' : '1'}" />`
          )
          .join('')}
      </g>
      <!-- Central luminous ceramic escrow tile (echoes Brand Kit plate-converge-landscape) -->
      <rect class="swarm-core-halo" x="${cx - 22}" y="${cy - 22}" width="44" height="44" rx="11" fill="${PALETTE.magenta}" opacity="0.24" />
      <rect x="${cx - 11}" y="${cy - 11}" width="22" height="22" rx="5.5" fill="url(#ceramicCoreGrad)" stroke="${PALETTE.magenta}" stroke-width="1.5" />
      <rect x="${cx - 4}" y="${cy - 4}" width="8" height="8" rx="2" fill="${PALETTE.magenta}" />
      <text x="${cx}" y="${H - 12}" text-anchor="middle" fill="${PALETTE.muted}" font-family="Departure Mono, monospace" font-size="10.5">${escapeHtml(task.referenceCode)} · ${fmtUsd(task.rewardUsd)} ${escapeHtml(task.symbol)} · ${fmtInt(arrivals.length)} arrivals</text>
      <g class="swarm-dots">
        ${points
          .map(
            (p) =>
              `<rect class="swarm-dot" data-idx="${p.idx}" tabindex="0" role="button" aria-label="${escapeHtml(`Arrival #${p.idx + 1}: ${p.workerShort} at +${fmtSec(p.dtSec)}, ${p.completedHistory} prior completed tasks`)}" x="${(p.x - p.tileSz / 2).toFixed(1)}" y="${(p.y - p.tileSz / 2).toFixed(1)}" width="${p.tileSz.toFixed(1)}" height="${p.tileSz.toFixed(1)}" rx="2.4" fill="${p.tapVerified ? PALETTE.paper : PALETTE.salmon}" stroke="${p.tapVerified ? PALETTE.magenta : PALETTE.ground}" stroke-width="${p.tapVerified ? '1.5' : '1'}" />`
          )
          .join('')}
      </g>
    </svg>`;

  // Cumulative arrival curve (log-time x-axis vs cumulative entries y-axis)
  const CW = 540;
  const CH = 240;
  const cPad = { top: 18, right: 20, bottom: 32, left: 44 };
  const cW = CW - cPad.left - cPad.right;
  const cH = CH - cPad.top - cPad.bottom;
  const maxY = Math.max(1, arrivals.length);
  const cxAt = (dtMin) => cPad.left + (Math.log10(1 + Math.max(0, dtMin)) / Math.log10(1 + maxMin)) * cW;
  const cyAt = (count) => cPad.top + cH - (count / maxY) * cH;

  const curvePts = arrivals.map((a, i) => `${i === 0 ? 'M' : 'L'}${cxAt(a.dtMin).toFixed(1)},${cyAt(i + 1).toFixed(1)}`).join(' ');
  const curveArea = `${curvePts} L${cxAt(arrivals[arrivals.length - 1].dtMin).toFixed(1)},${(cPad.top + cH).toFixed(1)} L${cxAt(arrivals[0].dtMin).toFixed(1)},${(cPad.top + cH).toFixed(1)} Z`;

  curveContainer.innerHTML = `
    <svg role="img" viewBox="0 0 ${CW} ${CH}" aria-label="Cumulative submission arrivals on log-time scale">
      <title>Cumulative arrivals curve for ${escapeHtml(task.referenceCode)}</title>
      <defs>
        <linearGradient id="swarmCurveGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${PALETTE.magenta}" stop-opacity="0.32" />
          <stop offset="100%" stop-color="${PALETTE.magenta}" stop-opacity="0" />
        </linearGradient>
      </defs>
      ${[0, 0.5, 1]
        .map((f) => {
          const y = cPad.top + cH * (1 - f);
          return `<line x1="${cPad.left}" y1="${y.toFixed(1)}" x2="${CW - cPad.right}" y2="${y.toFixed(1)}" stroke="${PALETTE.lineSoft}" stroke-dasharray="${f === 0 ? 'none' : '3 4'}" /><text x="${cPad.left - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end" fill="${PALETTE.muted}" font-family="Departure Mono, monospace" font-size="10">${Math.round(maxY * f)}</text>`;
        })
        .join('')}
      ${ringMarks
        .map((rm) => {
          const x = cxAt(rm.min);
          return `<line x1="${x.toFixed(1)}" y1="${cPad.top}" x2="${x.toFixed(1)}" y2="${cPad.top + cH}" stroke="${PALETTE.lineSoft}" stroke-dasharray="2 4" /><text x="${x.toFixed(1)}" y="${CH - 10}" text-anchor="middle" fill="${PALETTE.muted}" font-family="Departure Mono, monospace" font-size="10">+${escapeHtml(rm.label)}</text>`;
        })
        .join('')}
      <path d="${curveArea}" fill="url(#swarmCurveGrad)" />
      <path d="${curvePts}" fill="none" stroke="${PALETTE.magenta}" stroke-width="2.4" stroke-linejoin="round" />
      <circle class="swarm-curve-marker" cx="${cxAt(arrivals[0].dtMin).toFixed(1)}" cy="${cyAt(1).toFixed(1)}" r="4.5" fill="${PALETTE.paper}" stroke="${PALETTE.magenta}" stroke-width="2" />
    </svg>`;

  const dots = [...radarContainer.querySelectorAll('.swarm-dot')];
  const spokes = [...radarContainer.querySelectorAll('.swarm-spoke')];
  const curveMarker = curveContainer.querySelector('.swarm-curve-marker');

  const inspectPoint = (idx) => {
    const p = points[idx];
    if (!p) return;
    if (curveMarker) {
      curveMarker.setAttribute('cx', cxAt(p.dtMin).toFixed(1));
      curveMarker.setAttribute('cy', cyAt(idx + 1).toFixed(1));
    }
    if (readoutEl) {
      readoutEl.innerHTML = `
        <span>Arrival <strong>#${idx + 1}/${arrivals.length}</strong></span>
        <span>Agent: <strong>${escapeHtml(p.workerShort)}</strong></span>
        <span>Latency: <strong style="color:var(--magenta)">+${fmtSec(p.dtSec)}</strong></span>
        <span>Prior wins: <strong>${fmtInt(p.completedHistory)}</strong></span>
        <span>TAP: <strong>${p.tapVerified ? 'Verified' : 'Unverified'}</strong></span>`;
    }
  };

  for (const d of dots) {
    const idx = Number(d.dataset.idx);
    d.addEventListener('pointerenter', () => inspectPoint(idx));
    d.addEventListener('focus', () => inspectPoint(idx));
    d.addEventListener('click', () => inspectPoint(idx));
  }
  inspectPoint(0);

  // WCAG 2.2.2 Pause/Play arrival replay control (starts static by default)
  const coreHalo = radarContainer.querySelector('.swarm-core-halo');
  if (replayBtn) {
    const liveBtn = replayBtn.cloneNode(true);
    replayBtn.replaceWith(liveBtn);
    liveBtn.textContent = 'Play arrival replay';
    liveBtn.setAttribute('aria-pressed', 'false');

    const stopReplay = () => {
      if (activeSwarmReplayTimer) {
        clearInterval(activeSwarmReplayTimer);
        activeSwarmReplayTimer = null;
      }
      dots.forEach((d) => d.setAttribute('opacity', '1'));
      spokes.forEach((s) => s.setAttribute('opacity', '1'));
      coreHalo?.classList.remove('is-pulsing');
      liveBtn.textContent = 'Play arrival replay';
      liveBtn.setAttribute('aria-pressed', 'false');
    };

    liveBtn.addEventListener('click', () => {
      if (activeSwarmReplayTimer) {
        stopReplay();
        return;
      }
      let shown = 0;
      dots.forEach((d) => d.setAttribute('opacity', '0.06'));
      spokes.forEach((s) => s.setAttribute('opacity', '0.04'));
      coreHalo?.classList.add('is-pulsing');
      liveBtn.textContent = 'Pause replay';
      liveBtn.setAttribute('aria-pressed', 'true');
      const stepMs = Math.max(55, Math.min(180, Math.round(4500 / Math.max(1, arrivals.length))));
      activeSwarmReplayTimer = setInterval(() => {
        if (shown >= arrivals.length) {
          stopReplay();
          return;
        }
        dots[shown]?.setAttribute('opacity', '1');
        spokes[shown]?.setAttribute('opacity', '1');
        inspectPoint(shown);
        shown += 1;
      }, stepMs);
    });
  }

  if (tableBodyEl) {
    tableBodyEl.innerHTML = arrivals
      .slice(0, 15)
      .map(
        (a, i) => `
        <tr>
          <th scope="row">#${i + 1}</th>
          <td data-label="Agent Wallet">${escapeHtml(a.workerShort)}</td>
          <td class="num" data-label="Arrival Latency">+${fmtSec(a.dtSec)}</td>
          <td class="num" data-label="Prior Wins">${fmtInt(a.completedHistory)}</td>
          <td data-label="TAP Check">${a.tapVerified ? 'Verified' : 'Standard'}</td>
          <td class="num" data-label="Submitted UTC">${fmtUtcTime(a.submittedAt)}</td>
        </tr>`
      )
      .join('');
  }
}

/* ==========================================================================
   5. Activity Heatmaps (7x24 UTC Hour-of-Week + Mode x Date)
   ========================================================================== */
export function renderHourOfWeekHeatmap({ heatmap, container, readoutEl }) {
  if (!heatmap || !container) return;
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const cellMap = new Map();
  let maxC = 1;
  let total = 0;
  for (const c of heatmap.cells || []) {
    const v = Number(c.count || 0);
    cellMap.set(`${c.row}:${c.col}`, v);
    total += v;
    if (v > maxC) maxC = v;
  }

  const cellW = 28;
  const cellH = 28;
  const gap = 5;
  const padL = 46;
  const padT = 26;
  const W = padL + 24 * (cellW + gap) + 12;
  const H = padT + 7 * (cellH + gap) + 12;

  const cellsSvg = [];
  for (let r = 0; r < 7; r += 1) {
    const y = padT + r * (cellH + gap);
    cellsSvg.push(`<text x="${padL - 10}" y="${y + 18}" text-anchor="end" fill="${PALETTE.muted}" font-family="Departure Mono, monospace" font-size="11">${days[r]}</text>`);
    for (let col = 0; col < 24; col += 1) {
      const x = padL + col * (cellW + gap);
      const val = cellMap.get(`${r}:${col}`) || 0;
      const ratio = val / maxC;
      const fill = heatColor(ratio);
      cellsSvg.push(`<rect class="hm-cell" data-day="${days[r]}" data-hour="${col}" data-val="${val}" tabindex="0" role="button" aria-label="${days[r]} ${String(col).padStart(2, '0')}:00 UTC: ${fmtInt(val)} events" x="${x}" y="${y}" width="${cellW}" height="${cellH}" rx="5" fill="${fill}" stroke="${ratio > 0.9 ? PALETTE.magenta : PALETTE.lineSoft}" stroke-width="${ratio > 0.9 ? '1.5' : '0.8'}" />`);
    }
  }

  const hoursSvg = Array.from({ length: 24 }, (_, h) => {
    if (h % 2 !== 0) return '';
    const x = padL + h * (cellW + gap) + cellW / 2;
    return `<text x="${x}" y="16" text-anchor="middle" fill="${PALETTE.muted}" font-family="Departure Mono, monospace" font-size="10">${String(h).padStart(2, '0')}</text>`;
  }).join('');

  container.innerHTML = `
    <svg role="img" viewBox="0 0 ${W} ${H}" aria-label="Activity heatmap by UTC day of week and hour">
      <title>UTC Hour-of-Week Activity Heatmap</title>
      ${hoursSvg}
      ${cellsSvg.join('')}
    </svg>`;

  const showCell = (day, hour, val) => {
    if (!readoutEl) return;
    readoutEl.innerHTML = `
      <span>UTC Slot: <strong>${escapeHtml(day)} ${String(hour).padStart(2, '0')}:00 - ${String(hour).padStart(2, '0')}:59 UTC</strong></span>
      <span>Events: <strong style="color:var(--magenta)">${fmtInt(val)}</strong></span>
      <span>Share of window: <strong>${fmtPct((val / Math.max(1, total)) * 100, 2)}</strong> (peak ${fmtInt(maxC)})</span>`;
  };

  let peakCell = { day: 'Fri', hour: 4, val: 0 };
  for (const el of container.querySelectorAll('.hm-cell')) {
    const day = el.dataset.day;
    const hour = Number(el.dataset.hour);
    const val = Number(el.dataset.val);
    if (val > peakCell.val) peakCell = { day, hour, val };
    el.addEventListener('pointerenter', () => showCell(day, hour, val));
    el.addEventListener('focus', () => showCell(day, hour, val));
    el.addEventListener('click', () => showCell(day, hour, val));
  }
  showCell(peakCell.day, peakCell.hour, peakCell.val);
}

export function renderModeHeatmap({ heatmap, container, readoutEl }) {
  if (!heatmap || !container) return;
  const rows = heatmap.rowKeys || [];
  const cols = (heatmap.colKeys || []).slice(-31); // Show up to last 31 columns cleanly
  const cellMap = new Map();
  let maxC = 1;
  for (const c of heatmap.cells || []) {
    cellMap.set(`${c.row}:${c.col}`, { count: Number(c.count || 0), volumeUsd: Number(c.volume || 0) / 1e6 });
    if (cols.includes(c.col) && Number(c.count || 0) > maxC) maxC = Number(c.count || 0);
  }

  const padL = 94;
  const padT = 26;
  const cellW = Math.max(16, Math.min(26, Math.floor(720 / Math.max(1, cols.length))));
  const cellH = 28;
  const gap = 4;
  const W = padL + cols.length * (cellW + gap) + 12;
  const H = padT + rows.length * (cellH + gap) + 16;

  const stride = Math.max(1, Math.ceil(cols.length / 8));
  const colHeaders = cols
    .map((c, idx) => {
      if (idx !== 0 && idx !== cols.length - 1 && idx % stride !== 0) return '';
      const x = padL + idx * (cellW + gap) + cellW / 2;
      return `<text x="${x}" y="16" text-anchor="middle" fill="${PALETTE.muted}" font-family="Departure Mono, monospace" font-size="9.5">${escapeHtml(c.slice(5))}</text>`;
    })
    .join('');

  const grid = [];
  rows.forEach((mode, rIdx) => {
    const y = padT + rIdx * (cellH + gap);
    grid.push(`<text x="${padL - 10}" y="${y + 18}" text-anchor="end" fill="${PALETTE.cream}" font-family="Departure Mono, monospace" font-size="11">${escapeHtml(mode)}</text>`);
    cols.forEach((col, cIdx) => {
      const x = padL + cIdx * (cellW + gap);
      const entry = cellMap.get(`${mode}:${col}`) || { count: 0, volumeUsd: 0 };
      const fill = heatColor(entry.count / maxC);
      grid.push(`<rect class="mhm-cell" data-mode="${escapeHtml(mode)}" data-col="${escapeHtml(col)}" data-count="${entry.count}" data-usd="${entry.volumeUsd.toFixed(2)}" tabindex="0" role="button" aria-label="${escapeHtml(`${mode} on ${col}: ${entry.count} tasks, ${fmtUsd(entry.volumeUsd)}`)}" x="${x}" y="${y}" width="${cellW}" height="${cellH}" rx="4" fill="${fill}" stroke="${PALETTE.lineSoft}" stroke-width="0.8" />`);
    });
  });

  container.innerHTML = `
    <svg role="img" viewBox="0 0 ${W} ${H}" aria-label="Task mode activity heatmap by date">
      <title>Task Mode by Date Heatmap</title>
      ${colHeaders}
      ${grid.join('')}
    </svg>`;

  const show = (mode, col, count, usd) => {
    if (!readoutEl) return;
    readoutEl.innerHTML = `
      <span>Mode: <strong>${escapeHtml(mode)}</strong> · Date: <strong>${escapeHtml(col)}</strong></span>
      <span>Tasks posted: <strong style="color:var(--magenta)">${fmtInt(count)}</strong></span>
      <span>Escrow posted: <strong>${fmtUsd(usd)}</strong></span>`;
  };

  let best = { mode: rows[0] || 'bounty', col: cols[cols.length - 1] || '', count: 0, usd: 0 };
  for (const el of container.querySelectorAll('.mhm-cell')) {
    const m = el.dataset.mode;
    const c = el.dataset.col;
    const cnt = Number(el.dataset.count);
    const usd = Number(el.dataset.usd);
    if (cnt > best.count) best = { mode: m, col: c, count: cnt, usd };
    el.addEventListener('pointerenter', () => show(m, c, cnt, usd));
    el.addEventListener('focus', () => show(m, c, cnt, usd));
    el.addEventListener('click', () => show(m, c, cnt, usd));
  }
  show(best.mode, best.col, best.count, best.usd);
}

/* ==========================================================================
   6. Weekly Distinct Task Posters & Tempo vs Base Chain Migration
   ========================================================================== */
export function renderWeeklyPostersChart({ weeks, container, readoutEl, metric = 'posters' }) {
  if (!weeks || !weeks.length || !container) return;
  const rows = weeks.slice(-16); // Last 16 active weeks for crisp legibility
  const W = 880;
  const H = 290;
  const pad = { top: 24, right: 24, bottom: 42, left: 52 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const isPosters = metric === 'posters';
  const maxVal = Math.max(
    1,
    ...rows.map((r) => (isPosters ? Math.max(r.combinedDistinctPosters, r.tempoDistinctPosters + r.baseDistinctPosters) : r.totalTasks))
  );
  const slotW = plotW / rows.length;
  const barW = Math.max(10, Math.min(34, slotW * 0.62));
  const yAt = (v) => pad.top + plotH - (v / maxVal) * plotH;

  const grid = [0, 0.25, 0.5, 0.75, 1]
    .map((f) => {
      const y = pad.top + plotH * (1 - f);
      return `<line x1="${pad.left}" y1="${y.toFixed(1)}" x2="${W - pad.right}" y2="${y.toFixed(1)}" stroke="${PALETTE.lineSoft}" stroke-dasharray="${f === 0 ? 'none' : '3 4'}" /><text x="${pad.left - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end" fill="${PALETTE.muted}" font-family="Departure Mono, monospace" font-size="10.5">${fmtInt(maxVal * f)}</text>`;
    })
    .join('');

  const bars = rows
    .map((r, i) => {
      const cx = pad.left + i * slotW + slotW / 2;
      const x = cx - barW / 2;
      const baseV = isPosters ? r.baseDistinctPosters : r.baseTasks;
      const tempoV = isPosters ? r.tempoDistinctPosters : r.tempoTasks;
      const hBase = (baseV / maxVal) * plotH;
      const hTempo = (tempoV / maxVal) * plotH;
      const yBase = pad.top + plotH - hBase;
      const yTempo = yBase - hTempo;
      const showLbl = i === 0 || i === rows.length - 1 || i % Math.max(1, Math.ceil(rows.length / 8)) === 0;
      return `
        <g class="wk-bar" data-idx="${i}" tabindex="0" role="button" aria-label="${escapeHtml(`Week of ${r.week}: ${r.combinedDistinctPosters} distinct posters (${r.tempoDistinctPosters} Tempo, ${r.baseDistinctPosters} Base), ${r.totalTasks} tasks`)}">
          <rect x="${x.toFixed(1)}" y="${yBase.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(0, hBase).toFixed(1)}" rx="2" fill="${PALETTE.salmon}" />
          <rect x="${x.toFixed(1)}" y="${yTempo.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(0, hTempo).toFixed(1)}" rx="2" fill="${PALETTE.magenta}" />
          <rect x="${(cx - slotW / 2).toFixed(1)}" y="${pad.top}" width="${slotW.toFixed(1)}" height="${plotH}" fill="transparent" />
          ${showLbl ? `<text x="${cx.toFixed(1)}" y="${H - 12}" text-anchor="middle" fill="${PALETTE.muted}" font-family="Departure Mono, monospace" font-size="10">${escapeHtml(r.week.slice(5))}</text>` : ''}
        </g>`;
    })
    .join('');

  const combinedLine = isPosters
    ? `<path d="${rows.map((r, i) => `${i === 0 ? 'M' : 'L'}${(pad.left + i * slotW + slotW / 2).toFixed(1)},${yAt(r.combinedDistinctPosters).toFixed(1)}`).join(' ')}" fill="none" stroke="${PALETTE.paper}" stroke-width="2" stroke-dasharray="4 3" />`
    : '';

  container.innerHTML = `
    <svg role="img" viewBox="0 0 ${W} ${H}" aria-label="${isPosters ? 'Distinct task posters per week across Tempo and Base' : 'Weekly tasks posted across Tempo and Base'}">
      <title>${isPosters ? 'Distinct Task Posters per Week' : 'Weekly Task Volume by Chain'}</title>
      ${grid}
      ${bars}
      ${combinedLine}
    </svg>`;

  const inspect = (idx) => {
    const r = rows[idx];
    if (!r || !readoutEl) return;
    readoutEl.innerHTML = `
      <span>Week of <strong>${escapeHtml(r.week)}</strong></span>
      <span>Combined distinct posters: <strong style="color:var(--paper)">${fmtInt(r.combinedDistinctPosters)}</strong></span>
      <span>Tempo: <strong style="color:var(--magenta)">${fmtInt(r.tempoDistinctPosters)} posters</strong> (${fmtInt(r.tempoTasks)} tasks · ${fmtUsd(r.tempoRewardUsd)})</span>
      <span>Base: <strong style="color:var(--salmon)">${fmtInt(r.baseDistinctPosters)} posters</strong> (${fmtInt(r.baseTasks)} tasks · ${fmtUsd(r.baseRewardUsd)})</span>`;
  };

  for (const el of container.querySelectorAll('.wk-bar')) {
    const idx = Number(el.dataset.idx);
    el.addEventListener('pointerenter', () => inspect(idx));
    el.addEventListener('focus', () => inspect(idx));
    el.addEventListener('click', () => inspect(idx));
  }
  inspect(rows.length - 1);
}

/* ==========================================================================
   7. Insight Diagnostics: Concentration Lorenz Curve & Decision Latency Strip
   ========================================================================== */
export function renderConcentrationLorenz({ tempoConc, baseConc, container }) {
  if (!container || !tempoConc || !baseConc) return;
  const W = 460;
  const H = 316;
  const pad = { top: 20, right: 24, bottom: 56, left: 52 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const toPath = (pts) =>
    pts
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${(pad.left + (p.posterPct / 100) * plotW).toFixed(1)},${(pad.top + plotH - (p.taskPct / 100) * plotH).toFixed(1)}`)
      .join(' ');

  container.innerHTML = `
    <svg role="img" viewBox="0 0 ${W} ${H}" aria-label="Lorenz curve showing posting concentration on Tempo versus Base">
      <title>Poster Concentration Lorenz Curve (Tempo vs Base)</title>
      ${[0, 25, 50, 75, 100]
        .map((v) => {
          const y = pad.top + plotH - (v / 100) * plotH;
          const x = pad.left + (v / 100) * plotW;
          return `
            <line x1="${pad.left}" y1="${y.toFixed(1)}" x2="${W - pad.right}" y2="${y.toFixed(1)}" stroke="${PALETTE.lineSoft}" stroke-dasharray="${v === 0 ? 'none' : '3 4'}" />
            <text x="${pad.left - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end" fill="${PALETTE.muted}" font-family="Departure Mono, monospace" font-size="10">${v}%</text>
            <text x="${x.toFixed(1)}" y="${(pad.top + plotH + 18).toFixed(1)}" text-anchor="middle" fill="${PALETTE.muted}" font-family="Departure Mono, monospace" font-size="10">${v}%</text>`;
        })
        .join('')}
      <line x1="${pad.left}" y1="${pad.top + plotH}" x2="${W - pad.right}" y2="${pad.top}" stroke="${PALETTE.line}" stroke-dasharray="5 5" />
      <path d="${toPath(baseConc.lorenz)}" fill="none" stroke="${PALETTE.salmon}" stroke-width="2.5" />
      <path d="${toPath(tempoConc.lorenz)}" fill="none" stroke="${PALETTE.magenta}" stroke-width="2.8" />
      <text x="${pad.left + plotW / 2}" y="${H - 10}" text-anchor="middle" fill="${PALETTE.muted}" font-family="Inter Tight, sans-serif" font-size="11">Cumulative % of requester wallets (ascending)</text>
    </svg>`;
}

export function renderDecisionLatencyPlot({ decision, container, readoutEl }) {
  if (!decision || !container) return;
  const W = 540;
  const H = 260;
  const pad = { top: 26, right: 24, bottom: 40, left: 74 };
  const plotW = W - pad.left - pad.right;

  // Log scale from 0.02h (~1 min) to 500h (~21 days)
  const minLog = Math.log10(0.02);
  const maxLog = Math.log10(500);
  const xAt = (hrs) => {
    const clamped = Math.max(0.02, Math.min(500, hrs));
    return pad.left + ((Math.log10(clamped) - minLog) / (maxLog - minLog)) * plotW;
  };

  const ticks = [
    { h: 0.05, lbl: '3m' },
    { h: 0.25, lbl: '15m' },
    { h: 1, lbl: '1h' },
    { h: 6, lbl: '6h' },
    { h: 24, lbl: '1d' },
    { h: 72, lbl: '3d' },
    { h: 240, lbl: '10d' },
  ];

  const rows = [
    { key: 'tempo', label: 'Tempo', y: 82, stats: decision.tempo, color: PALETTE.magenta },
    { key: 'base', label: 'Base', y: 168, stats: decision.base, color: PALETTE.salmon },
  ];

  const ptsSvg = decision.points
    .map((pt, idx) => {
      const baseY = pt.chainId === 4217 ? 82 : 168;
      const jitter = ((idx % 7) - 3) * 5.2;
      const x = xAt(pt.hoursToDecision);
      const color = pt.chainId === 4217 ? PALETTE.magenta : PALETTE.salmon;
      return `<circle class="lat-dot" data-idx="${idx}" tabindex="0" role="button" aria-label="${escapeHtml(`${pt.referenceCode} on ${pt.chain} (${pt.mode}): settled in ${fmtHours(pt.hoursToDecision)}, ${fmtUsd(pt.rewardUsd)}`)}" cx="${x.toFixed(1)}" cy="${(baseY + jitter).toFixed(1)}" r="4.5" fill="${color}" fill-opacity="0.78" stroke="${PALETTE.ground}" stroke-width="1" />`;
    })
    .join('');

  const boxesSvg = rows
    .map((r) => {
      if (!r.stats || !r.stats.n) return '';
      const x25 = xAt(r.stats.p25Hours);
      const x50 = xAt(r.stats.medianHours);
      const x75 = xAt(r.stats.p75Hours);
      return `
        <text x="${pad.left - 12}" y="${r.y + 4}" text-anchor="end" fill="${PALETTE.cream}" font-family="Departure Mono, monospace" font-size="12">${r.label}</text>
        <rect x="${x25.toFixed(1)}" y="${r.y - 22}" width="${Math.max(4, x75 - x25).toFixed(1)}" height="44" rx="4" fill="${r.color}" fill-opacity="0.16" stroke="${r.color}" stroke-width="1.2" />
        <line x1="${x50.toFixed(1)}" y1="${r.y - 26}" x2="${x50.toFixed(1)}" y2="${r.y + 26}" stroke="${PALETTE.paper}" stroke-width="2.4" />
        <text x="${x50.toFixed(1)}" y="${r.y - 31}" text-anchor="middle" fill="${PALETTE.paper}" font-family="Departure Mono, monospace" font-size="10.5">med ${fmtHours(r.stats.medianHours)}</text>`;
    })
    .join('');

  container.innerHTML = `
    <svg role="img" viewBox="0 0 ${W} ${H}" aria-label="Time to settlement latency distribution on Tempo versus Base">
      <title>Time to Decision Distribution (Log Scale Hours)</title>
      ${ticks
        .map((t) => {
          const x = xAt(t.h);
          return `<line x1="${x.toFixed(1)}" y1="${pad.top}" x2="${x.toFixed(1)}" y2="${H - pad.bottom}" stroke="${PALETTE.lineSoft}" stroke-dasharray="3 4" /><text x="${x.toFixed(1)}" y="${H - 16}" text-anchor="middle" fill="${PALETTE.muted}" font-family="Departure Mono, monospace" font-size="10.5">${t.lbl}</text>`;
        })
        .join('')}
      ${boxesSvg}
      ${ptsSvg}
    </svg>`;

  const show = (idx) => {
    const pt = decision.points[idx];
    if (!pt || !readoutEl) return;
    readoutEl.innerHTML = `
      <span>Task: <strong>${escapeHtml(pt.referenceCode)}</strong> (${escapeHtml(pt.chain)} · ${escapeHtml(pt.mode)})</span>
      <span>Time to decision: <strong style="color:var(--magenta)">${fmtHours(pt.hoursToDecision)}</strong></span>
      <span>Reward: <strong>${fmtUsd(pt.rewardUsd)}</strong> · Entries: <strong>${fmtInt(pt.submissionCount)}</strong></span>`;
  };

  for (const el of container.querySelectorAll('.lat-dot')) {
    const idx = Number(el.dataset.idx);
    el.addEventListener('pointerenter', () => show(idx));
    el.addEventListener('focus', () => show(idx));
    el.addEventListener('click', () => show(idx));
  }
  if (decision.points.length) show(0);
}

/* ==========================================================================
   8. Task Mortality & Ghost-Open Stacked Matrix
   ========================================================================== */
export function renderMortalityMatrix({ mortality, container, mode = 'tasks' }) {
  if (!mortality || !container) return;
  const useUsd = mode === 'usd';
  const rows = [
    { label: 'Tempo (4217)', data: mortality.tempo },
    { label: 'Base (8453)', data: mortality.base },
    { label: 'Combined Public', data: mortality.combined },
  ];

  const segs = [
    { key: 'completed', usdKey: 'rewardCompletedUsd', label: 'Completed', color: '#E74079' },
    { key: 'liveOpen', usdKey: 'rewardLiveOpenUsd', label: 'Live open', color: '#D9A097' },
    { key: 'inProgress', usdKey: 'rewardInProgressUsd', label: 'In progress', color: '#EFE9E2' },
    { key: 'ghostOpen', usdKey: 'rewardGhostOpenUsd', label: 'Ghost-open (past expiry)', color: '#8A5A54' },
    { key: 'expired', usdKey: 'rewardExpiredUsd', label: 'Expired', color: '#5E554D' },
    { key: 'cancelled', usdKey: 'rewardCancelledUsd', label: 'Cancelled', color: '#3B342E' },
  ];

  const getVal = (d, s) => (useUsd ? Number(d[s.usdKey] || 0) : Number(d[`${s.key}Tasks`] || 0));

  container.innerHTML = rows
    .map((r) => {
      const total = segs.reduce((acc, s) => acc + getVal(r.data, s), 0) || 1;
      const barHtml = segs
        .map((s) => {
          const val = getVal(r.data, s);
          const pct = (val / total) * 100;
          if (pct < 0.3) return '';
          return `<div title="${escapeHtml(`${s.label}: ${useUsd ? fmtUsd(val) : fmtInt(val)} (${fmtPct(pct, 1)})`)}" style="inline-size:${pct.toFixed(2)}%;background:${s.color};block-size:100%;"></div>`;
        })
        .join('');
      const deadPct = useUsd
        ? ((r.data.rewardExpiredUsd + r.data.rewardCancelledUsd) / total) * 100
        : r.data.formalDeathRatePct;
      const ghostVal = useUsd ? fmtUsd(r.data.rewardGhostOpenUsd) : `${fmtInt(r.data.ghostOpenTasks)} tasks`;
      return `
        <div style="margin-block-end:1rem;">
          <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:0.4rem;margin-block-end:0.35rem;font-family:var(--font-mono);font-size:0.78rem;">
            <strong style="color:var(--cream)">${escapeHtml(r.label)}</strong>
            <span style="color:var(--muted)">Dead (exp+cancel): <strong style="color:var(--paper)">${fmtPct(deadPct, 1)}</strong> · Ghost-open: <strong>${ghostVal}</strong></span>
          </div>
          <div style="display:flex;block-size:20px;border-radius:5px;overflow:hidden;border:1px solid var(--line);background:var(--ground-soft);">${barHtml}</div>
        </div>`;
    })
    .join('');
}

/* ==========================================================================
   9. Filterable Live Activity Feed
   ========================================================================== */
export function renderLiveFeed({ items, container, chainFilter = 'all', typeFilter = 'all', queryFilter = '' }) {
  if (!container) return [];
  const q = String(queryFilter || '').trim().toLowerCase();
  const filtered = (items || []).filter((item) => {
    if (chainFilter !== 'all' && item.chain.toLowerCase() !== chainFilter) return false;
    if (typeFilter !== 'all' && item.type !== typeFilter) return false;
    if (q) {
      const hay = `${item.taskTitle || ''} ${item.actorShort || ''} ${item.chain || ''} ${item.symbol || ''} ${item.type || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  if (!filtered.length) {
    container.innerHTML = `<li class="feed-row"><span class="feed-meta">No events match the active filter in the latest window.</span></li>`;
    return [];
  }

  container.innerHTML = filtered
    .slice(0, 50)
    .map((item) => {
      const chainCls = item.chainId === 4217 ? 'pill-tempo' : 'pill-base';
      const typeLabel = item.type === 'task_created' ? 'NEW TASK' : item.type === 'task_submitted' ? 'ENTRY' : item.type.toUpperCase();
      const typeCls = item.type === 'task_created' ? 'pill-magenta' : '';
      return `
        <li class="feed-row">
          <div style="display:flex;gap:0.4rem;align-items:center;">
            <span class="pill ${chainCls}">${escapeHtml(item.chain)}</span>
            <span class="pill ${typeCls}">${escapeHtml(typeLabel)}</span>
          </div>
          <div>
            <div class="feed-title">${escapeHtml(item.taskTitle)}</div>
            <div class="feed-meta">Actor ${escapeHtml(item.actorShort)} (${escapeHtml(item.actorType)})${item.amountUsd ? ` · ${fmtUsd(item.amountUsd)} ${escapeHtml(item.symbol)}` : ''}</div>
          </div>
          <div class="feed-meta" style="text-align:end;">${fmtUtcTime(item.timestamp)}</div>
        </li>`;
    })
    .join('');

  return filtered;
}
