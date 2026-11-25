import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from '../server.mjs';
import { computeGini, computeHhi, isoWeekMonday, microsToUsd, shortAddr } from '../scripts/fetch-snapshot.mjs';
import { buildWebMcpTools, filterActivityItems, initWebMcp } from '../src/js/webmcp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

test('utility math helpers behave deterministically', () => {
  assert.equal(microsToUsd('50000000'), 50);
  assert.equal(microsToUsd('200400'), 0.2004);
  assert.equal(shortAddr('0xEeCD138212Fa1220627C9A3081f770C1b162a5E2'), '0xEeCD...a5E2');
  assert.equal(isoWeekMonday('2026-11-25T00:15:00Z'), '2026-11-23');
  assert.equal(computeHhi([50, 50]), 5000);
  assert.equal(Math.round(computeGini([1, 1, 1, 1]) * 100), 0);
});

test('snapshot.json exists and passes Part 1 data integrity checks', async () => {
  const raw = await fs.readFile(path.join(DIST, 'data', 'snapshot.json'), 'utf8');
  const snap = JSON.parse(raw);

  assert.ok(snap.meta?.fetchedAt && !Number.isNaN(Date.parse(snap.meta.fetchedAt)), 'valid ISO fetchedAt');
  assert.ok(snap.headline.platform.registeredWorkers > 0, 'registeredWorkers positive');
  assert.ok(snap.headline.tempo.totalTasks > 0, 'Tempo tasks loaded');
  assert.ok(snap.headline.base.totalTasks > 0, 'Base tasks loaded');

  // Verify live open tasks match Tempo + Base sum within +/- 2 (minor timing skew between endpoints)
  const combinedLiveOpen = snap.headline.tempo.liveOpenTasks + snap.headline.base.liveOpenTasks;
  assert.ok(
    Math.abs(combinedLiveOpen - snap.headline.platform.openTasks) <= 3,
    `openTasks (${snap.headline.platform.openTasks}) should match Tempo+Base live open (${combinedLiveOpen})`
  );

  // Verify Capital Flow conservation across all 3 columns
  for (const scope of ['all', 'tempo', 'base']) {
    const flow = snap.capitalFlow[scope];
    const colSum = (c) =>
      Math.round(flow.nodes.filter((n) => n.col === c).reduce((s, n) => s + n.usd, 0) * 100) / 100;
    const c0 = colSum(0);
    const c1 = colSum(1);
    const c2 = colSum(2);
    assert.ok(Math.abs(c0 - c1) < 0.25, `${scope}: col0 (${c0}) === col1 (${c1})`);
    assert.ok(Math.abs(c1 - c2) < 0.25, `${scope}: col1 (${c1}) === col2 (${c2})`);
  }

  // Verify required minimum data sections exist
  assert.ok(snap.timeSeries.day['7d'].length > 0 && snap.timeSeries.day['30d'].length > 0);
  assert.ok(snap.timeSeries.week.all.length > 0);
  assert.ok(snap.heatmaps.hourOfWeek['30d'].cells.length > 0);
  assert.ok(snap.heatmaps.mode['30d'].cells.length > 0);
  assert.ok(snap.activityFeed.recent.length > 0);
  assert.ok(snap.weeklyPostersAndChains.length > 0);
  assert.ok(snap.swarmConvergence.tasks.length > 0);
  assert.ok(snap.diagnostics.timeToDecision.all.n > 0);
});

test('all 7 views and 7 live 1200x630 OG PNG cards are built cleanly and obey rules', async () => {
  const routes = [
    { file: 'index.html', og: 'overview.png' },
    { file: 'flow/index.html', og: 'flow.png' },
    { file: 'swarm/index.html', og: 'swarm.png' },
    { file: 'insights/index.html', og: 'insights.png' },
    { file: 'activity/index.html', og: 'activity.png' },
    { file: 'chains/index.html', og: 'chains.png' },
    { file: 'methods/index.html', og: 'methods.png' },
  ];

  const bannedPhrases = [
    'revolutionary',
    'game-changing',
    'the future of work',
    'insane',
    '10x',
    'passive income',
    'earn while you sleep',
    'get rich',
    'guaranteed',
    'price prediction',
    'to the moon',
    'airdrop',
    'token launch',
    'ai will replace',
  ];

  for (const r of routes) {
    const html = await fs.readFile(path.join(DIST, r.file), 'utf8');
    assert.match(html, /Data as of \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC/, `${r.file} shows Data as of timestamp`);
    assert.match(html, /Made for a paid Taskmarket bounty/i, `${r.file} has bounty footer disclaimer`);
    assert.match(html, /not an official Taskmarket product/i, `${r.file} states unofficial status`);
    assert.match(html, new RegExp(`og/${r.og}`), `${r.file} links dedicated OG image ${r.og}`);
    assert.doesNotMatch(html, /window\.ethereum|walletconnect|gtag\(|plausible\.io|analytics\.js/i, `${r.file} has no wallet/tracking`);
    for (const phrase of bannedPhrases) {
      assert.ok(!html.toLowerCase().includes(phrase), `${r.file} must not include banned phrase "${phrase}"`);
    }

    const png = await fs.readFile(path.join(DIST, 'og', r.og));
    assert.equal(png[0], 0x89, `${r.og} PNG signature byte 0`);
    assert.equal(png[1], 0x50, `${r.og} PNG signature byte 1`);
    assert.equal(png[2], 0x4e, `${r.og} PNG signature byte 2`);
    assert.equal(png[3], 0x47, `${r.og} PNG signature byte 3`);
    // PNG IHDR width/height at bytes 16..24
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    assert.equal(width, 1200, `${r.og} width is 1200`);
    assert.equal(height, 630, `${r.og} height is 630`);
  }

  // Ensure zero browser-side calls to api.taskmarket.dev in client JS
  for (const jsFile of ['core.js', 'charts.js', 'app.js', 'webmcp.js']) {
    const src = await fs.readFile(path.join(DIST, 'js', jsFile), 'utf8');
    assert.doesNotMatch(src, /https?:\/\/api\.taskmarket\.dev/i, `${jsFile} must never fetch api.taskmarket.dev directly`);
  }

  // Verify Modern Web & WebMCP markup + CSS guards
  const activityHtml = await fs.readFile(path.join(DIST, 'activity', 'index.html'), 'utf8');
  assert.match(activityHtml, /toolname="filter-activity-feed"/, '/activity/ includes declarative WebMCP filter form');
  assert.match(activityHtml, /toolautosubmit/, '/activity/ marks read-only filter form with toolautosubmit');

  const methodsHtml = await fs.readFile(path.join(DIST, 'methods', 'index.html'), 'utf8');
  assert.match(methodsHtml, /Agent-native access \(WebMCP\)/, '/methods/ documents WebMCP tools');
  assert.match(methodsHtml, /get_market_headline/, '/methods/ lists WebMCP tool table');

  const mainCss = await fs.readFile(path.join(DIST, 'styles', 'main.css'), 'utf8');
  assert.match(mainCss, /@view-transition\s*\{\s*navigation:\s*auto;/, 'CSS enables Cross-Document View Transitions');
  assert.match(mainCss, /content-visibility:\s*auto/, 'CSS defers off-screen below-the-fold sections');
  assert.match(mainCss, /:tool-form-active/, 'CSS styles declarative WebMCP active form state');
});

test('WebMCP imperative tools validate input, return structured payloads, and clean up via AbortSignal', async () => {
  const snap = JSON.parse(await fs.readFile(path.join(DIST, 'data', 'snapshot.json'), 'utf8'));
  let lastNavigated = null;
  const tools = buildWebMcpTools(snap, {
    baseRel: '..',
    navigate: (url) => {
      lastNavigated = url;
    },
  });

  assert.equal(tools.length, 7, 'registers 7 imperative WebMCP tools');
  const byName = new Map(tools.map((t) => [t.name, t]));

  // 1. Headline
  const headline = byName.get('get_market_headline').execute({ chain: 'tempo' });
  assert.ok(headline.asOfUtc.includes('UTC'));
  assert.ok(headline.tempo && !headline.base);
  assert.ok(byName.get('get_market_headline').execute({ chain: 'solana' }).error, 'invalid chain returns error object');

  // 2. Time series
  const ts = byName.get('get_time_series').execute({ range: '30d', bucket: 'day' });
  assert.ok(ts.pointCount > 0 && Array.isArray(ts.rows));
  assert.ok(byName.get('get_time_series').execute({ range: '5y' }).error);

  // 3. Capital flow
  const flow = byName.get('get_capital_flow').execute({ chain: 'all', topCorridors: 5 });
  assert.ok(flow.totalUsd > 0 && flow.topCorridors.length <= 5);
  assert.ok(byName.get('get_capital_flow').execute({ topCorridors: 999 }).error);

  // 4. Swarm convergence
  const swarmList = byName.get('get_swarm_convergence').execute({ limit: 3 });
  assert.ok(swarmList.tasks.length > 0 && swarmList.tasks.length <= 3);
  const firstCode = swarmList.tasks[0].referenceCode;
  const swarmDetail = byName.get('get_swarm_convergence').execute({ referenceCode: firstCode });
  assert.equal(swarmDetail.selectedTask.referenceCode, firstCode);
  assert.ok(byName.get('get_swarm_convergence').execute({ referenceCode: 'TSK-DOES-NOT-EXIST' }).error);

  // 5. Market diagnostics
  const diag = byName.get('get_market_diagnostics').execute({ topic: 'mortality', chain: 'tempo' });
  assert.ok(diag.mortality?.tempo);
  assert.ok(byName.get('get_market_diagnostics').execute({ topic: 'unknown' }).error);

  // 6. Weekly posters
  const weekly = byName.get('get_weekly_posters').execute({ weeks: 4 });
  assert.ok(weekly.weeks.length > 0 && weekly.weeks.length <= 4);

  // 7. Navigation
  const navRes = byName.get('navigate_visualizer_view').execute({ view: 'flow', chain: 'tempo' });
  assert.equal(navRes.navigated, true);
  assert.equal(lastNavigated, '../flow/?chain=tempo');
  assert.ok(byName.get('navigate_visualizer_view').execute({ view: 'admin' }).error);

  // 8. Activity filter helper (backing declarative WebMCP form)
  const filtered = filterActivityItems(snap.activityFeed.recent, { chain: 'tempo', limit: 5 });
  assert.ok(filtered.items.every((item) => item.chain.toLowerCase() === 'tempo'));

  // 9. Registration & AbortSignal teardown against mock document.modelContext
  const registeredSignals = [];
  let pagehideHandler = null;
  const mockDoc = {
    modelContext: {
      ontoolactivated: null,
      ontoolcancel: null,
      addEventListener() {},
      async registerTool(tool, opts) {
        registeredSignals.push({ name: tool.name, signal: opts?.signal });
      },
    },
  };
  const mockWin = {
    addEventListener(type, fn) {
      if (type === 'pagehide') pagehideHandler = fn;
    },
  };

  const initRes = await initWebMcp(snap, { baseRel: '.', doc: mockDoc, win: mockWin });
  assert.equal(initRes.supported, true);
  assert.equal(initRes.registered.length, 7);
  assert.equal(registeredSignals.length, 7);
  assert.equal(initRes.controller.signal.aborted, false);
  assert.equal(typeof pagehideHandler, 'function');
  pagehideHandler();
  assert.equal(initRes.controller.signal.aborted, true, 'pagehide aborts registration AbortSignal');

  // 10. Silent fallback when document.modelContext is absent
  const fallbackRes = await initWebMcp(snap, { baseRel: '.', doc: {}, win: {} });
  assert.equal(fallbackRes.supported, false);
  assert.equal(fallbackRes.registered.length, 0);
});

test('production server.mjs serves routes with Cache-Control >= 60s and healthz', async () => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const home = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(home.status, 200);
    assert.match(home.headers.get('cache-control') || '', /max-age=60/);

    const flow = await fetch(`http://127.0.0.1:${port}/flow/`);
    assert.equal(flow.status, 200);

    const snapRes = await fetch(`http://127.0.0.1:${port}/data/snapshot.json`);
    assert.equal(snapRes.status, 200);
    assert.match(snapRes.headers.get('cache-control') || '', /max-age=60/);
    const snapJson = await snapRes.json();
    assert.ok(snapJson.meta.fetchedAt);

    const health = await fetch(`http://127.0.0.1:${port}/healthz`);
    assert.equal(health.status, 200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
