// ─────────────────────────────────────────────────────────────────────────────
//  Reddit Pro — content.js  v3.0
//
//  KEY ARCHITECTURAL CHANGE (v3.0):
//  ┌─────────────────────────────────────────────────────────────────────────┐
//  │  BATCH-ISOLATED MASONRY                                                 │
//  │                                                                         │
//  │  Feed container  → display:flex (column) — batches stack sequentially   │
//  │  faceplate-batch → display:grid (masonry) — each is fully independent   │
//  │                                                                         │
//  │  Result: New batches NEVER affect the positions of existing cards.      │
//  │  Each batch is a self-contained masonry island.                         │
//  └─────────────────────────────────────────────────────────────────────────┘
//
//  CARD STABILITY SYSTEM:
//  • Cards are observed by ResizeObserver until their span stabilises
//  • Once a card's span is identical for 2+ consecutive measurements → marked
//    data-rg-stable → skipped by sweepNew() and ignored by ResizeObserver
//    callbacks (no DOM write, no cascade)
//  • sweepNew() only processes cards without data-rg-stable (infinite scroll)
//  • sweepAll() clears all stability markers (used only on nav/settings change)
// ─────────────────────────────────────────────────────────────────────────────

// ══════════════════════════════════════════════════════════════════════════════
//  1. SETTINGS STORE
// ══════════════════════════════════════════════════════════════════════════════

const DEFAULT_SETTINGS = {
  columns:       '3',
  autoFit:       false,
  masonry:       true,
  compactCards:  false,
  hidePromoted:  true,
  hideSidebar:   false,
  autoPlayAudio: true,
  hideScrollbar: true,
};

let userSettings   = { ...DEFAULT_SETTINGS };
let activeSettings = { ...DEFAULT_SETTINGS };
let storageLoaded  = false;

// ══════════════════════════════════════════════════════════════════════════════
//  2. STATIC CSS ENGINE
//  Injected once at document_start. Layout changes use CSS vars only.
//
//  v3.0 CHANGE: Feed containers are now display:flex (column).
//               Each faceplate-batch is its own independent masonry grid.
//               This is the structural guarantee that new batches can never
//               shift existing cards — they're in separate grid formatting
//               contexts with no shared grid lines.
// ══════════════════════════════════════════════════════════════════════════════

const STATIC_FORCE_CSS = `
  /* ── Reddit Pro Extension Styles v3.0 ── */

  /* ── FEED CONTAINERS ──
     If the feed uses faceplate-batch (infinite scroll), the feed is a flex column.
     If the feed does NOT use faceplate-batch, the feed ITSELF is the grid. */
  body:not([data-reddit-grid-cols="1"]) shreddit-feed:has(faceplate-batch),
  body:not([data-reddit-grid-cols="1"]) .feed-container:has(faceplate-batch),
  body:not([data-reddit-grid-cols="1"]) profile-feed:has(faceplate-batch),
  body:not([data-reddit-grid-cols="1"]) shreddit-profile-feed:has(faceplate-batch),
  body:not([data-reddit-grid-cols="1"]) shreddit-user-feed:has(faceplate-batch),
  body:not([data-reddit-grid-cols="1"]) [data-feed-type]:has(faceplate-batch),
  body:not([data-reddit-grid-cols="1"]) main > div:has(faceplate-batch) {
    display: flex !important;
    flex-direction: column !important;
    gap: var(--reddit-batch-gap, 16px) !important;
    align-items: stretch !important;
    width: 100% !important;
    max-width: 100% !important;
    box-sizing: border-box !important;
    padding: 0 !important;
    margin: 0 !important;
  }

  /* ── THE MASONRY GRID ──
     Applied to either the faceplate-batch (if present) OR the feed container itself. */
  body:not([data-reddit-grid-cols="1"]) shreddit-feed > faceplate-batch,
  body:not([data-reddit-grid-cols="1"]) .feed-container > faceplate-batch,
  body:not([data-reddit-grid-cols="1"]) profile-feed > faceplate-batch,
  body:not([data-reddit-grid-cols="1"]) shreddit-profile-feed > faceplate-batch,
  body:not([data-reddit-grid-cols="1"]) shreddit-user-feed > faceplate-batch,
  body:not([data-reddit-grid-cols="1"]) [data-feed-type] > faceplate-batch,
  body:not([data-reddit-grid-cols="1"]) shreddit-feed:not(:has(faceplate-batch)),
  body:not([data-reddit-grid-cols="1"]) .feed-container:not(:has(faceplate-batch)),
  body:not([data-reddit-grid-cols="1"]) profile-feed:not(:has(faceplate-batch)),
  body:not([data-reddit-grid-cols="1"]) shreddit-profile-feed:not(:has(faceplate-batch)),
  body:not([data-reddit-grid-cols="1"]) shreddit-user-feed:not(:has(faceplate-batch)),
  body:not([data-reddit-grid-cols="1"]) [data-feed-type]:not(:has(faceplate-batch)),
  body:not([data-reddit-grid-cols="1"]) main > div:not(:has(faceplate-batch)):has(> article),
  body:not([data-reddit-grid-cols="1"]) main > div:not(:has(faceplate-batch)):has(> shreddit-post) {
    display: grid !important;
    grid-template-columns: repeat(var(--reddit-cols, 3), minmax(0, 1fr)) !important;
    grid-auto-rows: 5px !important;
    grid-auto-flow: row dense !important;
    column-gap: var(--reddit-col-gap, 8px) !important;
    row-gap: 0 !important;
    align-items: start !important;
    width: 100% !important;
    box-sizing: border-box !important;
    padding: 0 !important;
    margin: 0 !important;
  }

  /* ── NON-MASONRY MODE ── */
  body:not([data-reddit-grid-cols="1"])[data-reddit-grid-masonry="false"] shreddit-feed > faceplate-batch,
  body:not([data-reddit-grid-cols="1"])[data-reddit-grid-masonry="false"] .feed-container > faceplate-batch,
  body:not([data-reddit-grid-cols="1"])[data-reddit-grid-masonry="false"] profile-feed > faceplate-batch,
  body:not([data-reddit-grid-cols="1"])[data-reddit-grid-masonry="false"] shreddit-profile-feed > faceplate-batch,
  body:not([data-reddit-grid-cols="1"])[data-reddit-grid-masonry="false"] shreddit-user-feed > faceplate-batch,
  body:not([data-reddit-grid-cols="1"])[data-reddit-grid-masonry="false"] [data-feed-type] > faceplate-batch,
  body:not([data-reddit-grid-cols="1"])[data-reddit-grid-masonry="false"] shreddit-feed:not(:has(faceplate-batch)),
  body:not([data-reddit-grid-cols="1"])[data-reddit-grid-masonry="false"] .feed-container:not(:has(faceplate-batch)),
  body:not([data-reddit-grid-cols="1"])[data-reddit-grid-masonry="false"] profile-feed:not(:has(faceplate-batch)),
  body:not([data-reddit-grid-cols="1"])[data-reddit-grid-masonry="false"] shreddit-profile-feed:not(:has(faceplate-batch)),
  body:not([data-reddit-grid-cols="1"])[data-reddit-grid-masonry="false"] shreddit-user-feed:not(:has(faceplate-batch)),
  body:not([data-reddit-grid-cols="1"])[data-reddit-grid-masonry="false"] [data-feed-type]:not(:has(faceplate-batch)) {
    grid-auto-rows: auto !important;
    column-gap: 4px !important;
    row-gap: 4px !important;
  }

  /* ── INNER BATCH WRAPPERS: Flatten div wrappers inside batches ──
     Some batches wrap posts in an extra div — make it transparent to the grid */
  body:not([data-reddit-grid-cols="1"]) shreddit-feed > faceplate-batch > div,
  body:not([data-reddit-grid-cols="1"]) .feed-container > faceplate-batch > div,
  body:not([data-reddit-grid-cols="1"]) profile-feed > faceplate-batch > div,
  body:not([data-reddit-grid-cols="1"]) shreddit-profile-feed > faceplate-batch > div,
  body:not([data-reddit-grid-cols="1"]) shreddit-user-feed > faceplate-batch > div,
  body:not([data-reddit-grid-cols="1"]) [data-feed-type] > faceplate-batch > div {
    display: contents !important;
  }

  /* ── VIRTUAL SCROLLER GUARD: Empty batches keep their box ──
     Reddit's IntersectionObserver needs empty placeholder batches to keep
     their bounding box so infinite scroll triggers at the right scroll position */
  body:not([data-reddit-grid-cols="1"]) faceplate-batch:empty {
    display: block !important;
    min-height: 1px !important;
    width: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
  }

  /* ── POST CARD RESET ── */
  shreddit-post,
  shreddit-feed article,
  shreddit-feed shreddit-post-placeholder,
  faceplate-batch > shreddit-post,
  faceplate-batch > article,
  profile-feed shreddit-post,
  profile-feed article,
  shreddit-profile-feed shreddit-post,
  shreddit-profile-feed article,
  shreddit-user-feed shreddit-post,
  shreddit-user-feed article,
  [data-feed-type] shreddit-post,
  [data-feed-type] article,
  .Post {
    margin: 0 !important;
    padding: 0 !important;
    flex-shrink: 0 !important;
    width: 100% !important;
    min-width: 0 !important;
    max-width: 100% !important;
    box-sizing: border-box !important;
  }

  /* Glassmorphic card visuals */
  body:not([data-reddit-grid-cols="1"]) shreddit-post,
  body:not([data-reddit-grid-cols="1"]) .Post {
    background: rgba(255,255,255,0.04) !important;
    backdrop-filter: blur(12px) saturate(140%) !important;
    -webkit-backdrop-filter: blur(12px) saturate(140%) !important;
    border-radius: 12px !important;
    overflow: hidden !important;
  }

  /* Prevent media blowout */
  body:not([data-reddit-grid-cols="1"]) shreddit-post img,
  body:not([data-reddit-grid-cols="1"]) shreddit-post video,
  body:not([data-reddit-grid-cols="1"]) shreddit-post iframe,
  body:not([data-reddit-grid-cols="1"]) shreddit-player,
  body:not([data-reddit-grid-cols="1"]) .shreddit-player-wrapper,
  body:not([data-reddit-grid-cols="1"]) gallery-carousel {
    max-width: 100% !important;
    width: 100% !important;
    min-width: 0 !important;
  }

  /* ACTION BAR PROTECTION */
  body:not([data-reddit-grid-cols="1"]) shreddit-post::part(action-bar),
  body:not([data-reddit-grid-cols="1"]) shreddit-post [slot="action-bar"],
  body:not([data-reddit-grid-cols="1"]) shreddit-post-action-bar,
  body:not([data-reddit-grid-cols="1"]) [data-post-click-location="action-bar"] {
    display: flex !important;
    flex-direction: row !important;
    flex-wrap: nowrap !important;
    align-items: center !important;
    gap: 4px !important;
    overflow: hidden !important;
    width: 100% !important;
    min-width: 0 !important;
  }

  body:not([data-reddit-grid-cols="1"]) shreddit-post::part(action-bar) > *,
  body:not([data-reddit-grid-cols="1"]) shreddit-post [slot="action-bar"] > *,
  body:not([data-reddit-grid-cols="1"]) shreddit-post-action-bar > *,
  body:not([data-reddit-grid-cols="1"]) [data-post-click-location="action-bar"] > * {
    flex-shrink: 0 !important;
  }

  body:not([data-reddit-grid-cols="1"]) shreddit-post shreddit-vote-buttons,
  body:not([data-reddit-grid-cols="1"]) shreddit-post vote-buttons,
  body:not([data-reddit-grid-cols="1"]) shreddit-post [data-post-click-location="vote"],
  body:not([data-reddit-grid-cols="1"]) shreddit-post faceplate-number {
    display: inline-flex !important;
    align-items: center !important;
    flex-shrink: 0 !important;
    min-width: max-content !important;
    width: auto !important;
    max-width: unset !important;
  }

  body:not([data-reddit-grid-cols="1"]) shreddit-post shreddit-share-button,
  body:not([data-reddit-grid-cols="1"]) shreddit-post shreddit-overflow-menu,
  body:not([data-reddit-grid-cols="1"]) shreddit-post [data-post-click-location="share"],
  body:not([data-reddit-grid-cols="1"]) shreddit-post [data-post-click-location="comments"] {
    flex-shrink: 0 !important;
    width: auto !important;
    max-width: unset !important;
  }

  /* Compact mode */
  body[data-reddit-grid-compact="true"] shreddit-post [slot="text-body"] { display: none !important; }

  /* Promoted post hide */
  body[data-reddit-grid-hide-promoted="true"] shreddit-ad-post,
  body[data-reddit-grid-hide-promoted="true"] [data-reddit-grid-is-ad="true"] {
    display: none !important;
  }

  /* Sidebar hide (right side) */
  body:not([data-reddit-grid-cols="1"]) #right-sidebar-container,
  body:not([data-reddit-grid-cols="1"]) shreddit-layout-sidebar,
  body:not([data-reddit-grid-cols="1"]) shreddit-recent-pages,
  body:not([data-reddit-grid-cols="1"]) .right-sidebar,
  body:not([data-reddit-grid-cols="1"]) footer,
  body:not([data-reddit-grid-cols="1"]) [data-testid="right-sidebar"],
  body:not([data-reddit-grid-cols="1"]) [aria-label="Recent Posts"],
  body:not([data-reddit-grid-cols="1"]) grid-layout > :nth-child(3) {
    display: none !important;
    width: 0 !important;
    min-width: 0 !important;
  }

  /* Left sidebar hide */
  body[data-reddit-grid-hide-sidebar="true"] grid-layout > :nth-child(1),
  body[data-reddit-grid-hide-sidebar="true"] grid-layout > :nth-child(2),
  body[data-reddit-grid-hide-sidebar="true"] #left-sidebar-container,
  body[data-reddit-grid-hide-sidebar="true"] left-nav {
    display: none !important;
    width: 0 !important;
  }
`;

function ensureStyleTag() {
  let tag = document.getElementById('rg-force-styles');
  if (tag) return tag;
  tag = document.createElement('style');
  tag.id = 'rg-force-styles';
  (document.head || document.documentElement).appendChild(tag);
  return tag;
}

function ensureStaticStyles() {
  const tag = ensureStyleTag();
  if (!tag.textContent) tag.textContent = STATIC_FORCE_CSS;
}

ensureStaticStyles();


// ══════════════════════════════════════════════════════════════════════════════
//  3. SETTINGS APPLIER
// ══════════════════════════════════════════════════════════════════════════════

function applySettings(settings) {
  activeSettings = { ...activeSettings, ...settings };

  const doApply = () => {
    const body = document.body;
    if (!body) { requestAnimationFrame(doApply); return; }

    ensureStaticStyles();

    body.setAttribute('data-reddit-grid-cols',          activeSettings.columns);
    body.setAttribute('data-reddit-grid-autofit',       String(activeSettings.autoFit));
    body.setAttribute('data-reddit-grid-masonry',       String(activeSettings.masonry));
    body.setAttribute('data-reddit-grid-compact',       String(activeSettings.compactCards));
    body.setAttribute('data-reddit-grid-hide-promoted', String(activeSettings.hidePromoted));
    body.setAttribute('data-reddit-grid-hide-sidebar',  String(activeSettings.hideSidebar));

    body.style.setProperty('--reddit-cols',      activeSettings.columns);
    // In masonry mode: row gap is baked into JS spans, only col gap is CSS
    body.style.setProperty('--reddit-col-gap',   activeSettings.masonry ? '8px' : '4px');
    // Batch-to-batch spacing (between faceplate-batch elements in the flex feed)
    body.style.setProperty('--reddit-batch-gap', activeSettings.masonry ? '16px' : '8px');

    manageScrollbar(activeSettings.hideScrollbar);
  };

  doApply();
}

function manageScrollbar(hide) {
  let tag = document.getElementById('rg-scrollbar-styles');
  if (hide) {
    if (!tag) {
      tag = document.createElement('style');
      tag.id = 'rg-scrollbar-styles';
      (document.head || document.documentElement).appendChild(tag);
      tag.textContent = `
        html, body { -ms-overflow-style: none !important; scrollbar-width: none !important; }
        html::-webkit-scrollbar, body::-webkit-scrollbar { display: none !important; }
      `;
    }
  } else if (tag) {
    tag.textContent = '';
  }
}


// ══════════════════════════════════════════════════════════════════════════════
//  4. ROUTING MANAGER
// ══════════════════════════════════════════════════════════════════════════════

const PAGE_TYPE = {
  FEED:        'feed',
  POST_THREAD: 'post_thread',
  PROFILE:     'profile',
  SEARCH:      'search',
};

function detectPageType(url) {
  if (/\/comments\/[a-z0-9]+\//.test(url)) return PAGE_TYPE.POST_THREAD;
  if (/\/user\/[^/]+\/(saved|posts|comments|history|hidden|upvoted|downvoted)/i.test(url)) return PAGE_TYPE.PROFILE;
  if (/\/user\/[^/]+\/?$/.test(url))  return PAGE_TYPE.PROFILE;
  if (/\/search\/?/.test(url))         return PAGE_TYPE.SEARCH;
  if (/\/r\/[^/]+(\/?)?$/.test(url))   return PAGE_TYPE.FEED;
  if (url.endsWith('.reddit.com/') || /reddit\.com\/?$/.test(url)) return PAGE_TYPE.FEED;
  return PAGE_TYPE.FEED;
}

let lastPageType = null;

function applyRoutingLogic() {
  const pageType = detectPageType(location.href);
  const computed = { ...userSettings };

  if (pageType === PAGE_TYPE.POST_THREAD) {
    computed.columns = '1';
    LifecycleManager.halt();
  } else {
    LifecycleManager.resume();
  }

  applySettings(computed);

  if (pageType !== PAGE_TYPE.POST_THREAD) {
    // Full sweep on navigation — clears stability markers so all cards re-measure
    setTimeout(() => MasonryManager.sweepAll(), 80);
    setTimeout(() => MasonryManager.sweepAll(), 400);
  }

  lastPageType = pageType;
}


// ══════════════════════════════════════════════════════════════════════════════
//  5. MASONRY MANAGER  — v3.0: Batch-isolated with card stability tracking
//
//  STABILITY SYSTEM:
//  ┌──────────────────────────────────────────────────────────────────────────┐
//  │ 1. ResizeObserver fires for every observed card                          │
//  │ 2. If card has data-rg-stable AND computed span == stored span → SKIP   │
//  │    (no DOM write, no cascade trigger)                                    │
//  │ 3. If span changed → update grid-row-end, clear data-rg-stable          │
//  │ 4. If span unchanged 2× in a row → set data-rg-stable                  │
//  │ 5. sweepNew() only processes cards WITHOUT data-rg-stable               │
//  │    → called by DOMObserver when new batches arrive (infinite scroll)    │
//  │ 6. sweepAll() clears all markers and reprocesses everything             │
//  │    → called only on navigation and settings changes                     │
//  └──────────────────────────────────────────────────────────────────────────┘
// ══════════════════════════════════════════════════════════════════════════════

const POST_SELECTORS = [
  'shreddit-post',
  'shreddit-ad-post',
  'shreddit-feed article',
  'faceplate-batch > shreddit-post',
  'faceplate-batch > article',
  'profile-feed shreddit-post',
  'profile-feed article',
  'shreddit-profile-feed shreddit-post',
  'shreddit-profile-feed article',
  'shreddit-user-feed shreddit-post',
  'shreddit-user-feed article',
  '[data-feed-type] shreddit-post',
  '[data-feed-type] article',
  '.Post',
].join(',');

const ROW_HEIGHT = 5;  // Must match grid-auto-rows in CSS
const ROW_GAP    = 8;  // Visual gap between cards (baked into span calculation)

const MasonryManager = (() => {
  let resizePending = false;
  const resizeQueue  = new Map();
  // Tracks how many consecutive ResizeObserver callbacks had the same span
  const stableCount  = new Map();

  const observer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const el = entry.target;
      const height = el.getBoundingClientRect().height;

      if (height <= 0) continue;

      // ── STABILITY GATE ──
      // If card is already marked stable, only re-queue if its HEIGHT has
      // actually changed enough to produce a different span value.
      // This prevents stable cards from polluting the queue during reflows
      // caused by new batch insertions — the core of the cascade bug fix.
      if (el.hasAttribute('data-rg-stable')) {
        const currentSpan = parseInt(el.getAttribute('data-rg-span') || '0', 10);
        const newSpan     = Math.ceil((height + ROW_GAP) / ROW_HEIGHT);
        if (currentSpan === newSpan) continue; // No change — skip entirely
        // Height actually changed (e.g. user expanded content) — re-process
        el.removeAttribute('data-rg-stable');
        stableCount.delete(el);
      }

      resizeQueue.set(el, height);
    }

    if (resizeQueue.size > 0 && !resizePending) {
      resizePending = true;
      requestAnimationFrame(flush);
    }
  });

  function flush() {
    resizePending = false;
    if (activeSettings.columns === '1') { resizeQueue.clear(); return; }

    for (const [el, height] of resizeQueue) {
      if (height <= 0) continue;

      const span        = Math.ceil((height + ROW_GAP) / ROW_HEIGHT);
      const currentSpan = el.getAttribute('data-rg-span');

      if (currentSpan !== String(span)) {
        // ── SPAN CHANGED: Update DOM ──
        el.style.setProperty('grid-row-end', `span ${span}`, 'important');
        el.setAttribute('data-rg-span', span);
        el.removeAttribute('data-rg-stable');
        stableCount.set(el, 0);
      } else {
        // ── SPAN UNCHANGED: Count toward stability ──
        const count = (stableCount.get(el) || 0) + 1;
        stableCount.set(el, count);

        if (count >= 2) {
          // Two consecutive identical spans → card is stable
          // Mark it so the ResizeObserver gate skips it on future reflows
          el.setAttribute('data-rg-stable', '1');
        }
      }
    }

    resizeQueue.clear();
  }

  function applyCardStyles(el) {
    const s = el.style;
    s.setProperty('margin-top',    '0',          'important');
    s.setProperty('margin-left',   '0',          'important');
    s.setProperty('margin-right',  '0',          'important');
    s.setProperty('margin-bottom', '0',          'important');
    s.setProperty('padding',       '0',          'important');
    s.setProperty('width',         '100%',       'important');
    s.setProperty('min-width',     '0',          'important');
    s.setProperty('max-width',     '100%',       'important');
    s.setProperty('box-sizing',    'border-box', 'important');
  }

  // ── processCard: Handle a single card ──
  // Applies inline style resets and starts/stops observation.
  // Skips cards already marked stable (unless in 1-col mode).
  function processCard(el) {
    if (!el || el.nodeType !== 1) return;
    // Skip stable cards — they are correct and must not be disturbed
    if (el.hasAttribute('data-rg-stable') && activeSettings.columns !== '1') return;

    applyCardStyles(el);

    if (activeSettings.columns !== '1') {
      observer.observe(el);
    } else {
      // 1-column mode: remove all masonry styles
      observer.unobserve(el);
      el.style.removeProperty('grid-row-end');
      el.removeAttribute('data-rg-span');
      el.removeAttribute('data-rg-stable');
      stableCount.delete(el);
    }
  }

  // ── sweepNew: Process only cards that haven't stabilised yet ──
  // CALLED BY: DOMObserver when new faceplate-batch elements arrive (infinite scroll).
  // Existing stable cards are COMPLETELY UNTOUCHED — no reflow cascade.
  function sweepNew() {
    if (activeSettings.columns === '1') return;
    document.querySelectorAll(POST_SELECTORS).forEach(el => {
      if (!el.hasAttribute('data-rg-stable')) processCard(el);
    });
  }

  // ── sweepAll: Full reset and reprocess of every card ──
  // CALLED BY: Navigation events, settings changes, initial boot.
  // Clears all stability markers so every card remeasures fresh.
  function sweepAll() {
    document.querySelectorAll(POST_SELECTORS).forEach(el => {
      el.removeAttribute('data-rg-stable');
      stableCount.delete(el);
      processCard(el);
    });
  }

  function disconnectAll() {
    observer.disconnect();
    resizeQueue.clear();
    resizePending = false;
    stableCount.clear();
  }

  return { processCard, sweepNew, sweepAll, disconnectAll };
})();


// ══════════════════════════════════════════════════════════════════════════════
//  6. AUDIO MANAGER
// ══════════════════════════════════════════════════════════════════════════════

const AudioManager = (() => {
  const visible = new Set();
  let debounceTimer = null;

  const observer = new IntersectionObserver((entries) => {
    if (!activeSettings.autoPlayAudio) return;
    for (const entry of entries) {
      if (entry.isIntersecting) {
        visible.add(entry.target);
      } else {
        visible.delete(entry.target);
        mutePlayer(entry.target);
      }
    }
    scheduleUpdate();
  }, { threshold: 0.1 });

  function mutePlayer(player) {
    player.muted = true;
    player.setAttribute('muted', '');
    const v = player.querySelector('video') ||
              (player.shadowRoot && player.shadowRoot.querySelector('video'));
    if (v) v.muted = true;
  }

  function unmutePlayer(player) {
    player.muted = false;
    player.removeAttribute('muted');
    const v = player.querySelector('video') ||
              (player.shadowRoot && player.shadowRoot.querySelector('video'));
    if (v) { v.muted = false; v.volume = 1; }
  }

  function scheduleUpdate() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(updateFocus, 80);
  }

  function updateFocus() {
    if (visible.size === 0 || !activeSettings.autoPlayAudio) return;
    if (/\/comments\/[a-z0-9]+\//.test(location.href)) return;

    const cy = window.innerHeight / 2;
    const cx = window.innerWidth  / 2;
    let best = null, minDist = Infinity;

    visible.forEach(player => {
      const r    = player.getBoundingClientRect();
      const dist = Math.hypot(r.top + r.height / 2 - cy, r.left + r.width / 2 - cx);
      if (dist < minDist) { minDist = dist; best = player; }
    });

    visible.forEach(player => (player === best ? unmutePlayer(player) : mutePlayer(player)));
  }

  function muteAll() { visible.forEach(mutePlayer); }

  function observe(node) {
    if (node && node.tagName) observer.observe(node);
  }

  function observeIn(root) {
    root.querySelectorAll('shreddit-player').forEach(observe);
  }

  return { observe, observeIn, updateFocus, scheduleUpdate, muteAll };
})();

window.addEventListener('scroll', AudioManager.scheduleUpdate, { passive: true });


// ══════════════════════════════════════════════════════════════════════════════
//  7. DOM OBSERVER
//  Watches for new posts from infinite scroll.
//
//  v3.0 CHANGE: Calls sweepNew() instead of sweepAll() on new batches.
//  This is the key that prevents new cards from disturbing existing ones.
// ══════════════════════════════════════════════════════════════════════════════

const DOMObserver = (() => {
  let mo = null;
  let sweepTimer = null;

  const POST_TAGS  = new Set(['shreddit-post', 'article', 'shreddit-ad-post']);
  const BATCH_TAGS = new Set([
    'faceplate-batch', 'div', 'shreddit-feed',
    'profile-feed', 'shreddit-profile-feed', 'shreddit-user-feed',
  ]);

  function handleAddedNode(node) {
    if (node.nodeType !== 1) return;
    const tag = node.tagName.toLowerCase();

    if (POST_TAGS.has(tag) || node.classList?.contains('Post')) {
      // Direct post — only process if not already stable
      if (!node.hasAttribute('data-rg-stable')) {
        MasonryManager.processCard(node);
      }
      AudioManager.observeIn(node);

      if (activeSettings.hidePromoted && (tag === 'shreddit-ad-post' || node.hasAttribute('ad-id'))) {
        node.setAttribute('data-reddit-grid-is-ad', 'true');
      }
    } else if (BATCH_TAGS.has(tag)) {
      // New batch arrived — schedule a NEW-only sweep
      // Existing stable cards are completely unaffected
      scheduleNewSweep();
      AudioManager.observeIn(node);
    } else if (tag === 'shreddit-player') {
      AudioManager.observe(node);
    }
  }

  // scheduleNewSweep: Only processes cards without data-rg-stable
  function scheduleNewSweep() {
    clearTimeout(sweepTimer);
    sweepTimer = setTimeout(MasonryManager.sweepNew, 150);
  }

  function start() {
    if (mo) return;
    mo = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          handleAddedNode(node);
        }
        // Guard: re-inject if Reddit wiped our style tag
        for (const node of m.removedNodes) {
          if (node.id === 'rg-force-styles') {
            requestAnimationFrame(ensureStaticStyles);
          }
        }
      }
    });

    const target = document.querySelector('main') || document.documentElement;
    mo.observe(target, { childList: true, subtree: true });
  }

  function stop() {
    if (mo) { mo.disconnect(); mo = null; }
    clearTimeout(sweepTimer);
  }

  return { start, stop };
})();


// ══════════════════════════════════════════════════════════════════════════════
//  8. STYLE INTEGRITY WATCHER
// ══════════════════════════════════════════════════════════════════════════════

const StyleIntegrityWatcher = (() => {
  let headObserver = null;

  function start() {
    if (headObserver) return;
    const head = document.head || document.documentElement;
    headObserver = new MutationObserver(() => {
      if (!document.getElementById('rg-force-styles')) {
        ensureStaticStyles();
        requestAnimationFrame(() => applySettings(activeSettings));
      }
    });
    headObserver.observe(head, { childList: true });
  }

  function stop() {
    if (headObserver) { headObserver.disconnect(); headObserver = null; }
  }

  return { start, stop };
})();


// ══════════════════════════════════════════════════════════════════════════════
//  9. LIFECYCLE MANAGER
// ══════════════════════════════════════════════════════════════════════════════

const LifecycleManager = (() => {
  let running = false;

  function resume() {
    if (running) return;
    running = true;
    DOMObserver.start();
    StyleIntegrityWatcher.start();
    MasonryManager.sweepAll();
  }

  function halt() {
    if (!running) return;
    running = false;
    DOMObserver.stop();
    MasonryManager.disconnectAll();
  }

  function isRunning() { return running; }

  return { resume, halt, isRunning };
})();


// ══════════════════════════════════════════════════════════════════════════════
//  10. SPA NAVIGATION WATCHER
// ══════════════════════════════════════════════════════════════════════════════

let lastUrl     = location.href;
let navDebounce = null;

function onNavigate() {
  const current = location.href;
  if (current === lastUrl) return;
  lastUrl = current;

  clearTimeout(navDebounce);
  navDebounce = setTimeout(() => {
    applyRoutingLogic();
  }, 250);
}

// Method 1: Title mutations (most reliable for Reddit SPA)
const headForTitle = document.querySelector('head');
if (headForTitle) {
  new MutationObserver(() => {
    if (location.href !== lastUrl) onNavigate();
  }).observe(headForTitle, { childList: true, subtree: false });
}

// Method 2: History API events
window.addEventListener('popstate',   onNavigate);
window.addEventListener('hashchange', onNavigate);

// Method 3: Intercept pushState/replaceState (catches Reddit's drawer navigation)
(function patchHistory() {
  const _push    = history.pushState.bind(history);
  const _replace = history.replaceState.bind(history);

  history.pushState = function (...args) {
    _push(...args);
    setTimeout(onNavigate, 0);
  };
  history.replaceState = function (...args) {
    _replace(...args);
    setTimeout(onNavigate, 0);
  };
})();

// Method 4: Safety net interval
setInterval(onNavigate, 600);


// ══════════════════════════════════════════════════════════════════════════════
//  11. KEYBOARD SHORTCUTS  Alt+1–6
// ══════════════════════════════════════════════════════════════════════════════

document.addEventListener('keydown', (e) => {
  if (e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
    const key = parseInt(e.key);
    if (key >= 1 && key <= 6) {
      userSettings.columns = String(key);
      chrome.storage.sync.set({ columns: userSettings.columns });
      applyRoutingLogic();
      e.preventDefault();
    }
  }
});


// ══════════════════════════════════════════════════════════════════════════════
//  12. MESSAGE LISTENER (from popup)
// ══════════════════════════════════════════════════════════════════════════════

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.type === 'UPDATE_SETTINGS') {
    const prevAudio = userSettings.autoPlayAudio;
    userSettings = { ...userSettings, ...request.settings };

    if (prevAudio && !userSettings.autoPlayAudio) {
      AudioManager.muteAll();
    }

    // Settings changed — do a full sweep so layout updates everywhere
    applyRoutingLogic();
    sendResponse({ ok: true });
  }
  return true;
});


// ══════════════════════════════════════════════════════════════════════════════
//  13. BOOT SEQUENCE
//
//  Phase 1 — Immediate (document_start, before any HTML renders):
//    • Inject static CSS to eliminate FOUC
//    • Apply default settings to body attributes
//    • Start StyleIntegrityWatcher
//
//  Phase 2 — After DOM ready (storage callback):
//    • Load user's saved settings → these become the authoritative defaults
//    • Re-apply routing with real settings
//    • Run cascading sweepAll() calls to catch cards at all load stages:
//      100ms → synchronously rendered cards
//      350ms → cards that needed a paint cycle
//      700ms → cards after lazy images loaded
//      1500ms → cards in late-loading batches
//      3000ms → stragglers (slow connections)
// ══════════════════════════════════════════════════════════════════════════════

// Phase 1: No-flash defaults
applySettings(DEFAULT_SETTINGS);
StyleIntegrityWatcher.start();
LifecycleManager.resume();

// Phase 2: Authoritative user settings
chrome.storage.sync.get(DEFAULT_SETTINGS, (saved) => {
  userSettings  = { ...DEFAULT_SETTINGS, ...saved };
  storageLoaded = true;

  applyRoutingLogic();

  // Cascading sweep: processes ALL cards (sweepAll), marks them stable over time.
  // After the first two sweeps, stable cards are frozen. Any subsequent infinite
  // scroll loads only trigger sweepNew() via DOMObserver — existing cards untouched.
  const sweepDelays = [100, 350, 700, 1500, 3000];
  sweepDelays.forEach(delay => {
    setTimeout(() => {
      if (detectPageType(location.href) !== PAGE_TYPE.POST_THREAD) {
        MasonryManager.sweepAll();
      }
    }, delay);
  });
});
