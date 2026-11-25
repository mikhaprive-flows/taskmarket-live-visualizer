/**
 * Shared client utilities: same-origin server snapshot loader, responsive
 * single-nav popover synchronization, accessible tablist helpers, URL state,
 * and formatting. Zero direct browser calls to api.taskmarket.dev.
 */

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function fmtInt(n) {
  const v = Number(n ?? 0);
  return Number.isFinite(v) ? Math.round(v).toLocaleString('en-US') : '0';
}

export function fmtUsd(n, decimals = 2) {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return '$0.00';
  if (Math.abs(v) >= 1000 && decimals === 2) {
    return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

export function fmtPct(n, digits = 1) {
  const v = Number(n ?? 0);
  return `${v.toFixed(digits)}%`;
}

export function fmtHours(h) {
  if (h === null || h === undefined || !Number.isFinite(Number(h))) return 'n/a';
  const v = Number(h);
  if (v < 1 / 60) return `${Math.round(v * 3600)}s`;
  if (v < 1) return `${Math.round(v * 60)}m`;
  if (v < 48) return `${v.toFixed(1)}h`;
  return `${(v / 24).toFixed(1)}d`;
}

export function fmtSec(sec) {
  if (sec === null || sec === undefined || !Number.isFinite(Number(sec))) return 'n/a';
  const s = Math.round(Number(sec));
  if (s < 60) return `${s}s`;
  if (s < 3600) {
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return rem ? `${m}m ${rem}s` : `${m}m`;
  }
  const h = (s / 3600).toFixed(1);
  return `${h}h`;
}

export function fmtUtc(iso) {
  if (!iso) return 'n/a';
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

export function fmtUtcTime(iso) {
  if (!iso) return '';
  return `${iso.slice(11, 19)} UTC`;
}

export function getParam(key, fallback) {
  const u = new URL(window.location.href);
  return u.searchParams.get(key) || fallback;
}

export function setParams(updates) {
  const u = new URL(window.location.href);
  for (const [k, v] of Object.entries(updates)) {
    if (v === null || v === undefined || v === '') u.searchParams.delete(k);
    else u.searchParams.set(k, String(v));
  }
  window.history.replaceState({}, '', u.toString());
}

let toastTimer = null;
export function showToast(msg) {
  const el = document.getElementById('live-toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('is-visible');
  }, 2400);
}

/**
 * Loads the server-generated snapshot from the same origin (never api.taskmarket.dev).
 */
export async function loadSnapshot() {
  const base = document.documentElement.dataset.base || '.';
  const url = `${base}/data/snapshot.json`;
  const res = await fetch(url, { cache: 'default' });
  if (!res.ok) throw new Error(`Snapshot fetch failed (${res.status})`);
  return res.json();
}

/**
 * Implements the single-nav responsive popover pattern from modern-web-guidance (navbar):
 * - Measures inline row fit via ResizeObserver without hard-coded breakpoints.
 * - Uses setAttribute/removeAttribute("popover") rather than the IDL property.
 * - Conditionally loads @oddbird/popover-polyfill only if native Popover is absent.
 */
export async function initNavbar() {
  const header = document.querySelector('.site-header');
  const inner = header?.querySelector('.header-inner');
  const menu = document.getElementById('site-menu');
  if (!header || !inner || !menu) return;

  if (!Object.hasOwn(HTMLElement.prototype, 'popover')) {
    // Pure zero-CDN fallback when native Popover API is unavailable
    const btn = header.querySelector('.menu-button');
    btn?.addEventListener('click', () => {
      menu.classList.toggle(':popover-open');
    });
  }

  let lastHeaderWidth = 0;

  function syncLayout(force = false) {
    const currentWidth = header.clientWidth;
    const isWide = header.classList.contains('is-wide');
    if (!force && !isWide && currentWidth <= lastHeaderWidth) {
      lastHeaderWidth = currentWidth;
      return;
    }
    lastHeaderWidth = currentWidth;

    const wasOpen =
      !isWide &&
      (menu.matches?.(':popover-open') || menu.classList.contains(':popover-open'));

    header.classList.add('is-measuring');
    header.classList.add('is-wide');
    menu.removeAttribute('popover');

    const fits = inner.scrollWidth <= inner.clientWidth + 1;
    if (!fits) {
      header.classList.remove('is-wide');
      menu.setAttribute('popover', 'auto');
      if (wasOpen && typeof menu.showPopover === 'function') {
        try {
          menu.showPopover();
        } catch {
          // ignore if already open
        }
      }
    }

    requestAnimationFrame(() => {
      header.classList.remove('is-measuring');
    });
  }

  const ro = new ResizeObserver(() => syncLayout(false));
  ro.observe(header);
  ro.observe(menu);
  if (document.fonts?.ready) {
    document.fonts.ready.then(() => syncLayout(true));
  }
  syncLayout(true);
}

/**
 * Wires an accessible tablist/segmented switch with keyboard arrow navigation
 * (fallback when native focusgroup is unavailable) and automatic scroll-into-view.
 */
export function wireTablist(container, onSelect) {
  if (!container) return;
  const buttons = [...container.querySelectorAll('button[data-value]')];
  if (!buttons.length) return;

  function selectBtn(target, moveFocus = false) {
    for (const b of buttons) {
      const active = b === target;
      b.setAttribute('aria-selected', active ? 'true' : 'false');
      b.toggleAttribute('focusgroupstart', active);
      if (!Object.hasOwn(HTMLElement.prototype, 'focusGroup')) {
        b.tabIndex = active ? 0 : -1;
      }
    }
    target.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    if (moveFocus) target.focus();
    onSelect(target.dataset.value, target);
  }

  for (const b of buttons) {
    b.addEventListener('click', () => selectBtn(b, false));
    b.addEventListener('keydown', (e) => {
      const idx = buttons.indexOf(b);
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        selectBtn(buttons[(idx + 1) % buttons.length], true);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        selectBtn(buttons[(idx - 1 + buttons.length) % buttons.length], true);
      } else if (e.key === 'Home') {
        e.preventDefault();
        selectBtn(buttons[0], true);
      } else if (e.key === 'End') {
        e.preventDefault();
        selectBtn(buttons[buttons.length - 1], true);
      }
    });
  }

  // Initialize roving tabindex fallback for browsers without native focusgroup
  if (!Object.hasOwn(HTMLElement.prototype, 'focusGroup')) {
    const selected = buttons.find((b) => b.getAttribute('aria-selected') === 'true') || buttons[0];
    for (const b of buttons) {
      b.tabIndex = b === selected ? 0 : -1;
    }
  }

  return {
    setValue(val) {
      const match = buttons.find((b) => b.dataset.value === String(val));
      if (match) {
        for (const b of buttons) {
          const active = b === match;
          b.setAttribute('aria-selected', active ? 'true' : 'false');
          b.toggleAttribute('focusgroupstart', active);
          if (!Object.hasOwn(HTMLElement.prototype, 'focusGroup')) {
            b.tabIndex = active ? 0 : -1;
          }
        }
      }
    },
  };
}

export function initShareBar() {
  const copyBtn = document.getElementById('copy-view-link');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(window.location.href);
        showToast('Share link copied to clipboard.');
      } catch {
        showToast('Copy URL from address bar.');
      }
    });
  }
}

const ROUTE_ORDER = ['overview', 'flow', 'swarm', 'insights', 'activity', 'chains', 'methods'];

function routeSlugFromUrl(urlStr) {
  try {
    const pathname = new URL(urlStr).pathname.replace(/\/+$/, '');
    const lastSeg = pathname.split('/').filter(Boolean).pop() || '';
    return ROUTE_ORDER.includes(lastSeg) ? lastSeg : 'overview';
  } catch {
    return 'overview';
  }
}

/**
 * Progressive-enhancement directional Cross-Document View Transitions
 * per modern-web-guidance (cross-document-transitions).
 */
export function initViewTransitions() {
  if (typeof window === 'undefined') return;
  window.addEventListener('pagereveal', (event) => {
    if (!event.viewTransition) return;
    const fromUrl = window.navigation?.activation?.from?.url;
    if (!fromUrl) return;
    const fromIdx = ROUTE_ORDER.indexOf(routeSlugFromUrl(fromUrl));
    const toIdx = ROUTE_ORDER.indexOf(document.body?.dataset?.page || 'overview');
    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;
    event.viewTransition.types?.add?.(toIdx > fromIdx ? 'forward' : 'backward');
  });
}
