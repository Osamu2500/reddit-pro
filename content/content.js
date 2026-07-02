// ─────────────────────────────────────────────────────────────────────────────
//  Reddit Grid View — content.js  v2.0
//  Fixes:
//   • Cards stuck at top after page refresh (masonry spans not applied in time)
//   • Scroll-to-top on infinite scroll (faceplate-batch bounding box destroyed)
//   • UI reverts to default after opening/closing a post (routing logic bug)
//   • Extension settings not persisting as the "true" default view
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

// userSettings  = what the user saved (persistent across pages)
// activeSettings = what is currently applied on screen
let userSettings   = { ...DEFAULT_SETTINGS };
let activeSettings = { ...DEFAULT_SETTINGS };

// FIX: Track whether storage has loaded so routing doesn't trample saved settings
let storageLoaded = false;

// ══════════════════════════════════════════════════════════════════════════════
//  2. STATIC CSS ENGINE
//  Inject ONE stylesheet at document_start. All layout changes use CSS vars.
// ══════════════════════════════════════════════════════════════════════════════

const STATIC_FORCE_CSS = `
  /* ── Reddit Grid View Extension Styles ── */

  /* Reset post card spacing */
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

  /* Kill any spacing Reddit puts on the feed containers */
  shreddit-feed,
  .feed-container,
  profile-feed,
  shreddit-profile-feed,
  shreddit-user-feed,
  [data-feed-type] {
    gap: 0 !important;
    padding: 0 !important;
    margin: 0 !important;
    row-gap: 0 !important;
    column-gap: 0 !important;
  }

  /* ── NESTED GRIDS (BATCH ISOLATION + VIRTUAL SCROLLER COMPAT) ──
     FIX: Each faceplate-batch becomes its own sub-grid BUT keeps its
     bounding box (NOT display:contents) so Reddit's IntersectionObserver
     for infinite scroll never loses track of scroll position.
     This is the definitive fix for both the teleport-to-top bug AND
     the scroll-jump-to-top on new batch load. */
  body:not([data-reddit-grid-cols="1"]) shreddit-feed > faceplate-batch,
  body:not([data-reddit-grid-cols="1"]) .feed-container > faceplate-batch,
  body:not([data-reddit-grid-cols="1"]) profile-feed > faceplate-batch,
  body:not([data-reddit-grid-cols="1"]) shreddit-profile-feed > faceplate-batch,
  body:not([data-reddit-grid-cols="1"]) shreddit-user-feed > faceplate-batch,
  body:not([data-reddit-grid-cols="1"]) [data-feed-type] > faceplate-batch,
  body:not([data-reddit-grid-cols="1"]) shreddit-feed > div:has(shreddit-post ~ shreddit-post),
  body:not([data-reddit-grid-cols="1"]) shreddit-feed > div:has(article ~ article),
  body:not([data-reddit-grid-cols="1"]) .feed-container > div:has(shreddit-post ~ shreddit-post),
  body:not([data-reddit-grid-cols="1"]) .feed-container > div:has(article ~ article),
  body:not([data-reddit-grid-cols="1"]) profile-feed > div:has(shreddit-post ~ shreddit-post),
  body:not([data-reddit-grid-cols="1"]) profile-feed > div:has(article ~ article),
  body:not([data-reddit-grid-cols="1"]) shreddit-profile-feed > div:has(shreddit-post ~ shreddit-post),
  body:not([data-reddit-grid-cols="1"]) shreddit-profile-feed > div:has(article ~ article),
  body:not([data-reddit-grid-cols="1"]) shreddit-user-feed > div:has(shreddit-post ~ shreddit-post),
  body:not([data-reddit-grid-cols="1"]) shreddit-user-feed > div:has(article ~ article),
  body:not([data-reddit-grid-cols="1"]) [data-feed-type] > div:has(shreddit-post ~ shreddit-post),
  body:not([data-reddit-grid-cols="1"]) [data-feed-type] > div:has(article ~ article) {
    display: grid !important;
    grid-template-columns: repeat(var(--reddit-cols, 3), minmax(0, 1fr)) !important;
    grid-auto-rows: 5px !important;
    grid-auto-flow: row dense !important;
    grid-column: 1 / -1 !important;
    gap: var(--reddit-gap, 16px) !important;
    align-items: start !important;
    margin: 0 0 var(--reddit-gap, 16px) 0 !important;
    padding: 0 !important;
    width: 100% !important;
  }

  /* Flatten single-post wrappers and inner divs within a batch */
  body:not([data-reddit-grid-cols="1"]) shreddit-feed > div:not(:has(shreddit-post ~ shreddit-post)):not(:has(article ~ article)):not(:empty),
  body:not([data-reddit-grid-cols="1"]) shreddit-feed > faceplate-batch > div,
  body:not([data-reddit-grid-cols="1"]) .feed-container > div:not(:has(shreddit-post ~ shreddit-post)):not(:has(article ~ article)):not(:empty),
  body:not([data-reddit-grid-cols="1"]) profile-feed > div:not(:has(shreddit-post ~ shreddit-post)):not(:has(article ~ article)):not(:empty),
  body:not([data-reddit-grid-cols="1"]) profile-feed > faceplate-batch > div,
  body:not([data-reddit-grid-cols="1"]) shreddit-profile-feed > div:not(:has(shreddit-post ~ shreddit-post)):not(:has(article ~ article)):not(:empty),
  body:not([data-reddit-grid-cols="1"]) shreddit-profile-feed > faceplate-batch > div,
  body:not([data-reddit-grid-cols="1"]) shreddit-user-feed > div:not(:has(shreddit-post ~ shreddit-post)):not(:has(article ~ article)):not(:empty),
  body:not([data-reddit-grid-cols="1"]) shreddit-user-feed > faceplate-batch > div,
  body:not([data-reddit-grid-cols="1"]) [data-feed-type] > div:not(:has(shreddit-post ~ shreddit-post)):not(:has(article ~ article)):not(:empty),
  body:not([data-reddit-grid-cols="1"]) [data-feed-type] > faceplate-batch > div {
    display: contents !important;
  }

  /* Virtual Scroller Protection: empty placeholder batches must remain as blocks
     so Reddit can accurately measure scroll position for infinite load triggers */
  body:not([data-reddit-grid-cols="1"]) faceplate-batch:not(:has(shreddit-post, article, .Post)):not(:empty),
  body:not([data-reddit-grid-cols="1"]) shreddit-feed > div:not(:has(shreddit-post, article, .Post)):not(:empty),
  body:not([data-reddit-grid-cols="1"]) profile-feed > div:not(:has(shreddit-post, article, .Post)):not(:empty),
  body:not([data-reddit-grid-cols="1"]) .feed-container > div:not(:has(shreddit-post, article, .Post)):not(:empty),
  body:not([data-reddit-grid-cols="1"]) shreddit-profile-feed > div:not(:has(shreddit-post, article, .Post)):not(:empty),
  body:not([data-reddit-grid-cols="1"]) shreddit-user-feed > div:not(:has(shreddit-post, article, .Post)):not(:empty),
  body:not([data-reddit-grid-cols="1"]) [data-feed-type] > div:not(:has(shreddit-post, article, .Post)):not(:empty) {
    display: block !important;
    grid-column: 1 / -1 !important;
    margin: 0 !important;
    padding: 0 !important;
  }

  /* Completely empty batches (placeholders for future content) — keep them as a block */
  body:not([data-reddit-grid-cols="1"]) faceplate-batch:empty {
    display: block !important;
    grid-column: 1 / -1 !important;
    margin: 0 !important;
    padding: 0 !important;
    min-height: 1px !important; /* Force a bounding box even when empty */
  }

  /* Prevent media blowout: images/videos must never overflow card */
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

  /* ACTION BAR PROTECTION — never squish vote/share buttons */
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

  /* Vote buttons always get min content width */
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

  /* Compact mode: hide text body, keep title and thumbnail */
  body[data-reddit-grid-compact="true"] shreddit-post [slot="text-body"] { display: none !important; }

  /* Promoted post hide */
  body[data-reddit-grid-hide-promoted="true"] shreddit-ad-post,
  body[data-reddit-grid-hide-promoted="true"] [data-reddit-grid-is-ad="true"] {
    display: none !important;
  }

  /* Sidebar hide */
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

// Inject static stylesheet exactly once and guard against Reddit's SPA wiping <head>
function ensureStaticStyles() {
  const tag = ensureStyleTag();
  // Only set if empty (never re-inject full string)
  if (!tag.textContent) tag.textContent = STATIC_FORCE_CSS;
}

// Run immediately at document_start to eliminate FOUC
ensureStaticStyles();


// ══════════════════════════════════════════════════════════════════════════════
//  3. SETTINGS APPLIER
//  Updates CSS vars + body data-attributes. Does NOT re-inject the stylesheet.
// ══════════════════════════════════════════════════════════════════════════════

function applySettings(settings) {
  // FIX: Merge into activeSettings properly — never let a partial call clear fields
  activeSettings = { ...activeSettings, ...settings };

  const doApply = () => {
    const body = document.body;
    if (!body) { requestAnimationFrame(doApply); return; }

    // Guard: Re-inject static styles if Reddit's SPA navigation nuked our <head>
    ensureStaticStyles();

    // Data attributes: drive body:not([...]) CSS selectors
    body.setAttribute('data-reddit-grid-cols',          activeSettings.columns);
    body.setAttribute('data-reddit-grid-autofit',       String(activeSettings.autoFit));
    body.setAttribute('data-reddit-grid-masonry',       String(activeSettings.masonry));
    body.setAttribute('data-reddit-grid-compact',       String(activeSettings.compactCards));
    body.setAttribute('data-reddit-grid-hide-promoted', String(activeSettings.hidePromoted));
    body.setAttribute('data-reddit-grid-hide-sidebar',  String(activeSettings.hideSidebar));

    // CSS Custom Properties: hardware-accelerated, no style recalc
    body.style.setProperty('--reddit-cols', activeSettings.columns);
    body.style.setProperty('--reddit-gap',  activeSettings.masonry ? '16px' : '8px');

    // Scrollbar visibility
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
//  Detects page type from URL and applies correct column overrides.
//
//  FIX (Post open/close bug): When a post opens (URL → /comments/...) we set
//  cols=1 and halt observers. When the post is closed (URL goes back to feed),
//  we MUST restore userSettings.columns — NOT leave activeSettings.columns at 1.
//  This is achieved by building `computed` fresh from userSettings every time.
// ══════════════════════════════════════════════════════════════════════════════

const PAGE_TYPE = {
  FEED:        'feed',
  POST_THREAD: 'post_thread',
  PROFILE:     'profile',
  SEARCH:      'search',
  UNKNOWN:     'unknown',
};

function detectPageType(url) {
  if (/\/comments\/[a-z0-9]+\//.test(url)) return PAGE_TYPE.POST_THREAD;
  if (/\/user\/[^/]+\/(saved|posts|comments|history|hidden|upvoted|downvoted)/i.test(url)) return PAGE_TYPE.PROFILE;
  if (/\/user\/[^/]+\/?$/.test(url))  return PAGE_TYPE.PROFILE;
  if (/\/search\/?/.test(url))         return PAGE_TYPE.SEARCH;
  if (/\/r\/[^/]+(\/?)?$/.test(url))   return PAGE_TYPE.FEED;
  if (url.endsWith('.reddit.com/') || /reddit\.com\/?$/.test(url)) return PAGE_TYPE.FEED;
  return PAGE_TYPE.FEED; // Default: treat as feed
}

let lastPageType = null;

function applyRoutingLogic() {
  const pageType = detectPageType(location.href);

  // FIX: Always start from a clean copy of userSettings, never from activeSettings.
  // This guarantees that returning from a post thread restores the user's saved
  // column count — not the '1' that was applied while viewing the thread.
  const computed = { ...userSettings };

  if (pageType === PAGE_TYPE.POST_THREAD) {
    // On post threads: revert to linear layout and halt heavy observers
    computed.columns = '1';
    LifecycleManager.halt();
  } else {
    // On feeds (Home, Subreddit, Profile, Saved, Search): enable grid + observers
    LifecycleManager.resume();
  }

  applySettings(computed);

  // Trigger a masonry sweep when we return to a feed page
  if (pageType !== PAGE_TYPE.POST_THREAD) {
    // Delay lets Reddit finish rendering the feed after SPA navigation
    setTimeout(() => MasonryManager.sweepAll(), 80);
    // Second sweep for late-rendering cards (important after post close)
    setTimeout(() => MasonryManager.sweepAll(), 400);
  }

  lastPageType = pageType;
}


// ══════════════════════════════════════════════════════════════════════════════
//  5. MASONRY MANAGER
//  Manages the ResizeObserver with rAF-batching and guards for 1-column mode.
//
//  FIX (Cards stuck at top after refresh):
//  On hard refresh, cards render before the ResizeObserver fires.
//  We now run sweepAll() multiple times with increasing delays on boot
//  to catch cards that load slowly (e.g. lazy-loaded images).
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

const ROW_HEIGHT = 5;
const ROW_GAP    = 8;

const MasonryManager = (() => {
  let resizePending = false;
  const resizeQueue  = new Map();

  const observer = new ResizeObserver((entries) => {
    // Queue all entries — don't touch DOM here (avoid layout thrash)
    for (const entry of entries) {
      resizeQueue.set(entry.target, entry.target.getBoundingClientRect().height);
    }
    if (!resizePending) {
      resizePending = true;
      requestAnimationFrame(flush);
    }
  });

  function flush() {
    resizePending = false;
    if (activeSettings.columns === '1') { resizeQueue.clear(); return; }

    for (const [el, height] of resizeQueue) {
      if (height > 0) {
        const span = Math.ceil((height + ROW_GAP) / ROW_HEIGHT);
        // Only write to DOM if value actually changed (avoids unnecessary recalc)
        if (el.getAttribute('data-rg-span') !== String(span)) {
          el.style.setProperty('grid-row-end', `span ${span}`, 'important');
          el.setAttribute('data-rg-span', span);
        }
      }
    }
    resizeQueue.clear();
  }

  function processCard(el) {
    if (!el || el.nodeType !== 1) return;
    const s = el.style;

    // Force zero inline spacing so CSS rules win
    s.setProperty('margin-top',    '0',    'important');
    s.setProperty('margin-left',   '0',    'important');
    s.setProperty('margin-right',  '0',    'important');
    s.setProperty('margin-bottom', '0',    'important');
    s.setProperty('padding',       '0',    'important');
    s.setProperty('width',         '100%', 'important');
    s.setProperty('min-width',     '0',    'important');
    s.setProperty('max-width',     '100%', 'important');
    s.setProperty('box-sizing',    'border-box', 'important');

    if (activeSettings.columns !== '1') {
      observer.observe(el);
    } else {
      observer.unobserve(el);
      s.removeProperty('grid-row-end');
      el.removeAttribute('data-rg-span');
    }
  }

  function sweepAll() {
    document.querySelectorAll(POST_SELECTORS).forEach(processCard);
  }

  function disconnectAll() {
    observer.disconnect();
    resizeQueue.clear();
    resizePending = false;
  }

  return { processCard, sweepAll, disconnectAll };
})();


// ══════════════════════════════════════════════════════════════════════════════
//  6. AUDIO MANAGER
//  IntersectionObserver-based center-focus auto-play engine.
//  Mutes all players except the one closest to the viewport center.
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
    if (visible.size === 0) return;
    if (!activeSettings.autoPlayAudio) return;
    if (/\/comments\/[a-z0-9]+\//.test(location.href)) return;

    const cy = window.innerHeight / 2;
    const cx = window.innerWidth  / 2;
    let best = null, minDist = Infinity;

    visible.forEach(player => {
      const r = player.getBoundingClientRect();
      const dist = Math.hypot(r.top + r.height / 2 - cy, r.left + r.width / 2 - cx);
      if (dist < minDist) { minDist = dist; best = player; }
    });

    visible.forEach(player => (player === best ? unmutePlayer(player) : mutePlayer(player)));
  }

  function muteAll() {
    visible.forEach(mutePlayer);
  }

  function observe(node) {
    if (node && node.tagName) observer.observe(node);
  }

  function observeIn(root) {
    root.querySelectorAll('shreddit-player').forEach(observe);
  }

  return { observe, observeIn, updateFocus, scheduleUpdate, muteAll };
})();

// Recalculate audio focus on scroll
window.addEventListener('scroll', AudioManager.scheduleUpdate, { passive: true });


// ══════════════════════════════════════════════════════════════════════════════
//  7. DOM OBSERVER (MutationObserver)
//  Watches for new posts being added by Reddit's infinite scroll and
//  immediately processes them without thrashing the layout.
// ══════════════════════════════════════════════════════════════════════════════

const DOMObserver = (() => {
  let mo = null;
  let sweepTimer = null;

  const POST_TAGS  = new Set(['shreddit-post', 'article', 'shreddit-ad-post']);
  const BATCH_TAGS = new Set(['faceplate-batch', 'div', 'shreddit-feed',
                               'profile-feed', 'shreddit-profile-feed', 'shreddit-user-feed']);

  function handleAddedNode(node) {
    if (node.nodeType !== 1) return;
    const tag = node.tagName.toLowerCase();

    if (POST_TAGS.has(tag) || node.classList?.contains('Post')) {
      // Direct post — process immediately
      MasonryManager.processCard(node);
      AudioManager.observeIn(node);

      // Ad tagging
      if (activeSettings.hidePromoted && (tag === 'shreddit-ad-post' || node.hasAttribute('ad-id'))) {
        node.setAttribute('data-reddit-grid-is-ad', 'true');
      }
    } else if (BATCH_TAGS.has(tag)) {
      // Wrapper batch — schedule a sweep to catch posts inside it
      scheduleSweep();
      AudioManager.observeIn(node);
    } else if (tag === 'shreddit-player') {
      AudioManager.observe(node);
    }
  }

  function scheduleSweep() {
    clearTimeout(sweepTimer);
    sweepTimer = setTimeout(MasonryManager.sweepAll, 150);
  }

  function start() {
    if (mo) return; // Already running
    mo = new MutationObserver((mutations) => {
      let needsSweep = false;
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          handleAddedNode(node);
          needsSweep = true;
        }
      }
      // Also guard against Reddit removing our style tag via DOM manipulation
      for (const m of mutations) {
        for (const node of m.removedNodes) {
          if (node.id === 'rg-force-styles') {
            // Reddit wiped our stylesheet — re-inject!
            requestAnimationFrame(ensureStaticStyles);
          }
        }
      }
      if (needsSweep) scheduleSweep();
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
//  Watches <head> for our <style> tag being removed (e.g., by Reddit's SPA
//  navigation), and re-injects it instantly.
// ══════════════════════════════════════════════════════════════════════════════

const StyleIntegrityWatcher = (() => {
  let headObserver = null;

  function start() {
    if (headObserver) return;
    const head = document.head || document.documentElement;
    headObserver = new MutationObserver(() => {
      // If our style tag is gone, put it back
      if (!document.getElementById('rg-force-styles')) {
        ensureStaticStyles();
        // Also re-apply body attributes in case they got cleared
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
//  Central coordinator. Starts/stops all observers together as a unit.
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
    // NOTE: StyleIntegrityWatcher stays alive always — we always want CSS protection
  }

  function isRunning() { return running; }

  return { resume, halt, isRunning };
})();


// ══════════════════════════════════════════════════════════════════════════════
//  10. SPA NAVIGATION WATCHER
//  Watches for URL changes on Reddit's SPA and re-applies routing logic.
//  Uses 3 methods (title observer, popstate, interval) for 100% coverage.
//
//  FIX (Post open/close revert bug): Reddit's post drawer/lightbox changes the
//  URL to /comments/... and back. We detect this and call applyRoutingLogic()
//  which now correctly restores userSettings.columns (not the thread's '1').
// ══════════════════════════════════════════════════════════════════════════════

let lastUrl      = location.href;
let navDebounce  = null;

function onNavigate() {
  const current = location.href;
  if (current === lastUrl) return;
  lastUrl = current;

  clearTimeout(navDebounce);
  navDebounce = setTimeout(() => {
    applyRoutingLogic();
  }, 250); // Let Reddit's router finish before we measure page type
}

// 1. Title tag changes on every SPA navigation (most reliable)
const headForTitle = document.querySelector('head');
if (headForTitle) {
  new MutationObserver(() => {
    if (location.href !== lastUrl) onNavigate();
  }).observe(headForTitle, { childList: true, subtree: false });
}

// 2. History API events (back/forward + SPA pushState)
window.addEventListener('popstate',   onNavigate);
window.addEventListener('hashchange', onNavigate);

// FIX: Also intercept pushState/replaceState so we catch Reddit's in-app
// navigation (opening/closing posts via drawer) before title updates.
(function patchHistory() {
  const _push    = history.pushState.bind(history);
  const _replace = history.replaceState.bind(history);

  history.pushState = function (...args) {
    _push(...args);
    // Defer so the URL is updated before we read location.href
    setTimeout(onNavigate, 0);
  };
  history.replaceState = function (...args) {
    _replace(...args);
    setTimeout(onNavigate, 0);
  };
})();

// 3. Safety net interval for edge cases
setInterval(onNavigate, 600);


// ══════════════════════════════════════════════════════════════════════════════
//  11. KEYBOARD SHORTCUTS
//  Alt+1–6 to switch column count instantly
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
//  12. MESSAGE LISTENER
//  Receives settings updates from the popup
// ══════════════════════════════════════════════════════════════════════════════

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.type === 'UPDATE_SETTINGS') {
    const prevAudio = userSettings.autoPlayAudio;
    userSettings = { ...userSettings, ...request.settings };

    // If audio was just disabled, mute everything immediately
    if (prevAudio && !userSettings.autoPlayAudio) {
      AudioManager.muteAll();
    }

    applyRoutingLogic();
    sendResponse({ ok: true });
  }
  return true;
});


// ══════════════════════════════════════════════════════════════════════════════
//  13. BOOT SEQUENCE
//  Order matters: CSS → defaults → saved settings → observers → sweep cascade
//
//  FIX (Cards stuck at top after refresh):
//  After storage loads, we run sweepAll() at 100ms, 300ms, 600ms and 1200ms.
//  This catches cards that load synchronously AND those that lazy-load images
//  after the initial render — each resize triggers a rAF-batched span update.
//
//  FIX (Extension as "true default"):
//  Storage load is the authoritative source. We wait for it before the first
//  "real" applyRoutingLogic(). The initial call uses DEFAULT_SETTINGS to
//  prevent FOUC — it will be immediately overridden once storage responds.
// ══════════════════════════════════════════════════════════════════════════════

// Step 1: Apply extension defaults immediately (prevents FOUC on first paint)
// This uses DEFAULT_SETTINGS — storage will override in Step 3.
applySettings(DEFAULT_SETTINGS);
StyleIntegrityWatcher.start();

// Step 2: Start observers with defaults so new nodes are processed immediately
LifecycleManager.resume();

// Step 3: Load saved settings — this is the "true default" the user configured.
// Once loaded, re-apply routing so userSettings drive everything from here on.
chrome.storage.sync.get(DEFAULT_SETTINGS, (saved) => {
  userSettings   = { ...DEFAULT_SETTINGS, ...saved };
  storageLoaded  = true;

  // Apply the user's actual settings immediately
  applyRoutingLogic();

  // FIX (Cards stuck at top): Sweep masonry at multiple time points to catch
  // cards that render at different times (sync cards, lazy images, late batches)
  const sweepDelays = [100, 300, 600, 1200, 2500];
  sweepDelays.forEach(delay => {
    setTimeout(() => {
      if (detectPageType(location.href) !== PAGE_TYPE.POST_THREAD) {
        MasonryManager.sweepAll();
      }
    }, delay);
  });
});
