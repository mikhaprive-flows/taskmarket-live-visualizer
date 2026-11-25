/**
 * Read-only WebMCP tool suite for Taskmarket Live Visualizer.
 * Exposes structured client-side market queries over the already-loaded same-origin
 * snapshot.json using document.modelContext.registerTool() with AbortSignal cleanup.
 * Silently no-ops on browsers without WebMCP support. Zero external network calls.
 */

import { fmtUtc } from './core.js';

const CHAINS = ['all', 'tempo', 'base'];
const RANGES = ['7d', '30d', '90d', 'all'];
const BUCKETS = ['day', 'week'];
const DIAGNOSTIC_TOPICS = ['all', 'growth', 'concentration', 'latency', 'mortality'];
const FEED_EVENT_TYPES = ['all', 'task_submitted', 'task_created'];
const VIEWS = ['overview', 'flow', 'swarm', 'insights', 'activity', 'chains', 'methods'];

const ERROR_SCHEMA = {
  type: 'object',
  properties: {
    error: { type: 'string' },
  },
  required: ['error'],
};

export const WEBMCP_TOOL_CATALOG = [
  {
    name: 'get_market_headline',
    api: 'Imperative',
    readOnly: true,
    scope: 'All views',
    summary: 'Snapshot timestamp, registered workers, active agents (7d), open and completed tasks across Tempo and Base.',
  },
  {
    name: 'get_time_series',
    api: 'Imperative',
    readOnly: true,
    scope: 'All views',
    summary: 'Daily or weekly active agents, posted tasks, rewards put up, rewards paid, and settlement counts.',
  },
  {
    name: 'get_capital_flow',
    api: 'Imperative',
    readOnly: true,
    scope: 'All views',
    summary: 'Settled escrow totals, unique paying posters, single-award winners, split pools, and top capital corridors.',
  },
  {
    name: 'get_swarm_convergence',
    api: 'Imperative',
    readOnly: true,
    scope: 'All views',
    summary: 'Swarm arrival velocity summary and per-task submission latencies from task creation.',
  },
  {
    name: 'get_market_diagnostics',
    api: 'Imperative',
    readOnly: true,
    scope: 'All views',
    summary: '7-day growth momentum, requester concentration (HHI/Gini), time to settlement, and task mortality.',
  },
  {
    name: 'get_weekly_posters',
    api: 'Imperative',
    readOnly: true,
    scope: 'All views',
    summary: 'Weekly distinct requester wallets, task counts, and escrowed rewards across Tempo and Base.',
  },
  {
    name: 'navigate_visualizer_view',
    api: 'Imperative',
    readOnly: false,
    scope: 'All views',
    summary: 'Navigates the browser tab to a specific visualizer view with optional URL filter parameters.',
  },
  {
    name: 'filter-activity-feed',
    api: 'Declarative form',
    readOnly: true,
    scope: '/activity/',
    summary: 'Filters the server-cached activity stream by chain, event type, and keyword query.',
  },
];

function clampInt(val, fallback, min, max) {
  if (val === undefined || val === null || val === '') return fallback;
  const n = Number(val);
  if (!Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

export function filterActivityItems(items, { chain = 'all', eventType = 'all', query = '', limit = 50 } = {}) {
  const normalizedChain = String(chain || 'all').toLowerCase();
  const normalizedType = String(eventType || 'all');
  const normalizedQuery = String(query || '').trim().toLowerCase();

  const matched = (items || []).filter((item) => {
    if (normalizedChain !== 'all' && String(item.chain || '').toLowerCase() !== normalizedChain) return false;
    if (normalizedType !== 'all' && item.type !== normalizedType) return false;
    if (normalizedQuery) {
      const haystack = `${item.taskTitle || ''} ${item.actorShort || ''} ${item.chain || ''} ${item.symbol || ''} ${item.type || ''}`.toLowerCase();
      if (!haystack.includes(normalizedQuery)) return false;
    }
    return true;
  });

  return {
    totalMatched: matched.length,
    items: matched.slice(0, Math.max(1, Math.min(50, limit))),
  };
}

export function buildViewUrl(baseRel, { view, range, bucket, chain, task } = {}) {
  const cleanBase = String(baseRel || '.').replace(/\/+$/, '');
  const pathPart = view === 'overview' ? `${cleanBase}/` : `${cleanBase}/${view}/`;
  const params = new URLSearchParams();
  if (range) params.set('range', range);
  if (bucket) params.set('bucket', bucket);
  if (chain) params.set('chain', chain);
  if (task) params.set('task', task);
  const qs = params.toString();
  return qs ? `${pathPart}?${qs}` : pathPart;
}

export function buildWebMcpTools(snap, { baseRel = '.', navigate = null } = {}) {
  const asOfUtc = fmtUtc(snap?.meta?.fetchedAt);

  return [
    {
      name: 'get_market_headline',
      description: 'Retrieves headline Taskmarket metrics from the server-fetched snapshot. Use when checking overall platform size, active agents, open tasks, or Tempo vs Base totals.',
      inputSchema: {
        type: 'object',
        properties: {
          chain: {
            type: 'string',
            enum: CHAINS,
            default: 'all',
            description: 'Market slice to include alongside platform totals.',
          },
        },
      },
      outputSchema: {
        anyOf: [
          {
            type: 'object',
            properties: {
              asOfUtc: { type: 'string' },
              chain: { type: 'string' },
              platform: { type: 'object' },
              tempo: { type: 'object' },
              base: { type: 'object' },
            },
            required: ['asOfUtc', 'chain', 'platform'],
          },
          ERROR_SCHEMA,
        ],
      },
      execute(input = {}) {
        const chain = input?.chain ?? 'all';
        if (!CHAINS.includes(chain)) {
          return { error: `Unsupported chain "${chain}".`, allowedChains: CHAINS };
        }
        const out = {
          asOfUtc,
          chain,
          platform: snap.headline.platform,
        };
        if (chain === 'all' || chain === 'tempo') out.tempo = snap.headline.tempo;
        if (chain === 'all' || chain === 'base') out.base = snap.headline.base;
        return out;
      },
      annotations: {
        readOnlyHint: true,
        untrustedContentHint: false,
      },
    },

    {
      name: 'get_time_series',
      description: 'Retrieves historical Taskmarket activity buckets including active agents, tasks created, posted escrow, and paid rewards. Use to inspect trends over time.',
      inputSchema: {
        type: 'object',
        properties: {
          range: {
            type: 'string',
            enum: RANGES,
            default: '30d',
            description: 'Historical time window to query.',
          },
          bucket: {
            type: 'string',
            enum: BUCKETS,
            default: 'day',
            description: 'Aggregation interval for each data point.',
          },
        },
      },
      outputSchema: {
        anyOf: [
          {
            type: 'object',
            properties: {
              asOfUtc: { type: 'string' },
              range: { type: 'string' },
              bucket: { type: 'string' },
              pointCount: { type: 'integer' },
              rows: { type: 'array', items: { type: 'object' } },
            },
            required: ['asOfUtc', 'range', 'bucket', 'pointCount', 'rows'],
          },
          ERROR_SCHEMA,
        ],
      },
      execute(input = {}) {
        const range = input?.range ?? '30d';
        const bucket = input?.bucket ?? 'day';
        if (!RANGES.includes(range)) {
          return { error: `Unsupported range "${range}".`, allowedRanges: RANGES };
        }
        if (!BUCKETS.includes(bucket)) {
          return { error: `Unsupported bucket "${bucket}".`, allowedBuckets: BUCKETS };
        }
        const rows = snap.timeSeries?.[bucket]?.[range] || [];
        return {
          asOfUtc,
          range,
          bucket,
          pointCount: rows.length,
          rows,
        };
      },
      annotations: {
        readOnlyHint: true,
        untrustedContentHint: false,
      },
    },

    {
      name: 'get_capital_flow',
      description: 'Retrieves settled escrow capital flow totals and largest poster-to-conduit and conduit-to-winner corridors. Use to analyze where stablecoin payouts flow.',
      inputSchema: {
        type: 'object',
        properties: {
          chain: {
            type: 'string',
            enum: CHAINS,
            default: 'all',
            description: 'Chain scope for settled capital corridors.',
          },
          topCorridors: {
            type: 'integer',
            minimum: 1,
            maximum: 25,
            default: 10,
            description: 'Number of largest flow links to include.',
          },
        },
      },
      outputSchema: {
        anyOf: [
          {
            type: 'object',
            properties: {
              asOfUtc: { type: 'string' },
              scope: { type: 'string' },
              totalUsd: { type: 'number' },
              completedTasks: { type: 'integer' },
              uniquePosters: { type: 'integer' },
              uniqueSingleWinners: { type: 'integer' },
              multiWinnerUsd: { type: 'number' },
              multiWinnerTasks: { type: 'integer' },
              topCorridors: { type: 'array', items: { type: 'object' } },
            },
            required: ['asOfUtc', 'scope', 'totalUsd', 'completedTasks', 'topCorridors'],
          },
          ERROR_SCHEMA,
        ],
      },
      execute(input = {}) {
        const chain = input?.chain ?? 'all';
        if (!CHAINS.includes(chain)) {
          return { error: `Unsupported chain "${chain}".`, allowedChains: CHAINS };
        }
        const topCorridors = clampInt(input?.topCorridors, 10, 1, 25);
        if (topCorridors === null) {
          return { error: 'topCorridors must be an integer between 1 and 25.' };
        }
        const flow = snap.capitalFlow?.[chain];
        if (!flow) {
          return { error: `Capital flow scope "${chain}" is unavailable in this snapshot.` };
        }
        const nodeLabel = new Map((flow.nodes || []).map((n) => [n.id, n.label]));
        const corridors = [...(flow.links || [])]
          .sort((a, b) => Number(b.usd || 0) - Number(a.usd || 0))
          .slice(0, topCorridors)
          .map((link) => ({
            source: nodeLabel.get(link.source) || link.source,
            target: nodeLabel.get(link.target) || link.target,
            usd: link.usd,
            tasks: link.tasks,
            sharePct: flow.totalUsd > 0 ? Number(((link.usd / flow.totalUsd) * 100).toFixed(2)) : 0,
          }));
        return {
          asOfUtc,
          scope: flow.scope,
          totalUsd: flow.totalUsd,
          completedTasks: flow.completedTasks,
          uniquePosters: flow.uniquePosters,
          uniqueSingleWinners: flow.uniqueSingleWinners,
          multiWinnerUsd: flow.multiWinnerUsd,
          multiWinnerTasks: flow.multiWinnerTasks,
          topCorridors: corridors,
        };
      },
      annotations: {
        readOnlyHint: true,
        untrustedContentHint: false,
      },
    },

    {
      name: 'get_swarm_convergence',
      description: 'Retrieves agent submission arrival speed summary and high-velocity tasks from the Swarm Convergence view. Use to inspect how fast agents react to newly posted tasks.',
      inputSchema: {
        type: 'object',
        properties: {
          referenceCode: {
            type: 'string',
            description: 'Optional task reference code (for example TSK-...) to inspect individual submission arrival latencies.',
          },
          limit: {
            type: 'integer',
            minimum: 1,
            maximum: 10,
            default: 10,
            description: 'Maximum number of tracked high-velocity tasks to list when referenceCode is omitted.',
          },
        },
      },
      outputSchema: {
        anyOf: [
          {
            type: 'object',
            properties: {
              asOfUtc: { type: 'string' },
              summary: { type: 'object' },
              tasks: { type: 'array', items: { type: 'object' } },
              selectedTask: { type: 'object' },
            },
            required: ['asOfUtc', 'summary'],
          },
          ERROR_SCHEMA,
        ],
      },
      execute(input = {}) {
        const tasks = snap.swarmConvergence?.tasks || [];
        const summary = snap.swarmConvergence?.summary || {};
        if (input?.referenceCode) {
          const needle = String(input.referenceCode).trim().toUpperCase();
          const match = tasks.find((t) => String(t.referenceCode || '').toUpperCase() === needle);
          if (!match) {
            return {
              error: `Task "${input.referenceCode}" is not in the tracked swarm sample.`,
              availableReferenceCodes: tasks.map((t) => t.referenceCode),
            };
          }
          return {
            asOfUtc,
            summary,
            selectedTask: {
              referenceCode: match.referenceCode,
              title: match.title,
              chain: match.chain,
              symbol: match.symbol,
              rewardUsd: match.rewardUsd,
              submissionCount: match.submissionCount,
              firstArrivalSec: match.firstArrivalSec,
              fifthArrivalSec: match.fifthArrivalSec,
              tapVerifiedSharePct: match.tapVerifiedSharePct,
              arrivals: (match.arrivals || []).slice(0, 15),
            },
          };
        }
        const limit = clampInt(input?.limit, 10, 1, 10);
        if (limit === null) {
          return { error: 'limit must be an integer between 1 and 10.' };
        }
        return {
          asOfUtc,
          summary,
          tasks: tasks.slice(0, limit).map((t) => ({
            referenceCode: t.referenceCode,
            title: t.title,
            chain: t.chain,
            rewardUsd: t.rewardUsd,
            submissionCount: t.submissionCount,
            firstArrivalSec: t.firstArrivalSec,
            fifthArrivalSec: t.fifthArrivalSec,
            tapVerifiedSharePct: t.tapVerifiedSharePct,
          })),
        };
      },
      annotations: {
        readOnlyHint: true,
        untrustedContentHint: true,
      },
    },

    {
      name: 'get_market_diagnostics',
      description: 'Retrieves structural market diagnostics including 7-day momentum, requester concentration, settlement latency, and task mortality. Use for deep analytical questions.',
      inputSchema: {
        type: 'object',
        properties: {
          topic: {
            type: 'string',
            enum: DIAGNOSTIC_TOPICS,
            default: 'all',
            description: 'Diagnostic dimension to inspect.',
          },
          chain: {
            type: 'string',
            enum: CHAINS,
            default: 'all',
            description: 'Chain slice for concentration, latency, and mortality metrics.',
          },
        },
      },
      outputSchema: {
        anyOf: [
          {
            type: 'object',
            properties: {
              asOfUtc: { type: 'string' },
              topic: { type: 'string' },
              chain: { type: 'string' },
              growth: { type: 'object' },
              concentration: { type: 'object' },
              timeToDecision: { type: 'object' },
              mortality: { type: 'object' },
            },
            required: ['asOfUtc', 'topic', 'chain'],
          },
          ERROR_SCHEMA,
        ],
      },
      execute(input = {}) {
        const topic = input?.topic ?? 'all';
        const chain = input?.chain ?? 'all';
        if (!DIAGNOSTIC_TOPICS.includes(topic)) {
          return { error: `Unsupported topic "${topic}".`, allowedTopics: DIAGNOSTIC_TOPICS };
        }
        if (!CHAINS.includes(chain)) {
          return { error: `Unsupported chain "${chain}".`, allowedChains: CHAINS };
        }
        const diag = snap.diagnostics || {};
        const chainKey = chain === 'all' ? 'combined' : chain;
        const result = { asOfUtc, topic, chain };

        if (topic === 'all' || topic === 'growth') {
          result.growth = diag.growth;
        }
        if (topic === 'all' || topic === 'concentration') {
          result.concentration =
            chain === 'all'
              ? {
                  tempo: diag.concentration?.tempo,
                  base: diag.concentration?.base,
                  combined: diag.concentration?.combined,
                }
              : { [chain]: diag.concentration?.[chain] };
        }
        if (topic === 'all' || topic === 'latency') {
          result.timeToDecision =
            chain === 'all'
              ? diag.timeToDecision
              : { sampleNote: diag.timeToDecision?.sampleNote, [chain]: diag.timeToDecision?.[chain] };
        }
        if (topic === 'all' || topic === 'mortality') {
          result.mortality =
            chain === 'all'
              ? diag.mortality
              : { [chainKey]: diag.mortality?.[chainKey] };
        }
        return result;
      },
      annotations: {
        readOnlyHint: true,
        untrustedContentHint: false,
      },
    },

    {
      name: 'get_weekly_posters',
      description: 'Retrieves weekly counts of distinct requester wallets, posted tasks, and escrowed rewards across Tempo and Base. Use to examine chain migration or poster breadth.',
      inputSchema: {
        type: 'object',
        properties: {
          weeks: {
            type: 'integer',
            minimum: 1,
            maximum: 52,
            default: 12,
            description: 'Number of most recent active ISO weeks to return.',
          },
        },
      },
      outputSchema: {
        anyOf: [
          {
            type: 'object',
            properties: {
              asOfUtc: { type: 'string' },
              totalWeeksAvailable: { type: 'integer' },
              weeks: { type: 'array', items: { type: 'object' } },
            },
            required: ['asOfUtc', 'totalWeeksAvailable', 'weeks'],
          },
          ERROR_SCHEMA,
        ],
      },
      execute(input = {}) {
        const count = clampInt(input?.weeks, 12, 1, 52);
        if (count === null) {
          return { error: 'weeks must be an integer between 1 and 52.' };
        }
        const allWeeks = snap.weeklyPostersAndChains || [];
        return {
          asOfUtc,
          totalWeeksAvailable: allWeeks.length,
          weeks: allWeeks.slice(-count),
        };
      },
      annotations: {
        readOnlyHint: true,
        untrustedContentHint: false,
      },
    },

    {
      name: 'navigate_visualizer_view',
      description: 'Navigates the user to another Taskmarket Live Visualizer view, optionally pre-selecting view filters via URL parameters.',
      inputSchema: {
        type: 'object',
        properties: {
          view: {
            type: 'string',
            enum: VIEWS,
            description: 'Target dashboard route to open.',
          },
          range: {
            type: 'string',
            enum: RANGES,
            description: 'Optional time window parameter for Overview or Activity views.',
          },
          bucket: {
            type: 'string',
            enum: BUCKETS,
            description: 'Optional aggregation interval for Overview time series.',
          },
          chain: {
            type: 'string',
            enum: CHAINS,
            description: 'Optional chain filter for Capital Flow or Activity feed.',
          },
          task: {
            type: 'string',
            description: 'Optional task reference code to focus on the Swarm view.',
          },
        },
        required: ['view'],
      },
      execute(input = {}) {
        const view = input?.view;
        if (!VIEWS.includes(view)) {
          return { error: `Unsupported view "${view}".`, allowedViews: VIEWS };
        }
        if (input?.range && !RANGES.includes(input.range)) {
          return { error: `Unsupported range "${input.range}".`, allowedRanges: RANGES };
        }
        if (input?.bucket && !BUCKETS.includes(input.bucket)) {
          return { error: `Unsupported bucket "${input.bucket}".`, allowedBuckets: BUCKETS };
        }
        if (input?.chain && !CHAINS.includes(input.chain)) {
          return { error: `Unsupported chain "${input.chain}".`, allowedChains: CHAINS };
        }
        const targetUrl = buildViewUrl(baseRel, {
          view,
          range: input?.range,
          bucket: input?.bucket,
          chain: input?.chain,
          task: input?.task,
        });
        if (typeof navigate === 'function') {
          navigate(targetUrl);
        } else if (typeof window !== 'undefined' && window.location) {
          window.location.assign(targetUrl);
        }
        return { navigated: true, view, targetUrl };
      },
      annotations: {
        readOnlyHint: false,
        consequentialHint: false,
        untrustedContentHint: false,
      },
    },
  ];
}

export function updateWebMcpStatusBadge(supported, toolCount = 0) {
  if (typeof document === 'undefined') return;
  const el = document.getElementById('webmcp-status-pill');
  if (!el) return;
  if (supported) {
    el.textContent = `WebMCP active (${toolCount} tools registered)`;
    el.classList.add('pill-magenta');
  } else {
    el.textContent = 'Standard browser mode (silent no-op fallback)';
  }
}

/**
 * Registers all imperative WebMCP tools when document.modelContext is available,
 * attaches AbortSignal cleanup on pagehide, and wires toolactivated/toolcancel telemetry UI.
 */
export async function initWebMcp(snap, { baseRel = '.', onToolEvent = null, doc = null, win = null } = {}) {
  const targetDoc = doc ?? (typeof document !== 'undefined' ? document : null);
  const targetWin = win ?? (typeof window !== 'undefined' ? window : null);

  if (!targetDoc || !('modelContext' in targetDoc) || typeof targetDoc.modelContext?.registerTool !== 'function') {
    updateWebMcpStatusBadge(false, 0);
    return { supported: false, registered: [], controller: null };
  }

  const controller = new AbortController();
  const tools = buildWebMcpTools(snap, {
    baseRel,
    navigate: (url) => targetWin?.location?.assign?.(url),
  });

  const registered = [];
  for (const tool of tools) {
    try {
      await targetDoc.modelContext.registerTool(tool, { signal: controller.signal });
      registered.push(tool.name);
    } catch (err) {
      console.warn(`WebMCP tool registration skipped (${tool.name}):`, err);
    }
  }

  // Backward-compatible toolactivated / toolcancel listeners (Chrome 156+ on document.modelContext, earlier on window)
  if (typeof onToolEvent === 'function') {
    const bindLifecycle = (type) => {
      const eventTarget = `on${type}` in (targetDoc.modelContext ?? {}) ? targetDoc.modelContext : targetWin;
      eventTarget?.addEventListener?.(
        type,
        (event) => onToolEvent(type, event?.toolName || 'tool'),
        { signal: controller.signal }
      );
    };
    bindLifecycle('toolactivated');
    bindLifecycle('toolcancel');
  }

  // Clean up all registrations on pagehide via AbortSignal (never call removed unregisterTool)
  targetWin?.addEventListener?.(
    'pagehide',
    () => {
      controller.abort();
    },
    { once: true }
  );

  updateWebMcpStatusBadge(true, registered.length + 1);
  return { supported: true, registered, controller };
}

export { CHAINS, RANGES, BUCKETS, DIAGNOSTIC_TOPICS, FEED_EVENT_TYPES, VIEWS };
