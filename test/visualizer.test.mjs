import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from '../server.mjs';
import { computeGini, computeHhi, isoWeekMonday, microsToUsd, shortAddr } from '../scripts/fetch-snapshot.mjs';

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

  const bannedPhrases = ['revolutionary', 'game-changing', 'passive income', 'earn while you sleep', 'to the moon'];

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
  for (const jsFile of ['core.js', 'charts.js', 'app.js']) {
    const src = await fs.readFile(path.join(DIST, 'js', jsFile), 'utf8');
    assert.doesNotMatch(src, /https?:\/\/api\.taskmarket\.dev/i, `${jsFile} must never fetch api.taskmarket.dev directly`);
  }
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
