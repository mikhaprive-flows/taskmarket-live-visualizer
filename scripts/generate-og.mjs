/**
 * Generates live 1200x630 Brand Kit OG share cards (one per view) from data/snapshot.json
 * using @resvg/resvg-js and Taskmarket's official SIL OFL fonts + unmodified lockup.
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
  // Exclude partial trailing UTC day so the sparkline reflects complete 24h periods
  const complete = series.length > 2 ? series.slice(0, -1) : series;
  const pts = complete.slice(-14);
  if (pts.length < 2) return { area: '', line: '', dots: '' };
  const maxVal = Math.max(1, ...pts.map((p) => Number(p.activeAgents || 0)));
  const minVal = Math.min(...pts.map((p) => Number(p.activeAgents || 0)));
  const span = Math.max(1, maxVal - minVal * 0.6);
  const coords = pts.map((p, i) => {
    const x = x0 + (i / (pts.length - 1)) * w;
    const norm = (Number(p.activeAgents || 0) - minVal * 0.6) / span;
    const y = y0 + h - Math.max(0.05, Math.min(0.98, norm)) * h;
    return { x, y };
  });
  const line = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const area = `${line} L${(x0 + w).toFixed(1)},${(y0 + h).toFixed(1)} L${x0.toFixed(1)},${(y0 + h).toFixed(1)} Z`;
  const last = coords[coords.length - 1];
  const dots = `<circle cx="${last.x.toFixed(1)}" cy="${last.y.toFixed(1)}" r="5" fill="#E74079" stroke="#FFF6E8" stroke-width="2" />`;
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
      let fill = '#221E1A';
      if (t > 0.8) fill = '#E74079';
      else if (t > 0.55) fill = '#B0315D';
      else if (t > 0.3) fill = '#6E223B';
      else if (t > 0.08) fill = '#3E1C27';
      const x = x0 + col * (cellW + gap);
      const y = y0 + r * (cellH + gap);
      rects.push(`<rect x="${x}" y="${y}" width="${cellW}" height="${cellH}" rx="3" fill="${fill}" />`);
    }
  }
  return rects.join('');
}

function buildMiniFlowGraphic(x0, y0, w, h) {
  const curves = [
    { y1: y0 + 22, y2: y0 + 50, sw: 18, c: '#E74079', op: 0.72 },
    { y1: y0 + 56, y2: y0 + 34, sw: 13, c: '#D9A097', op: 0.65 },
    { y1: y0 + 86, y2: y0 + 104, sw: 16, c: '#E74079', op: 0.52 },
    { y1: y0 + 114, y2: y0 + 78, sw: 10, c: '#EFE9E2', op: 0.36 },
    { y1: y0 + 142, y2: y0 + 142, sw: 14, c: '#D9A097', op: 0.52 },
  ];
  const mx = x0 + w * 0.5;
  return [
    `<rect x="${x0}" y="${y0 + 10}" width="10" height="32" rx="3" fill="#EFE9E2" />`,
    `<rect x="${x0}" y="${y0 + 48}" width="10" height="24" rx="3" fill="#D9A097" />`,
    `<rect x="${x0}" y="${y0 + 78}" width="10" height="30" rx="3" fill="#E74079" />`,
    `<rect x="${x0}" y="${y0 + 114}" width="10" height="40" rx="3" fill="#B0A79D" />`,
    ...curves.map(
      (k) =>
        `<path d="M${x0 + 12},${k.y1} C${mx},${k.y1} ${mx},${k.y2} ${x0 + w - 12},${k.y2}" fill="none" stroke="${k.c}" stroke-width="${k.sw}" stroke-opacity="${k.op}" stroke-linecap="round" />`
    ),
    `<rect x="${x0 + w - 10}" y="${y0 + 18}" width="10" height="44" rx="3" fill="#E74079" />`,
    `<rect x="${x0 + w - 10}" y="${y0 + 68}" width="10" height="44" rx="3" fill="#D9A097" />`,
    `<rect x="${x0 + w - 10}" y="${y0 + 118}" width="10" height="36" rx="3" fill="#EFE9E2" />`,
  ].join('');
}

function buildMiniSwarmGraphic(cx, cy) {
  const rings = [28, 52, 76, 98];
  const dots = [
    [0.2, 30, true], [1.4, 34, true], [2.5, 40, false], [3.7, 46, true], [4.9, 52, true],
    [0.7, 56, false], [1.9, 60, true], [3.1, 66, true], [4.3, 72, false], [5.5, 76, true],
    [0.4, 80, false], [2.2, 86, true], [3.9, 92, false], [5.1, 95, true], [1.1, 96, false],
  ];
  return [
    ...rings.map((r) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#453E37" stroke-width="1.2" stroke-dasharray="4 4" />`),
    `<circle cx="${cx}" cy="${cy}" r="12" fill="#E74079" />`,
    `<circle cx="${cx}" cy="${cy}" r="4.5" fill="#FFF6E8" />`,
    ...dots.map(([ang, r, hot]) => {
      const x = cx + Math.cos(ang) * r;
      const y = cy + Math.sin(ang) * r;
      return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${hot ? '#E74079' : '#453E37'}" stroke-opacity="${hot ? '0.28' : '0.35'}" stroke-width="1" /><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${hot ? 4.5 : 3.2}" fill="${hot ? '#FFF6E8' : '#D9A097'}" />`;
    }),
  ].join('');
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

function renderCardSvg({ lockupDataUri, viewLabel, headlineBefore, headlineAccent, headlineAfter, subtitle, stats, graphicSvg, asOf }) {
  const hasGraphic = Boolean(graphicSvg);
  const headlineSize = hasGraphic ? 60 : 76;
  const subLines = wrapLines(subtitle, hasGraphic ? 44 : 74);
  const subtitleSvg = subLines
    .map(
      (line, idx) =>
        `<text x="64" y="${(hasGraphic ? 276 : 288) + idx * 32}" fill="#B0A79D" font-family="Inter Tight" font-size="${hasGraphic ? 23 : 25}" font-weight="500">${esc(line)}</text>`
    )
    .join('\n  ');

  const statBoxes = stats
    .map((s, idx) => {
      const boxW = stats.length === 4 ? 256 : 348;
      const gap = 16;
      const x = 64 + idx * (boxW + gap);
      const y = 398;
      const valFont = String(s.value).length > 11 ? 22 : String(s.value).length > 8 ? 26 : 34;
      return `
        <g>
          <rect x="${x}" y="${y}" width="${boxW}" height="122" rx="12" fill="#221E1A" stroke="#453E37" stroke-width="1.5" />
          <text x="${x + 22}" y="${y + 38}" fill="#B0A79D" font-family="Inter Tight" font-size="18" font-weight="500">${esc(s.label)}</text>
          <text x="${x + 22}" y="${y + 84}" fill="${s.accent ? '#E74079' : '#EFE9E2'}" font-family="Departure Mono" font-size="${valFont}">${esc(s.value)}</text>
          <text x="${x + 22}" y="${y + 109}" fill="#B0A79D" font-family="Departure Mono" font-size="13">${esc(s.sub || '')}</text>
        </g>`;
    })
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="maroonGlow" cx="88%" cy="14%" r="65%">
      <stop offset="0%" stop-color="#3A1420" stop-opacity="0.95" />
      <stop offset="58%" stop-color="#3A1420" stop-opacity="0.22" />
      <stop offset="100%" stop-color="#12100E" stop-opacity="0" />
    </radialGradient>
    <radialGradient id="bottomGlow" cx="14%" cy="94%" r="48%">
      <stop offset="0%" stop-color="#3A1420" stop-opacity="0.45" />
      <stop offset="100%" stop-color="#12100E" stop-opacity="0" />
    </radialGradient>
    <linearGradient id="sparkArea" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#E74079" stop-opacity="0.32" />
      <stop offset="100%" stop-color="#E74079" stop-opacity="0" />
    </linearGradient>
    <pattern id="dotGrid" width="24" height="24" patternUnits="userSpaceOnUse">
      <rect x="0" y="0" width="2" height="2" rx="0.5" fill="#453E37" fill-opacity="0.32" />
    </pattern>
  </defs>

  <rect width="1200" height="630" fill="#12100E" />
  <rect width="1200" height="630" fill="url(#dotGrid)" />
  <rect width="1200" height="630" fill="url(#maroonGlow)" />
  <rect width="1200" height="630" fill="url(#bottomGlow)" />

  <!-- Official unmodified Taskmarket lockup (clear space >= mark height) -->
  <image href="${lockupDataUri}" x="64" y="48" width="276" height="64" preserveAspectRatio="xMinYMid meet" />

  <!-- Top-right domain & view pill -->
  <text x="1136" y="76" text-anchor="end" fill="#EFE9E2" font-family="Departure Mono" font-size="22">taskmarket.dev</text>
  <rect x="920" y="92" width="216" height="30" rx="6" fill="#221E1A" stroke="#453E37" stroke-width="1" />
  <text x="1028" y="112" text-anchor="middle" fill="#D9A097" font-family="Departure Mono" font-size="13">${esc(viewLabel.toUpperCase())}</text>

  <!-- Main serif headline with single magenta italic accent word -->
  <text x="64" y="226" fill="#EFE9E2" font-family="Instrument Serif" font-size="${headlineSize}">
    ${esc(headlineBefore)}<tspan fill="#E74079" font-style="italic">${esc(headlineAccent)}</tspan>${esc(headlineAfter)}
  </text>

  ${subtitleSvg}

  <!-- Optional right-side live data graphic -->
  ${graphicSvg || ''}

  <!-- Stat panels -->
  ${statBoxes}

  <!-- Footer bar -->
  <line x1="64" y1="552" x2="1136" y2="552" stroke="#453E37" stroke-width="1" />
  <text x="64" y="586" fill="#B0A79D" font-family="Departure Mono" font-size="14">DATA AS OF ${esc(asOf)}</text>
  <text x="1136" y="586" text-anchor="end" fill="#B0A79D" font-family="Inter Tight" font-size="15" font-weight="500">Tempo (OUSD) &amp; Base (USDC) · Unofficial bounty visualizer</text>
</svg>`;
}

export async function generateAllOgCards(snapshot, outDir) {
  await fs.mkdir(outDir, { recursive: true });
  const lockupBuf = await fs.readFile(path.join(BRAND_DIR, 'taskmarket-lockup.png'));
  const lockupDataUri = `data:image/png;base64,${lockupBuf.toString('base64')}`;
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
  const dec = snapshot.diagnostics.timeToDecision;
  const concT = snapshot.diagnostics.concentration.tempo;
  const peak30 = snapshot.heatmaps.peaks['30d']?.peak;
  const weeks = snapshot.weeklyPostersAndChains;
  const latestWk = weeks[weeks.length - 1] || { combinedDistinctPosters: 0, tempoTasks: 0, totalTasks: 1 };
  const spark = buildSparklinePaths(snapshot.timeSeries.day['30d'] || [], 816, 178, 320, 148);

  const cards = [
    {
      slug: 'overview',
      viewLabel: 'Live Overview',
      headlineBefore: 'The live ',
      headlineAccent: 'pulse',
      headlineAfter: ' of Taskmarket.',
      subtitle: 'Real-time market volume, active agents, and settlements on Tempo and Base.',
      graphicSvg: `
        <rect x="794" y="152" width="342" height="196" rx="12" fill="#221E1A" fill-opacity="0.88" stroke="#453E37" stroke-width="1.2" />
        <text x="816" y="176" fill="#B0A79D" font-family="Departure Mono" font-size="12">14D ACTIVE AGENTS</text>
        <path d="${spark.area}" fill="url(#sparkArea)" />
        <path d="${spark.line}" fill="none" stroke="#E74079" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
        ${spark.dots}`,
      stats: [
        { label: 'Active agents (7d)', value: fmtInt(p.activeAgents7d), sub: `${fmtInt(p.registeredWorkers)} registered` },
        { label: 'Live open tasks', value: fmtInt(p.openTasks), sub: `${tempo.liveOpenTasks} Tempo · ${base.liveOpenTasks} Base`, accent: true },
        { label: 'Completed tasks', value: fmtInt(p.completedTasksBreakdown), sub: `${fmtInt(p.totalTasksBreakdown)} total indexed` },
        { label: 'Public paid volume', value: fmtUsd(p.totalPublicCompletedUsd), sub: `Tempo + Base settled` },
      ],
    },
    {
      slug: 'flow',
      viewLabel: 'Capital Flow',
      headlineBefore: 'Where escrow ',
      headlineAccent: 'flows',
      headlineAfter: ' on-chain.',
      subtitle: 'Completed stablecoin volume traced from requester wallets through modes to winners.',
      graphicSvg: `
        <rect x="802" y="152" width="334" height="196" rx="12" fill="#221E1A" fill-opacity="0.88" stroke="#453E37" stroke-width="1.2" />
        <text x="822" y="176" fill="#B0A79D" font-family="Departure Mono" font-size="12">POSTERS -> MODES -> WINNERS</text>
        ${buildMiniFlowGraphic(822, 184, 294, 152)}`,
      stats: [
        { label: 'Completed volume', value: fmtUsd(flow.totalUsd), sub: `${fmtInt(flow.completedTasks)} settled tasks`, accent: true },
        { label: 'Multi-winner pools', value: fmtUsd(flow.multiWinnerUsd), sub: `${fmtInt(flow.multiWinnerTasks)} split bounties` },
        { label: 'Posters -> winners', value: `${fmtInt(flow.uniquePosters)} -> ${fmtInt(flow.uniqueSingleWinners)}`, sub: 'Unique wallets traced' },
      ],
    },
    {
      slug: 'swarm',
      viewLabel: 'Swarm Convergence',
      headlineBefore: 'How the ',
      headlineAccent: 'swarm',
      headlineAfter: ' converges.',
      subtitle: 'Exact submission arrival latency after new tasks open on-chain.',
      graphicSvg: buildMiniSwarmGraphic(992, 246),
      stats: [
        { label: 'Fastest 1st entry', value: swarm.fastestArrivalSec !== null ? `${swarm.fastestArrivalSec}s` : 'n/a', sub: 'From task creation', accent: true },
        { label: 'Median 1st arrival', value: swarm.medianFirstArrivalSec !== null ? `${swarm.medianFirstArrivalSec}s` : 'n/a', sub: `Across ${swarm.tasksTracked} active swarms` },
        { label: 'Arrivals measured', value: fmtInt(swarm.totalArrivalsMeasured), sub: 'Timestamped submissions' },
      ],
    },
    {
      slug: 'insights',
      viewLabel: 'Market Diagnostics',
      headlineBefore: 'What the ',
      headlineAccent: 'market',
      headlineAfter: ' reveals.',
      subtitle: 'Posting concentration, settlement latency, task mortality, and weekly momentum.',
      graphicSvg: '',
      stats: [
        { label: 'Tempo median decision', value: fmtHours(dec.tempo.medianHours), sub: `vs ${fmtHours(dec.base.medianHours)} on Base`, accent: true },
        { label: 'Tempo top-5 posters', value: `${concT.top5TaskSharePct}%`, sub: `of ${fmtInt(tempo.totalTasks)} Tempo tasks` },
        { label: 'Formal death rate', value: `${tempo.formalDeathRatePct.toFixed(1)}% / ${base.formalDeathRatePct.toFixed(1)}%`, sub: 'Tempo vs Base dead' },
        { label: '7d paid volume', value: `${snapshot.diagnostics.growth.metrics[3]?.deltaPct >= 0 ? '+' : ''}${snapshot.diagnostics.growth.metrics[3]?.deltaPct ?? 0}%`, sub: 'vs prior 7 complete days' },
      ],
    },
    {
      slug: 'activity',
      viewLabel: 'Activity & Feed',
      headlineBefore: 'When agents ',
      headlineAccent: 'work',
      headlineAfter: ' most.',
      subtitle: 'UTC hour-of-week cadence, task mode density, and live market event stream.',
      graphicSvg: `
        <rect x="772" y="164" width="364" height="172" rx="12" fill="#221E1A" stroke="#453E37" stroke-width="1.2" />
        <text x="790" y="188" fill="#B0A79D" font-family="Departure Mono" font-size="12">UTC HOUR-OF-WEEK (30D)</text>
        ${buildMiniHeatmapSvg(snapshot.heatmaps.hourOfWeek['30d'], 790, 200, 11, 14, 3)}`,
      stats: [
        { label: 'Peak UTC window', value: peak30 ? `${peak30.dayLabel} ${String(peak30.hourUtc).padStart(2, '0')}:00` : 'n/a', sub: peak30 ? `${fmtInt(peak30.count)} events in 30d` : '', accent: true },
        { label: 'Live feed cadence', value: `${snapshot.activityFeed.summary.eventsPerHour}/hr`, sub: `${snapshot.activityFeed.summary.uniqueActors} actors in ${snapshot.activityFeed.summary.spanHours}h` },
        { label: 'Bounty mode share', value: `${Math.round((((snapshot.breakdowns.platform.mode || []).find((m) => m.mode === 'bounty')?.count || 0) / Math.max(1, p.totalTasksBreakdown)) * 100)}%`, sub: `${fmtInt((snapshot.breakdowns.platform.mode || []).find((m) => m.mode === 'bounty')?.count || 0)} bounty tasks` },
      ],
    },
    {
      slug: 'chains',
      viewLabel: 'Chains & Posters',
      headlineBefore: 'Tempo OUSD and ',
      headlineAccent: 'Base',
      headlineAfter: ' USDC.',
      subtitle: 'Dual-chain settlement comparison and weekly distinct task posters.',
      graphicSvg: '',
      stats: [
        { label: 'Tempo public tasks', value: fmtInt(tempo.totalTasks), sub: `${fmtInt(tempo.paidWorkers)} paid · ${fmtUsd(tempo.rewardCompletedUsd)}`, accent: true },
        { label: 'Base public tasks', value: fmtInt(base.totalTasks), sub: `${fmtInt(base.paidWorkers)} paid · ${fmtUsd(base.rewardCompletedUsd)}` },
        { label: 'Distinct posters (wk)', value: fmtInt(latestWk.combinedDistinctPosters), sub: `Week of ${latestWk.week}` },
        { label: 'Tempo weekly share', value: `${Math.round((latestWk.tempoTasks / Math.max(1, latestWk.totalTasks)) * 100)}%`, sub: `${latestWk.tempoTasks} of ${latestWk.totalTasks} tasks` },
      ],
    },
    {
      slug: 'methods',
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
    const svg = renderCardSvg({ lockupDataUri, asOf, ...card });
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
