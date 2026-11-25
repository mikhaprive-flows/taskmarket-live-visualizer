/**
 * Production zero-dependency Node.js server for Taskmarket Live Visualizer.
 * - Ensures dist/ exists and refreshes data from https://api.taskmarket.dev
 *   on a background schedule (default every 30 minutes, <= 1 hour requirement).
 * - Serves static HTML, JS, CSS, OG PNGs, and /data/snapshot.json with
 *   Cache-Control >= 60s and gzip compression.
 * - Read-only, zero cookies, zero tracking, zero auth.
 */

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { fetchAndBuildSnapshot } from './scripts/fetch-snapshot.mjs';
import { buildSite } from './scripts/build.mjs';

const gzip = promisify(zlib.gzip);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(__dirname, 'dist');

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';
const REFRESH_MINUTES = Math.max(5, Number(process.env.REFRESH_INTERVAL_MINUTES || 30));
const CACHE_MAX_AGE = Math.max(60, Number(process.env.CACHE_MAX_AGE_SECONDS || 60));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.txt': 'text/plain; charset=utf-8',
};

const COMPRESSIBLE = new Set(['.html', '.css', '.js', '.mjs', '.json', '.svg', '.txt']);

let lastRefreshedAt = null;
let refreshing = false;

async function refreshNow() {
  if (refreshing) return;
  refreshing = true;
  try {
    const snap = await fetchAndBuildSnapshot({ writeDisk: true });
    await buildSite({ snapshot: snap });
    lastRefreshedAt = snap.meta.fetchedAt;
    console.log(`[refresh] Snapshot & static pages rebuilt as of ${lastRefreshedAt}`);
  } catch (err) {
    console.error('[refresh] Retained previous snapshot after fetch error:', err.message);
  } finally {
    refreshing = false;
  }
}

async function resolveFilePath(urlPathname) {
  const clean = decodeURIComponent(urlPathname.split('?')[0]);
  if (clean === '/api/snapshot.json') {
    return path.join(DIST_DIR, 'data', 'snapshot.json');
  }
  const normalized = path.posix.normalize(clean).replace(/^(\.\.(\/|\\|$))+/, '');
  let target = path.join(DIST_DIR, normalized);
  try {
    const stat = await fs.stat(target);
    if (stat.isDirectory()) {
      target = path.join(target, 'index.html');
    }
    return target;
  } catch {
    const asDirIndex = path.join(DIST_DIR, normalized, 'index.html');
    try {
      await fs.access(asDirIndex);
      return asDirIndex;
    } catch {
      return null;
    }
  }
}

export function createServer() {
  return http.createServer(async (req, res) => {
    if (!req.url || (req.method !== 'GET' && req.method !== 'HEAD')) {
      res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Method Not Allowed');
      return;
    }

    const pathname = req.url.split('?')[0];
    if (pathname === '/healthz') {
      const payload = JSON.stringify({
        ok: true,
        lastRefreshedAt,
        refreshIntervalMinutes: REFRESH_MINUTES,
        cacheMaxAgeSeconds: CACHE_MAX_AGE,
      });
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(req.method === 'HEAD' ? undefined : payload);
      return;
    }

    const filePath = await resolveFilePath(pathname);
    if (!filePath || !filePath.startsWith(DIST_DIR)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }

    try {
      const raw = await fs.readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const mime = MIME[ext] || 'application/octet-stream';
      const isImmutableFont = ext === '.woff2' || ext === '.ttf' || ext === '.otf';
      const cacheControl = isImmutableFont
        ? 'public, max-age=86400, immutable'
        : `public, max-age=${CACHE_MAX_AGE}, stale-while-revalidate=300`;

      const headers = {
        'Content-Type': mime,
        'Cache-Control': cacheControl,
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
      };

      const acceptsGzip = String(req.headers['accept-encoding'] || '').includes('gzip');
      if (acceptsGzip && COMPRESSIBLE.has(ext) && raw.length > 1024) {
        const zipped = await gzip(raw);
        headers['Content-Encoding'] = 'gzip';
        headers.Vary = 'Accept-Encoding';
        headers['Content-Length'] = zipped.length;
        res.writeHead(200, headers);
        res.end(req.method === 'HEAD' ? undefined : zipped);
      } else {
        headers['Content-Length'] = raw.length;
        res.writeHead(200, headers);
        res.end(req.method === 'HEAD' ? undefined : raw);
      }
    } catch {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Internal Server Error');
    }
  });
}

async function main() {
  // Ensure dist/snapshot exists on startup
  try {
    const existing = JSON.parse(await fs.readFile(path.join(DIST_DIR, 'data', 'snapshot.json'), 'utf8'));
    lastRefreshedAt = existing?.meta?.fetchedAt || null;
    const ageMin = lastRefreshedAt ? (Date.now() - Date.parse(lastRefreshedAt)) / 60_000 : Infinity;
    if (ageMin > REFRESH_MINUTES) {
      await refreshNow();
    }
  } catch {
    await refreshNow();
  }

  const server = createServer();
  server.listen(PORT, HOST, () => {
    console.log(
      `Taskmarket Live Visualizer serving http://${HOST}:${PORT} | data as of ${lastRefreshedAt} | refresh every ${REFRESH_MINUTES}m | Cache-Control max-age=${CACHE_MAX_AGE}s`
    );
  });

  const interval = setInterval(() => {
    refreshNow();
  }, REFRESH_MINUTES * 60_000);
  interval.unref();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('Server boot failed:', err);
    process.exitCode = 1;
  });
}
