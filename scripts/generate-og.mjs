/**
 * Generates live 1200x630 Brand Kit Observatory Editorial Print OG share cards
 * (one per view) from data/snapshot.json using @resvg/resvg-js and Taskmarket's
 * official SIL OFL fonts, unmodified lockup (>= 30% frame width), and scene plate.
 * Every chart/graphic on every card is 100% driven by live snapshot data.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const FONTS_DIR = path.join(ROOT, 'src', 'assets', 'fonts');
const BRAND_DIR = path.join(ROOT, 'src', 'assets', 'brand');

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtInt(n) {
  return Math.round(Number(n || 0)).toLocaleString('en-US');
}

function fmtUsd(n) {
  const v = Number(n || 0);
  if (v >= 1000) return `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtUtcShort(iso) {
  if (!iso) return 'UTC';
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

function fmtHours(h) {
  if (h === null || h === undefined) return 'n/a';
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 24) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

function buildSparklinePaths(series, x0, y0, w, h) {
  const complete = series.length > 2 ? series.slice(0, -1) : series;
  const pts = complete.slice(-14);
  if (pts.length < 2) return { area: '', line: '', dots: '' };
  const maxVal = Math.max(1, ...pts.map((p) => Number(p.activeAgents || 0)));
  const minVal = Math.min(...pts.map((p) => Number(p.activeAgents || 0)));
  const span = Math.max(1, maxVal - minVal * 0.6);
  const coords = pts.map((p, i) => {
    const x = x0 + (i / (pts.length - 1)) * w;
    const norm = (Number(p.activeAgents || 0) - minVal * 0.6) / span;
    const y = y0 + h - Math.max(0.06, Math.min(0.96, norm)) * h;
    return { x, y };
  });
  const line = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const area = `${line} L${(x0 + w).toFixed(1)},${(y0 + h).toFixed(1)} L${x0.toFixed(1)},${(y0 + h).toFixed(1)} Z`;
  const last = coords[coords.length - 1];
  // Taskmarket rounded-square ceramic tile endpoint
  const dots = `<rect x="${(last.x - 5).toFixed(1)}" y="${(last.y - 5).toFixed(1)}" width="10" height="10" rx="2.5" fill="#FFF6E8" stroke="#E74079" stroke-width="2.2" />`;
  return { area, line, dots };
}

function buildMiniHeatmapSvg(hourHeatmap, x0, y0, cellW, cellH, gap) {
  const map = new Map();
  let maxC = 1;
  for (const c of hourHeatmap?.cells || []) {
    const k = `${c.row}:${c.col}`;
    const v = Number(c.count || 0);
    map.set(k, v);
    if (v > maxC) maxC = v;
  }
  const rects = [];
  for (let r = 0; r < 7; r += 1) {
    for (let col = 0; col < 24; col += 1) {
      const v = map.get(`${r}:${col}`) || 0;
      const t = v / maxC;
      let fill = '#1E1A16';
      if (t > 0.88) fill = '#FFF6E8';
      else if (t > 0.68) fill = '#E74079';
      else if (t > 0.44) fill = '#B0315D';
      else if (t > 0.22) fill = '#6E223B';
      else if (t > 0.06) fill = '#3E1C27';
      const x = x0 + col * (cellW + gap);
      const y = y0 + r * (cellH + gap);
      rects.push(`<rect x="${x}" y="${y}" width="${cellW}" height="${cellH}" rx="2.5" fill="${fill}" />`);
    }
  }
  return rects.join('');
}

/**
 * 100% live data-driven miniature 3-column Capital Flow Sankey from snapshot.capitalFlow.all
 */
function buildLiveMiniFlowGraphic(flow, x0, y0, w, h) {
  if (!flow?.nodes?.length) return '';
  const totalUsd = Math.max(1, flow.totalUsd);
  const cols = [0, 1, 2].map((c) => flow.nodes.filter((n) => n.col === c).slice(0, 5));
  const colX = [x0, x0 + w * 0.5 - 4, x0 + w - 8];
  const nodeW = 8;
  const gap = 6;
  const pos = new Map();

  for (let c = 0; c < 3; c += 1) {
    const list = cols[c];
    const sumUsd = list.reduce((s, n) => s + n.usd, 0) || totalUsd;
    const usableH = Math.max(40, h - Math.max(0, list.length - 1) * gap);
    const rawH = list.map((n) => Math.max(10, (n.usd / sumUsd) * usableH));
    const scale = usableH / rawH.reduce((a, b) => a + b, 0);
    let y = y0;
    list.forEach((n, i) => {
      const nh = rawH[i] * scale;
      pos.set(n.id, { ...n, x: colX[c], y, h: nh, outY: y, inY: y });
      y += nh + gap;
    });
  }

  const paths = [];
  for (const link of flow.links || []) {
    const s = pos.get(link.source);
    const t = pos.get(link.target);
    if (!s || !t) continue;
    const sh = Math.max(2, (link.usd / Math.max(1, s.usd)) * s.h);
    const th = Math.max(2, (link.usd / Math.max(1, t.usd)) * t.h);
    const sy0 = Math.min(s.y + s.h - sh, s.outY);
    const ty0 = Math.min(t.y + t.h - th, t.inY);
    s.outY += sh;
    t.inY += th;
    const lx0 = s.x + nodeW;
    const lx1 = t.x;
    const mx = (lx0 + lx1) / 2;
    const isTempo = link.source.includes('tempo') || link.target.includes('tempo');
    const isMulti = link.target === 'w:multi';
    const fill = isTempo ? '#E74079' : isMulti ? '#FFF6E8' : '#D9A097';
    paths.push(
      `<path d="M${lx0.toFixed(1)},${sy0.toFixed(1)} C${mx.toFixed(1)},${sy0.toFixed(1)} ${mx.toFixed(1)},${ty0.toFixed(1)} ${lx1.toFixed(1)},${ty0.toFixed(1)} L${lx1.toFixed(1)},${(ty0 + th).toFixed(1)} C${mx.toFixed(1)},${(ty0 + th).toFixed(1)} ${mx.toFixed(1)},${(sy0 + sh).toFixed(1)} ${lx0.toFixed(1)},${(sy0 + sh).toFixed(1)} Z" fill="${fill}" fill-opacity="0.45" />`
    );
  }

  const rects = [...pos.values()].map((n) => {
    const fill = n.col === 1 ? (n.id.includes('tempo') ? '#E74079' : '#D9A097') : n.id === 'w:multi' ? '#FFF6E8' : n.col === 0 ? '#EFE9E2' : '#D9A097';
    return `<rect x="${n.x.toFixed(1)}" y="${n.y.toFixed(1)}" width="${nodeW}" height="${Math.max(4, n.h).toFixed(1)}" rx="2.5" fill="${fill}" />`;
  });

  return [...paths, ...rects].join('');
}

/**
 * 100% live data-driven curved Convergence Filaments from snapshot.swarmConvergence.tasks[0]
 */
function buildLiveMiniSwarmGraphic(task, cx, cy) {
  const arrivals = (task?.arrivals || []).slice(0, 32);
  const maxMin = Math.max(30, arrivals[arrivals.length - 1]?.dtMin || 60);
  const maxR = 92;
  const logR = (dtMin) => 22 + (Math.log10(1 + Math.max(0, dtMin)) / Math.log10(1 + maxMin)) * (maxR - 22);
  const goldenAngle = 2.399963229728653;

  const rings = [28, 52, 74, 92].map(
    (r) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#453E37" stroke-width="1" stroke-dasharray="3 4" />`
  );

  const filaments = arrivals.map((a, i) => {
    const r = logR(a.dtMin);
    const ang = -Math.PI / 2 + i * goldenAngle;
    const x = cx + Math.cos(ang) * r;
    const y = cy + Math.sin(ang) * r;
    const midR = r * 0.54;
    const bend = (i % 2 === 0 ? 1 : -1) * Math.min(16, r * 0.18);
    const ctrlX = cx + Math.cos(ang) * midR - Math.sin(ang) * bend;
    const ctrlY = cy + Math.sin(ang) * midR + Math.cos(ang) * bend;
    const sz = a.tapVerified ? 6.4 : 4.6;
    return `
      <path d="M${cx},${cy} Q${ctrlX.toFixed(1)},${ctrlY.toFixed(1)} ${x.toFixed(1)},${y.toFixed(1)}" fill="none" stroke="${a.tapVerified ? '#E74079' : '#D9A097'}" stroke-opacity="${a.tapVerified ? '0.45' : '0.32'}" stroke-width="1.1" />
      <rect x="${(x - sz / 2).toFixed(1)}" y="${(y - sz / 2).toFixed(1)}" width="${sz}" height="${sz}" rx="1.6" fill="${a.tapVerified ? '#FFF6E8' : '#D9A097'}" stroke="${a.tapVerified ? '#E74079' : '#12100E'}" stroke-width="1" />`;
  });

  return [
    `<circle cx="${cx}" cy="${cy}" r="76" fill="url(#ogCoreHalo)" />`,
    ...rings,
    ...filaments,
    `<rect x="${cx - 10}" y="${cy - 10}" width="20" height="20" rx="5" fill="#FFF6E8" stroke="#E74079" stroke-width="1.8" />`,
    `<rect x="${cx - 3.5}" y="${cy - 3.5}" width="7" height="7" rx="1.5" fill="#E74079" />`,
  ].join('');
}

/**
 * 100% live data-driven Lorenz curve for insights.png
 */
function buildLiveMiniLorenzGraphic(tempoConc, baseConc, x0, y0, w, h) {
  if (!tempoConc?.lorenz?.length || !baseConc?.lorenz?.length) return '';
  const toPath = (pts) =>
    pts
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${(x0 + (p.posterPct / 100) * w).toFixed(1)},${(y0 + h - (p.taskPct / 100) * h).toFixed(1)}`)
      .join(' ');
  return `
    <line x1="${x0}" y1="${y0 + h}" x2="${x0 + w}" y2="${y0}" stroke="#453E37" stroke-dasharray="4 4" stroke-width="1.2" />
    <path d="${toPath(baseConc.lorenz)}" fill="none" stroke="#D9A097" stroke-width="2.4" />
    <path d="${toPath(tempoConc.lorenz)}" fill="none" stroke="#E74079" stroke-width="3" />`;
}

/**
 * 100% live data-driven weekly Tempo vs Base stacked ceramic bars for chains.png
 */
function buildLiveMiniChainsGraphic(weeks, x0, y0, w, h) {
  const recent = (weeks || []).slice(-10);
  if (!recent.length) return '';
  const maxT = Math.max(1, ...recent.map((r) => r.totalTasks));
  const slot = w / recent.length;
  const bw = Math.max(10, slot * 0.64);
  return recent
    .map((r, i) => {
      const x = x0 + i * slot + (slot - bw) / 2;
      const hb = (r.baseTasks / maxT) * h;
      const ht = (r.tempoTasks / maxT) * h;
      const yb = y0 + h - hb;
      const yt = yb - ht;
      return `
        <rect x="${x.toFixed(1)}" y="${yb.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0, hb).toFixed(1)}" rx="2.5" fill="#D9A097" />
        <rect x="${x.toFixed(1)}" y="${yt.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0, ht).toFixed(1)}" rx="2.5" fill="#E74079" />`;
    })
    .join('');
}

function wrapLines(text, maxChars) {
  const words = String(text || '').split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (!cur) cur = w;
    else if (cur.length + 1 + w.length <= maxChars) cur += ` ${w}`;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 2);
}

function renderCardSvg({
  lockupDataUri,
  plateDataUri,
  plateCode,
  viewLabel,
  headlineBefore,
  headlineAccent,
  headlineAfter,
  subtitle,
  stats,
  graphicSvg,
  asOf,
}) {
  const hasGraphic = Boolean(graphicSvg);
  const headlineSize = hasGraphic ? 62 : 76;
  const subLines = wrapLines(subtitle, hasGraphic ? 48 : 74);
  const subtitleSvg = subLines
    .map(
      (line, idx) =>
        `<text x="64" y="${(hasGraphic ? 278 : 288) + idx * 32}" fill="#B0A79D" font-family="Inter Tight" font-size="${hasGraphic ? 22 : 25}" font-weight="500">${esc(line)}</text>`
    )
    .join('\n  ');

  // Hairline architectural ledger strip instead of generic rounded SaaS boxes
  const totalW = 1072;
  const colW = totalW / stats.length;
  const ledgerY = 398;
  const ledgerH = 124;

  const statCells = stats
    .map((s, idx) => {
      const x = 64 + idx * colW;
      const valFont = String(s.value).length > 11 ? 22 : String(s.value).length > 8 ? 27 : 36;
      const divider = idx > 0 ? `<line x1="${x.toFixed(1)}" y1="${ledgerY}" x2="${x.toFixed(1)}" y2="${ledgerY + ledgerH}" stroke="#453E37" stroke-width="1" />` : '';
      const accentRule = s.accent ? `<rect x="${x.toFixed(1)}" y="${ledgerY}" width="${colW.toFixed(1)}" height="3" fill="#E74079" />` : '';
      return `
        <g>
          ${s.accent ? `<rect x="${x.toFixed(1)}" y="${ledgerY}" width="${colW.toFixed(1)}" height="${ledgerH}" fill="#3A1420" fill-opacity="0.34" />` : ''}
          ${divider}
          ${accentRule}
          <text x="${(x + 20).toFixed(1)}" y="${ledgerY + 34}" fill="#B0A79D" font-family="Inter Tight" font-size="17" font-weight="500">${esc(s.label)}</text>
          <text x="${(x + 20).toFixed(1)}" y="${ledgerY + 84}" fill="${s.accent ? '#FFF6E8' : '#EFE9E2'}" font-family="Departure Mono" font-size="${valFont}">${esc(s.value)}</text>
          <text x="${(x + 20).toFixed(1)}" y="${ledgerY + 110}" fill="${s.accent ? '#D9A097' : '#B0A79D'}" font-family="Departure Mono" font-size="13">${esc(s.sub || '')}</text>
        </g>`;
    })
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="maroonGlow" cx="86%" cy="18%" r="68%">
      <stop offset="0%" stop-color="#3A1420" stop-opacity="0.92" />
      <stop offset="56%" stop-color="#3A1420" stop-opacity="0.22" />
      <stop offset="100%" stop-color="#12100E" stop-opacity="0" />
    </radialGradient>
    <radialGradient id="ogCoreHalo" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#FFF6E8" stop-opacity="0.65" />
      <stop offset="35%" stop-color="#E74079" stop-opacity="0.32" />
      <stop offset="100%" stop-color="#12100E" stop-opacity="0" />
    </radialGradient>
    <linearGradient id="sparkArea" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#E74079" stop-opacity="0.36" />
      <stop offset="100%" stop-color="#E74079" stop-opacity="0" />
    </linearGradient>
    <linearGradient id="plateVignette" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#12100E" stop-opacity="0.95" />
      <stop offset="48%" stop-color="#12100E" stop-opacity="0.72" />
      <stop offset="100%" stop-color="#12100E" stop-opacity="0.48" />
    </linearGradient>
    <pattern id="archGrid" width="48" height="48" patternUnits="userSpaceOnUse">
      <path d="M 48 0 L 0 0 0 48" fill="none" stroke="#453E37" stroke-opacity="0.18" stroke-width="1" />
    </pattern>
  </defs>

  <rect width="1200" height="630" fill="#12100E" />
  <image href="${plateDataUri}" x="0" y="0" width="1200" height="630" preserveAspectRatio="xMidYMid slice" opacity="0.28" />
  <rect width="1200" height="630" fill="url(#plateVignette)" />
  <rect width="1200" height="630" fill="url(#archGrid)" />
  <rect width="1200" height="630" fill="url(#maroonGlow)" />

  <!-- Outer observatory hairline frame -->
  <rect x="28" y="24" width="1144" height="582" rx="4" fill="none" stroke="#453E37" stroke-opacity="0.6" stroke-width="1" />

  <!-- Official unmodified Taskmarket lockup: 368px = 30.7% of 1200px frame (>= 30% Brand Kit rule) -->
  <image href="${lockupDataUri}" x="64" y="48" width="368" height="67" preserveAspectRatio="xMinYMid meet" />

  <!-- Top-right domain & Plate edition stamp -->
  <text x="1136" y="76" text-anchor="end" fill="#EFE9E2" font-family="Departure Mono" font-size="22">taskmarket.dev</text>
  <rect x="862" y="92" width="274" height="28" rx="3" fill="#1B1714" stroke="#453E37" stroke-width="1" />
  <rect x="874" y="102" width="8" height="8" rx="2" fill="#E74079" />
  <text x="892" y="111" fill="#D9A097" font-family="Departure Mono" font-size="12.5">${esc(`${plateCode} · ${viewLabel.toUpperCase()}`)}</text>

  <!-- Main Instrument Serif headline with single magenta italic accent word -->
  <text x="64" y="228" fill="#EFE9E2" font-family="Instrument Serif" font-size="${headlineSize}">
    ${esc(headlineBefore)}<tspan fill="#E74079" font-style="italic">${esc(headlineAccent)}</tspan>${esc(headlineAfter)}
  </text>

  ${subtitleSvg}

  <!-- Live data-driven right-side Observatory specimen -->
  ${graphicSvg || ''}

  <!-- Architectural hairline KPI ledger -->
  <rect x="64" y="${ledgerY}" width="${totalW}" height="${ledgerH}" rx="4" fill="#181512" fill-opacity="0.92" stroke="#453E37" stroke-width="1.2" />
  ${statCells}

  <!-- Footer bar -->
  <line x1="64" y1="548" x2="1136" y2="548" stroke="#453E37" stroke-width="1" />
  <rect x="64" y="569" width="8" height="8" rx="2" fill="#E74079" />
  <text x="82" y="578" fill="#B0A79D" font-family="Departure Mono" font-size="14">DATA AS OF ${esc(asOf)}</text>
  <text x="1136" y="578" text-anchor="end" fill="#B0A79D" font-family="Inter Tight" font-size="15" font-weight="500">Tempo (OUSD) &amp; Base (USDC) · Unofficial bounty visualizer</text>
</svg>`;
}

export async function generateAllOgCards(snapshot, outDir) {
  await fs.mkdir(outDir, { recursive: true });
  const [lockupBuf, plateBuf] = await Promise.all([
    fs.readFile(path.join(BRAND_DIR, 'taskmarket-lockup.png')),
    fs.readFile(path.join(BRAND_DIR, 'plate-converge-landscape.jpg')),
  ]);
  const lockupDataUri = `data:image/png;base64,${lockupBuf.toString('base64')}`;
  const plateDataUri = `data:image/jpeg;base64,${plateBuf.toString('base64')}`;
  const asOf = fmtUtcShort(snapshot.meta.fetchedAt);

  const fontFiles = [
    path.join(FONTS_DIR, 'InstrumentSerif-Regular.ttf'),
    path.join(FONTS_DIR, 'InstrumentSerif-Italic.ttf'),
    path.join(FONTS_DIR, 'InterTight-Variable.ttf'),
    path.join(FONTS_DIR, 'DepartureMono-Regular.otf'),
  ];

  const p = snapshot.headline.platform;
  const tempo = snapshot.headline.tempo;
  const base = snapshot.headline.base;
  const flow = snapshot.capitalFlow.all;
  const swarm = snapshot.swarmConvergence.summary;
  const leadSwarmTask = snapshot.swarmConvergence.tasks?.[0] || null;
  const dec = snapshot.diagnostics.timeToDecision;
  const concT = snapshot.diagnostics.concentration.tempo;
  const concB = snapshot.diagnostics.concentration.base;
  const peak30 = snapshot.heatmaps.peaks['30d']?.peak;
  const weeks = snapshot.weeklyPostersAndChains;
  const latestWk = weeks[weeks.length - 1] || { combinedDistinctPosters: 0, tempoTasks: 0, totalTasks: 1 };
  const spark = buildSparklinePaths(snapshot.timeSeries.day['30d'] || [], 816, 186, 300, 142);

  const cards = [
    {
      slug: 'overview',
      plateCode: 'PLATE 01',
      viewLabel: 'Live Overview',
      headlineBefore: 'The live ',
      headlineAccent: 'pulse',
      headlineAfter: ' of Taskmarket.',
      subtitle: 'Real-time market volume, active agents, and settlements on Tempo and Base.',
      graphicSvg: `
        <rect x="794" y="150" width="342" height="200" rx="4" fill="#181512" fill-opacity="0.88" stroke="#453E37" stroke-width="1.2" />
        <text x="814" y="174" fill="#B0A79D" font-family="Departure Mono" font-size="11.5">14D ACTIVE AGENTS (LIVE API)</text>
        <path d="${spark.area}" fill="url(#sparkArea)" />
        <path d="${spark.line}" fill="none" stroke="#E74079" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
        ${spark.dots}`,
      stats: [
        { label: 'Active agents (7d)', value: fmtInt(p.activeAgents7d), sub: `${fmtInt(p.registeredWorkers)} registered` },
        { label: 'Live open tasks', value: fmtInt(p.openTasks), sub: `${tempo.liveOpenTasks} Tempo · ${base.liveOpenTasks} Base`, accent: true },
        { label: 'Completed tasks', value: fmtInt(p.completedTasksBreakdown), sub: `${fmtInt(p.totalTasksBreakdown)} total indexed` },
        { label: 'Public paid volume', value: fmtUsd(p.totalPublicCompletedUsd), sub: 'Tempo + Base settled' },
      ],
    },
    {
      slug: 'flow',
      plateCode: 'PLATE 02',
      viewLabel: 'Capital Flow',
      headlineBefore: 'Where escrow ',
      headlineAccent: 'flows',
      headlineAfter: ' on-chain.',
      subtitle: 'Completed stablecoin volume traced from requester wallets through modes to winners.',
      graphicSvg: `
        <rect x="802" y="150" width="334" height="200" rx="4" fill="#181512" fill-opacity="0.88" stroke="#453E37" stroke-width="1.2" />
        <text x="822" y="174" fill="#B0A79D" font-family="Departure Mono" font-size="11.5">LIVE POSTER -> MODE -> WINNER</text>
        ${buildLiveMiniFlowGraphic(flow, 822, 186, 294, 150)}`,
      stats: [
        { label: 'Completed volume', value: fmtUsd(flow.totalUsd), sub: `${fmtInt(flow.completedTasks)} settled tasks`, accent: true },
        { label: 'Multi-winner pools', value: fmtUsd(flow.multiWinnerUsd), sub: `${fmtInt(flow.multiWinnerTasks)} split bounties` },
        { label: 'Posters -> winners', value: `${fmtInt(flow.uniquePosters)} -> ${fmtInt(flow.uniqueSingleWinners)}`, sub: 'Unique wallets traced' },
      ],
    },
    {
      slug: 'swarm',
      plateCode: 'PLATE 03',
      viewLabel: 'Swarm Filaments',
      headlineBefore: 'How the ',
      headlineAccent: 'swarm',
      headlineAfter: ' converges.',
      subtitle: 'Exact submission arrival latency after new tasks open on-chain.',
      graphicSvg: buildLiveMiniSwarmGraphic(leadSwarmTask, 988, 250),
      stats: [
        { label: 'Fastest 1st entry', value: swarm.fastestArrivalSec !== null ? `${swarm.fastestArrivalSec}s` : 'n/a', sub: 'From task creation', accent: true },
        { label: 'Median 1st arrival', value: swarm.medianFirstArrivalSec !== null ? `${swarm.medianFirstArrivalSec}s` : 'n/a', sub: `Across ${swarm.tasksTracked} active swarms` },
        { label: 'Arrivals measured', value: fmtInt(swarm.totalArrivalsMeasured), sub: 'Timestamped submissions' },
      ],
    },
    {
      slug: 'insights',
      plateCode: 'PLATE 04',
      viewLabel: 'Diagnostics',
      headlineBefore: 'What the ',
      headlineAccent: 'market',
      headlineAfter: ' reveals.',
      subtitle: 'Posting concentration, settlement latency, task mortality, and weekly momentum.',
      graphicSvg: `
        <rect x="814" y="150" width="322" height="200" rx="4" fill="#181512" fill-opacity="0.88" stroke="#453E37" stroke-width="1.2" />
        <text x="834" y="174" fill="#B0A79D" font-family="Departure Mono" font-size="11.5">LORENZ CONCENTRATION</text>
        ${buildLiveMiniLorenzGraphic(concT, concB, 838, 188, 274, 146)}`,
      stats: [
        { label: 'Tempo median decision', value: fmtHours(dec.tempo.medianHours), sub: `vs ${fmtHours(dec.base.medianHours)} on Base`, accent: true },
        { label: 'Tempo top-5 posters', value: `${concT.top5TaskSharePct}%`, sub: `of ${fmtInt(tempo.totalTasks)} Tempo tasks` },
        { label: 'Formal death rate', value: `${tempo.formalDeathRatePct.toFixed(1)}% / ${base.formalDeathRatePct.toFixed(1)}%`, sub: 'Tempo vs Base dead' },
        { label: '7d paid volume', value: `${snapshot.diagnostics.growth.metrics[3]?.deltaPct >= 0 ? '+' : ''}${snapshot.diagnostics.growth.metrics[3]?.deltaPct ?? 0}%`, sub: 'vs prior 7 complete days' },
      ],
    },
    {
      slug: 'activity',
      plateCode: 'PLATE 05',
      viewLabel: 'Activity & Feed',
      headlineBefore: 'When agents ',
      headlineAccent: 'work',
      headlineAfter: ' most.',
      subtitle: 'UTC hour-of-week cadence, task mode density, and live market event stream.',
      graphicSvg: `
        <rect x="772" y="160" width="364" height="178" rx="4" fill="#181512" fill-opacity="0.9" stroke="#453E37" stroke-width="1.2" />
        <text x="790" y="184" fill="#B0A79D" font-family="Departure Mono" font-size="11.5">UTC HOUR-OF-WEEK (30D)</text>
        ${buildMiniHeatmapSvg(snapshot.heatmaps.hourOfWeek['30d'], 790, 198, 11, 14, 3)}`,
      stats: [
        { label: 'Peak UTC window', value: peak30 ? `${peak30.dayLabel} ${String(peak30.hourUtc).padStart(2, '0')}:00` : 'n/a', sub: peak30 ? `${fmtInt(peak30.count)} events in 30d` : '', accent: true },
        { label: 'Live feed cadence', value: `${snapshot.activityFeed.summary.eventsPerHour}/hr`, sub: `${snapshot.activityFeed.summary.uniqueActors} actors in ${snapshot.activityFeed.summary.spanHours}h` },
        { label: 'Bounty mode share', value: `${Math.round((((snapshot.breakdowns.platform.mode || []).find((m) => m.mode === 'bounty')?.count || 0) / Math.max(1, p.totalTasksBreakdown)) * 100)}%`, sub: `${fmtInt((snapshot.breakdowns.platform.mode || []).find((m) => m.mode === 'bounty')?.count || 0)} bounty tasks` },
      ],
    },
    {
      slug: 'chains',
      plateCode: 'PLATE 06',
      viewLabel: 'Chains & Posters',
      headlineBefore: 'Tempo OUSD and ',
      headlineAccent: 'Base',
      headlineAfter: ' USDC.',
      subtitle: 'Dual-chain settlement comparison and weekly distinct task posters.',
      graphicSvg: `
        <rect x="802" y="150" width="334" height="200" rx="4" fill="#181512" fill-opacity="0.88" stroke="#453E37" stroke-width="1.2" />
        <text x="822" y="174" fill="#B0A79D" font-family="Departure Mono" font-size="11.5">LAST 10 WEEKS (TEMPO + BASE)</text>
        ${buildLiveMiniChainsGraphic(weeks, 822, 192, 294, 142)}`,
      stats: [
        { label: 'Tempo public tasks', value: fmtInt(tempo.totalTasks), sub: `${fmtInt(tempo.paidWorkers)} paid · ${fmtUsd(tempo.rewardCompletedUsd)}`, accent: true },
        { label: 'Base public tasks', value: fmtInt(base.totalTasks), sub: `${fmtInt(base.paidWorkers)} paid · ${fmtUsd(base.rewardCompletedUsd)}` },
        { label: 'Distinct posters (wk)', value: fmtInt(latestWk.combinedDistinctPosters), sub: `Week of ${latestWk.week}` },
        { label: 'Tempo weekly share', value: `${Math.round((latestWk.tempoTasks / Math.max(1, latestWk.totalTasks)) * 100)}%`, sub: `${latestWk.tempoTasks} of ${latestWk.totalTasks} tasks` },
      ],
    },
    {
      slug: 'methods',
      plateCode: 'PLATE 07',
      viewLabel: 'Methods & Audit',
      headlineBefore: 'Every number ',
      headlineAccent: 'verifiable',
      headlineAfter: '.',
      subtitle: 'Server-fetched, cached >= 60s, refreshed every 30 min from public Taskmarket APIs.',
      graphicSvg: '',
      stats: [
        { label: 'Endpoints audited', value: '6 core', sub: 'Tempo 4217 + Base 8453', accent: true },
        { label: 'Snapshot requests', value: fmtInt(snapshot.meta.apiRequests), sub: `Fetched in ${(snapshot.meta.fetchDurationMs / 1000).toFixed(1)}s` },
        { label: 'License & deploy', value: 'MIT', sub: 'Zero login · Zero tracking' },
      ],
    },
  ];

  const written = [];
  for (const card of cards) {
    const svg = renderCardSvg({ lockupDataUri, plateDataUri, asOf, ...card });
    const resvg = new Resvg(svg, {
      fitTo: { mode: 'width', value: 1200 },
      font: {
        fontFiles,
        loadSystemFonts: false,
        defaultFontFamily: 'Inter Tight',
      },
    });
    const pngData = resvg.render();
    const pngBuffer = pngData.asPng();
    const outPath = path.join(outDir, `${card.slug}.png`);
    await fs.writeFile(outPath, pngBuffer);
    written.push({ slug: card.slug, path: outPath, bytes: pngBuffer.length });
  }
  return written;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const snap = JSON.parse(await fs.readFile(path.join(ROOT, 'data', 'snapshot.json'), 'utf8'));
  const outDir = path.join(ROOT, 'dist', 'og');
  const results = await generateAllOgCards(snap, outDir);
  console.log(`Generated ${results.length} OG PNG cards in ${outDir}:`);
  for (const r of results) {
    console.log(`  - ${r.slug}.png (${Math.round(r.bytes / 1024)} KB)`);
  }
}
