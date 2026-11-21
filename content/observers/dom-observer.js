/**
 * @file dom-observer.js
 * @description Watches Reddit's SPA DOM for new posts, media players, and feed batches.
 */
window.RedditPro = window.RedditPro || {};

window.RedditPro.DOMObserver = (function () {
  /** @type {MutationObserver | null} */
  let observer = null;
  /** @type {number | undefined} */
  let sweepTimer;
  let rafPending = false;
  /** @type {Set<Node>} */
  const mutationBatch = new Set();

  const POST_SELECTOR = 'shreddit-post, shreddit-ad-post, article, .Post, shreddit-profile-comment';
  const BATCH_SELECTOR =
    'faceplate-batch, shreddit-feed, profile-feed, shreddit-profile-feed, shreddit-user-feed, shreddit-custom-feed, custom-feed, [data-testid="post-list"], [data-testid="profile-feed"], [data-testid="search-results"]';
  const PLAYER_SELECTOR = 'shreddit-player, shreddit-player-2, .shreddit-player-wrapper';

  const SQUIRCLE_SHADOW_CSS = `
    /* Enforce 8px squircle on all buttons, custom controls, and rounded-full elements */
    :host([class*="rounded-full"]),
    :host([class*="button"]),
    .rounded-full,
    [class*="rounded-full"],
    [class*="rounded-[9999px]"],
    [class*="rounded-"],
    button,
    [role="button"],
    div[class*="rounded-full"],
    span[class*="rounded-full"] {
      border-radius: var(--rg-radius-btn, 8px) !important;
    }

    /* Strips any container, border, or background from overflow menu and title/body inside shadow roots */
    :host(shreddit-overflow-menu),
    :host(shreddit-overflow-menu) *,
    :host(shreddit-post-title),
    :host(shreddit-post-title) *,
    :host([slot="title"]),
    :host([slot="title"]) *,
    :host([slot="text-body"]),
    :host([slot="text-body"]) * {
      background: transparent !important;
      background-color: transparent !important;
      border: none !important;
      box-shadow: none !important;
      outline: none !important;
      border-radius: 0 !important;
    }

    /* Harmonize custom element internal buttons (e.g. Join button) with the unified theme */
    :host(shreddit-join-button) button,
    :host(rpl-join-button) button,
    button[aria-label*="join" i] {
      background: var(--rg-btn-bg) !important;
      background-color: var(--rg-btn-bg) !important;
      border: 1px solid var(--rg-btn-border) !important;
      color: var(--rg-text) !important;
      border-radius: var(--rg-radius-btn, 8px) !important;
    }

    :host(shreddit-join-button) button:hover,
    :host(rpl-join-button) button:hover,
    button[aria-label*="join" i]:hover {
      background: var(--rg-btn-bg-hover) !important;
      background-color: var(--rg-btn-bg-hover) !important;
      border-color: var(--rg-btn-border-hover) !important;
      color: var(--rg-text) !important;
    }
  `;

  /** @type {CSSStyleSheet | null | false} */
  let squircleSheet = null;

  function getSquircleSheet() {
    if (squircleSheet !== null) return squircleSheet;
    try {
      if (typeof CSSStyleSheet !== 'undefined' && 'replaceSync' in CSSStyleSheet.prototype) {
        squircleSheet = new CSSStyleSheet();
        squircleSheet.replaceSync(SQUIRCLE_SHADOW_CSS);
      } else {
        squircleSheet = false;
      }
    } catch {
      squircleSheet = false;
    }
    return squircleSheet;
  }

  /**
   * Injects squircle styles into a shadow root to pierce encapsulation.
   * @param {ShadowRoot} shadowRoot
   */
  function applySquircleToShadowRoot(shadowRoot) {
    if (!shadowRoot || /** @type {any} */ (shadowRoot)._rgSquircleApplied) return;
    /** @type {any} */ (shadowRoot)._rgSquircleApplied = true;

    const sheet = getSquircleSheet();
    if (sheet && 'adoptedStyleSheets' in shadowRoot) {
      try {
        shadowRoot.adoptedStyleSheets = [...shadowRoot.adoptedStyleSheets, sheet];
      } catch {
        // Fallback to style tag below
      }
    }
    try {
      const style = document.createElement('style');
      style.setAttribute('data-rg-squircle', '1');
      style.textContent = SQUIRCLE_SHADOW_CSS;
      shadowRoot.appendChild(style);
    } catch {
      // no-op
    }

    const nested = shadowRoot.querySelectorAll('*');
    for (let i = 0; i < nested.length; i++) {
      const el = nested[i];
      if (el.shadowRoot) {
        applySquircleToShadowRoot(el.shadowRoot);
      }
    }
  }

  /**
   * Recursively pierces open shadow roots in an element and all of its descendants,
   * and enforces squircle border-radius directly on all buttons in light DOM.
   * @param {Element} root
   */
  function applySquircleDeep(root) {
    if (!root || root.nodeType !== 1) return;

    if (root.shadowRoot) {
      applySquircleToShadowRoot(root.shadowRoot);
    }

    const elements = root.querySelectorAll('*');
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      if (el.shadowRoot) {
        applySquircleToShadowRoot(el.shadowRoot);
      }
    }

    // Direct squircle enforcement on all interactive buttons in light DOM
    const buttons = root.querySelectorAll(
      ':is([slot="action-bar"], shreddit-post-action-bar, rpl-action-bar, [data-post-click-location="action-bar"]) :is(button, a, [role="button"], shreddit-vote-buttons, vote-buttons, rpl-vote-buttons, shreddit-comment-button, shreddit-post-share-button, shreddit-share-button, shreddit-crosspost-button, .rounded-full, [class*="rounded-full"]), :is(shreddit-join-button, rpl-join-button, [data-testid*="join" i], button[aria-label*="join" i]) :is(*, button, a)'
    );
    for (let i = 0; i < buttons.length; i++) {
      const btn = /** @type {HTMLElement} */ (buttons[i]);
      if (
        btn.style &&
        !btn.closest(
          'shreddit-overflow-menu, [data-post-click-location="overflow-menu"], [slot="title"], [slot="text-body"]'
        )
      ) {
        btn.style.setProperty('border-radius', 'var(--rg-radius-btn, 8px)', 'important');
      }
    }
  }

  // Intercept open shadow roots created at runtime by custom elements
  try {
    if (
      typeof Element !== 'undefined' &&
      Element.prototype.attachShadow &&
      !/** @type {any} */ (Element.prototype)._rgAttachedShadow
    ) {
      /** @type {any} */ (Element.prototype)._rgAttachedShadow = true;
      const origAttachShadow = Element.prototype.attachShadow;
      /** @param {ShadowRootInit} init */
      Element.prototype.attachShadow = function (init) {
        const shadowRoot = origAttachShadow.call(this, init);
        if (shadowRoot) {
          try {
            applySquircleToShadowRoot(shadowRoot);
          } catch {
            // no-op
          }
        }
        return shadowRoot;
      };
    }
  } catch {
    // no-op
  }

  /**
   * Determines if a node is a post or a standalone feed card (such as comments in saved/profile feeds).
   * @param {Element} node
   * @returns {boolean}
   */
  function isFeedPostOrCard(node) {
    if (node.matches(POST_SELECTOR)) return true;
    if (node.matches('shreddit-comment')) {
      return Boolean(
        node.closest(
          'shreddit-feed, shreddit-profile-feed, profile-feed, shreddit-user-feed, shreddit-custom-feed, [data-testid="post-list"], [data-testid="profile-feed"]'
        ) && !node.closest('shreddit-comment-tree, comment-tree, #rg-post-modal')
      );
    }
    return false;
  }

  /** @param {Element} node */
  function processPost(node) {
    applySquircleDeep(node);
    const settings = window.RedditPro.Settings.get();

    const postElement = /** @type {HTMLElement} */ (node);
    const imgWithDims = /** @type {HTMLImageElement | null} */ (
      node.querySelector('img[width][height]')
    );
    if (
      imgWithDims &&
      Number(imgWithDims.getAttribute('width')) > 0 &&
      Number(imgWithDims.getAttribute('height')) > 0
    ) {
      const naturalRatio =
        Number(imgWithDims.getAttribute('width')) / Number(imgWithDims.getAttribute('height'));
      postElement.style.setProperty('--card-aspect-ratio', String(naturalRatio));
    } else {
      const aspectRatioNode = /** @type {HTMLElement | null} */ (
        node.querySelector('[id$="-aspect-ratio"]')
      );
      if (aspectRatioNode?.style.aspectRatio) {
        postElement.style.setProperty('--card-aspect-ratio', aspectRatioNode.style.aspectRatio);
      }
    }

    if (!node.hasAttribute('data-rg-stable')) {
      window.RedditPro.Masonry.processCard(node);
    }

    window.RedditPro.AudioObserver?.observeIn(node);

    if (
      settings.hidePromoted &&
      (node.tagName.toLowerCase() === 'shreddit-ad-post' || node.hasAttribute('ad-id'))
    ) {
      node.setAttribute('data-reddit-grid-is-ad', 'true');
    } else if (!settings.hidePromoted) {
      node.removeAttribute('data-reddit-grid-is-ad');
    }

    window.RedditPro.Filters?.applyToCard(node);
    window.RedditPro.StatsInjector?.queuePost(node);
  }

  /** @param {Element} node */
  function handleElement(node) {
    if (node.nodeType !== 1 || node.hasAttribute('data-rg-processed')) return;

    if (isFeedPostOrCard(node)) {
      node.setAttribute('data-rg-processed', 'true');
      processPost(node);
      return;
    }

    if (node.matches(BATCH_SELECTOR)) {
      node.setAttribute('data-rg-processed', 'true');
      window.RedditPro.Masonry?.observeFeedContainer?.();
      window.RedditPro.Masonry?.processBatch(node);
      observeFeedEnd();
      window.RedditPro.AudioObserver?.observeIn(node);
      window.RedditPro.Virtualizer?.observeBatch(node);
      return;
    }

    if (node.matches(PLAYER_SELECTOR)) {
      node.setAttribute('data-rg-processed', 'true');
      window.RedditPro.AudioObserver?.observe(node);
      return;
    }

    if (node.tagName === 'IFRAME') {
      const iframe = /** @type {HTMLIFrameElement} */ (node);
      node.setAttribute('data-rg-processed', 'true');
      const width = Number(node.getAttribute('width'));
      const height = Number(node.getAttribute('height'));
      // Preserve provider-defined dimensions unless numeric intrinsic dimensions exist.
      if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
        const ratio = width / height;
        if (Number.isFinite(ratio) && ratio > 0.1 && ratio < 10) {
          node.setAttribute('data-rg-embed-ratio', ratio.toFixed(4));
          iframe.style.setProperty('aspect-ratio', width + ' / ' + height, 'important');
          iframe.style.setProperty('height', 'auto', 'important');
        }
      }
      iframe.style.setProperty('max-width', '100%', 'important');
      node.addEventListener('load', () => {
        const card = node.closest(POST_SELECTOR);
        if (card) window.RedditPro.Masonry?.recalculateCard?.(card);
      }, { once: true, passive: true });
    }

    if (node.tagName === 'IMG') {
      node.setAttribute('data-rg-processed', 'true');
      const card = node.closest(POST_SELECTOR);
      const image = /** @type {HTMLImageElement} */ (node);
      if (card && !image.complete) {
        node.addEventListener('load', () => window.RedditPro.Masonry.recalculateCard(card), {
          once: true,
          passive: true,
        });
      }
    }

    if (node.tagName === 'VIDEO') {
      node.setAttribute('data-rg-processed', 'true');
      const card = node.closest(POST_SELECTOR);
      if (card) {
        node.addEventListener(
          'loadedmetadata',
          () => window.RedditPro.Masonry.recalculateCard(card),
          {
            once: true,
            passive: true,
          }
        );
        node.addEventListener(
          'loadeddata',
          () => window.RedditPro.Masonry.recalculateCard(card),
          {
            once: true,
            passive: true,
          }
        );
      }
    }
  }

  /** @param {Element} root */
  function handleAddedNode(root) {
    if (root.nodeType !== 1) return;

    applySquircleDeep(root);
    handleElement(root);
    root
      .querySelectorAll?.(
        `${POST_SELECTOR}, shreddit-comment, ${BATCH_SELECTOR}, ${PLAYER_SELECTOR}, img, video, iframe`
      )
      .forEach(handleElement);

    observeFeedEnd();
  }

  /** @type {IntersectionObserver | null} */
  let preloadObserver = null;
  /** @type {Element | null} */
  let lastObservedSentinel = null;
  let isPreloading = false;
  let scrollPreloadTimer = 0;

  function triggerNextFeedBatch() {
    if (isPreloading) return;
    isPreloading = true;

    const feed = document.querySelector(
      'shreddit-feed, shreddit-profile-feed, profile-feed, shreddit-user-feed, shreddit-custom-feed, custom-feed, [data-testid="post-list"], [data-testid="profile-feed"], [data-testid="search-results"]'
    );
    const scope = feed || document;

    // 1. Target Reddit's faceplate-partial or shreddit-async-loader at the bottom of the feed
    const loaders = Array.from(
      scope.querySelectorAll(
        'faceplate-partial[src], faceplate-partial[loading], shreddit-async-loader'
      )
    );
    const targetLoader = loaders
      .reverse()
      .find(
        (el) =>
          !el.querySelector('shreddit-post, faceplate-tracker, article') &&
          el.getAttribute('data-rg-triggered') !== 'true'
      );

    if (targetLoader) {
      targetLoader.setAttribute('data-rg-triggered', 'true');
      targetLoader.setAttribute('loading', 'eager');

      const anyLoader = /** @type {any} */ (targetLoader);
      if (typeof anyLoader.load === 'function') {
        anyLoader.load();
      } else if (typeof anyLoader.fetch === 'function') {
        anyLoader.fetch();
      } else if (typeof anyLoader.reload === 'function') {
        anyLoader.reload();
      }

      const btn =
        targetLoader.querySelector('button') || targetLoader.shadowRoot?.querySelector('button');
      if (btn) {
        /** @type {HTMLElement} */ (btn).click();
      }

      window.dispatchEvent(new Event('scroll'));

      setTimeout(() => {
        if (!targetLoader.querySelector('shreddit-post, faceplate-tracker, article')) {
          targetLoader.removeAttribute('data-rg-triggered');
        }
        isPreloading = false;
      }, 1200);
      return;
    }

    // 2. Fallback: load more button
    const loadBtn = document.querySelector(
      'button[aria-label*="more posts" i]:not([data-rg-triggered]), button[aria-label*="load more" i]:not([data-rg-triggered]), button:has(> [slot*="load-more"]):not([data-rg-triggered])'
    );
    if (loadBtn) {
      loadBtn.setAttribute('data-rg-triggered', 'true');
      /** @type {HTMLElement} */ (loadBtn).click();
      setTimeout(() => {
        isPreloading = false;
      }, 600);
      return;
    }

    setTimeout(() => {
      isPreloading = false;
    }, 400);
  }

  function observeFeedEnd() {
    const feed = document.querySelector(
      'shreddit-feed, shreddit-profile-feed, profile-feed, shreddit-user-feed, shreddit-custom-feed, custom-feed, [data-testid="post-list"], [data-testid="profile-feed"], [data-testid="search-results"]'
    );
    if (!feed) return;

    const sentinels = Array.from(
      feed.querySelectorAll('shreddit-async-loader, faceplate-partial, faceplate-tail')
    );
    const sentinel =
      sentinels
        .reverse()
        .find((el) => !el.querySelector('shreddit-post, faceplate-tracker, article')) ||
      feed.lastElementChild;
    if (!sentinel || sentinel === lastObservedSentinel) return;

    if (preloadObserver && lastObservedSentinel) {
      preloadObserver.unobserve(lastObservedSentinel);
    }
    lastObservedSentinel = sentinel;

    if (!preloadObserver && typeof IntersectionObserver !== 'undefined') {
      preloadObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              triggerNextFeedBatch();
            }
          }
        },
        {
          root: null,
          rootMargin: '2500px 0px',
          threshold: 0,
        }
      );
    }

    preloadObserver?.observe(sentinel);
  }

  function handleScrollPreload() {
    clearTimeout(scrollPreloadTimer);
    scrollPreloadTimer = window.setTimeout(() => {
      const doc = document.documentElement;
      const scrollHeight = doc.scrollHeight || document.body.scrollHeight;
      const currentScroll = window.scrollY + window.innerHeight;
      if (scrollHeight - currentScroll < 2200) {
        triggerNextFeedBatch();
      }
    }, 120);
  }

  function scheduleNewSweep() {
    clearTimeout(sweepTimer);
    sweepTimer = setTimeout(() => {
      requestAnimationFrame(() => {
        window.RedditPro.Masonry.sweepNew();
        if (document.body) applySquircleDeep(document.body);
      });
    }, 80);
  }

  function processMutations() {
    const batch = Array.from(mutationBatch);
    mutationBatch.clear();
    rafPending = false;
    batch.forEach((node) => {
      if (node instanceof Element) handleAddedNode(node);
    });
  }

  /** @param {Node[]} nodes */
  function enqueueNodes(nodes) {
    nodes.forEach((node) => mutationBatch.add(node));
    if (!rafPending && mutationBatch.size > 0) {
      rafPending = true;
      requestAnimationFrame(processMutations);
    }
  }

  /** @param {MouseEvent} e */
  function handleSidebarClick(e) {
    const target = /** @type {Element | null} */ (e.target);
    if (
      target &&
      target.closest?.(
        'button[aria-label*="Navigation" i], #left-sidebar-container button, reddit-sidebar-nav button'
      )
    ) {
      setTimeout(() => {
        window.RedditPro.Masonry?.observeSidebarContainer?.();
      }, 60);
    }
  }

  function start() {
    if (observer || !document.documentElement) return;

    observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => enqueueNodes(Array.from(mutation.addedNodes)));
    });

    // Observe the document root so Reddit replacing <main> does not orphan the observer.
    observer.observe(document.documentElement, { childList: true, subtree: true });

    // Track sidebar expansion/collapse toggle buttons without leaking listeners on route changes.
    document.addEventListener('click', handleSidebarClick, { passive: true });

    // Existing posts may already be present before the observer is attached.
    handleAddedNode(document.documentElement);
    observeFeedEnd();
    window.addEventListener('scroll', handleScrollPreload, { passive: true });
    scheduleNewSweep();
  }

  function refresh() {
    lastObservedSentinel = null;
    isPreloading = false;
    handleAddedNode(document.documentElement);
    observeFeedEnd();
    scheduleNewSweep();
  }

  function stop() {
    observer?.disconnect();
    observer = null;
    preloadObserver?.disconnect();
    preloadObserver = null;
    lastObservedSentinel = null;
    window.removeEventListener('scroll', handleScrollPreload);
    document.removeEventListener('click', handleSidebarClick);
    clearTimeout(scrollPreloadTimer);
    clearTimeout(sweepTimer);
    mutationBatch.clear();
    rafPending = false;
  }

  return { start, stop, refresh, observeFeedEnd, applySquircleDeep };
})();
