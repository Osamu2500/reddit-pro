/**
 * @file masonry.js
 * @description Masonry grid engine and responsive column controller for Reddit Pro.
 *
 * Key capabilities:
 *  - Responsive container-driven column calculation (1-8 columns)
 *  - Live feed container ResizeObserver for viewport & sidebar changes
 *  - Dynamic ROW_GAP read from computed CSS
 *  - Safe first-measurement state for newly inserted cards
 *  - Image load listeners to recalculate on media load
 *  - Marks cards stable after valid measurement
 *  - Controlled layout diagnostics
 */
// @ts-nocheck
window.RedditPro = window.RedditPro || {};

window.RedditPro.Masonry = (function () {
  let resizePending = false;
  const resizeQueue = new Map(); // Emptied every frame
  const heightCache = new WeakMap();
  // Track which posts we've attached image listeners to
  const imgListeners = new WeakSet();
  let viewportSweepTimer = 0;

  let feedObserver = null;
  let activeObservedFeed = null;
  let lastFeedWidth = 0;
  let effectiveColumns = 0;

  const ROW_HEIGHT = 1;
  const HEIGHT_EPSILON = 0.5;

  const FEED_SELECTORS = [
    'shreddit-feed',
    'shreddit-profile-feed',
    'profile-feed',
    '[data-testid="post-list"]',
    'main > div:has(> shreddit-post)',
    'main > div:has(> article)',
  ];

  const POST_SELECTORS = ['shreddit-post', 'shreddit-ad-post', 'article', '.Post'].join(',');

  /**
   * Calculates the number of responsive columns that fit within the container.
   * Supports 1 to 8 columns based on actual available container width,
   * minimum card width, column gap, and maximum column constraint.
   *
   * @param {number} containerWidth
   * @param {any} [settings]
   * @returns {number}
   */
  function calculateColumns(containerWidth, settings) {
    const s = settings || (window.RedditPro.Settings ? window.RedditPro.Settings.get() : {});
    if (s.columns === '1') return 1;

    const minCardWidth =
      typeof s.minCardWidth === 'number' && s.minCardWidth >= 160 ? s.minCardWidth : 280;
    const maxColumns = s.autoFit
      ? s.maxColumns || 8
      : Math.min(s.maxColumns || 8, parseInt(s.columns, 10) || 3);
    const columnGap = typeof s.columnGap === 'number' && s.columnGap >= 0 ? s.columnGap : 12;

    if (!containerWidth || containerWidth <= 0) {
      return Math.max(1, Math.min(maxColumns, parseInt(s.columns, 10) || 3));
    }

    const fitted = Math.floor((containerWidth + columnGap) / (minCardWidth + columnGap));
    return Math.max(1, Math.min(maxColumns, fitted));
  }

  function getActiveFeedContainer() {
    for (const selector of FEED_SELECTORS) {
      const el = document.querySelector(selector);
      if (el && el.isConnected) return el;
    }
    return document.querySelector('main');
  }

  function updateColumnsForContainer(containerWidth) {
    const settings = window.RedditPro.Settings ? window.RedditPro.Settings.get() : {};
    const cols = calculateColumns(containerWidth, settings);
    const previousCols = effectiveColumns;
    effectiveColumns = cols;

    const body = document.body;
    if (body) {
      body.style.setProperty('--reddit-cols', String(cols));
      body.setAttribute('data-reddit-grid-cols', String(cols));
    }
    const container = activeObservedFeed || getActiveFeedContainer();
    if (container) {
      container.style.setProperty('--reddit-cols', String(cols));
    }

    if (window.RedditPro.Diagnostics) {
      window.RedditPro.Diagnostics.checkLayout(container || body);
    }

    if (previousCols !== 0 && previousCols !== cols) {
      sweepAll();
    }
    return cols;
  }

  function observeFeedContainer() {
    const container = getActiveFeedContainer();
    if (!container) return;

    if (container !== activeObservedFeed) {
      if (feedObserver && activeObservedFeed) {
        feedObserver.unobserve(activeObservedFeed);
      }
      activeObservedFeed = container;

      if (!feedObserver) {
        feedObserver = new ResizeObserver((entries) => {
          for (const entry of entries) {
            const width = entry.contentRect
              ? entry.contentRect.width
              : entry.target.getBoundingClientRect().width;
            if (width <= 0) continue;
            if (Math.abs(width - lastFeedWidth) < 2) continue;
            lastFeedWidth = width;
            updateColumnsForContainer(width);
          }
        });
      }
      feedObserver.observe(container);
    }

    const rect = container.getBoundingClientRect();
    if (rect.width > 0) {
      lastFeedWidth = rect.width;
      updateColumnsForContainer(rect.width);
    }
  }

  /**
   * Identifies the immediate feed grid container for a card element.
   * Prevents treating outer page layout wrappers (e.g. shreddit-app > .grid) as card grids.
   * @param {Element} element
   * @returns {Element | null}
   */
  function getGridContainer(element) {
    if (!element) return null;
    const feed = element.closest(
      'shreddit-feed, shreddit-profile-feed, profile-feed, [data-testid="post-list"]'
    );
    if (feed && getComputedStyle(feed).display.includes('grid')) return feed;

    let ancestor = element.parentElement;
    while (ancestor && ancestor !== document.body && ancestor.tagName !== 'SHREDDIT-APP') {
      if (
        ancestor.id !== 'left-sidebar-container' &&
        !ancestor.classList.contains('grid-container')
      ) {
        const display = getComputedStyle(ancestor).display;
        if (display.includes('grid')) return ancestor;
      }
      ancestor = ancestor.parentElement;
    }
    return null;
  }

  function getGridRowGap(element) {
    const grid = getGridContainer(element);
    return grid ? parseFloat(getComputedStyle(grid).rowGap) || 0 : 0;
  }

  function hasMultipleGridColumns(element) {
    const grid = getGridContainer(element);
    if (!grid) return true;
    const columns = getComputedStyle(grid).gridTemplateColumns.trim();
    return columns ? columns.split(/\s+/).length > 1 : false;
  }

  function clearGridItem(gridItem, card) {
    gridItem.style.removeProperty('grid-row-end');
    gridItem.removeAttribute('data-rg-span');
    gridItem.removeAttribute('data-rg-stable');
    gridItem.removeAttribute('data-rg-loading');
    heightCache.delete(card);
  }

  const observer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const el = entry.target;
      const height = entry.contentRect
        ? entry.contentRect.height
        : el.getBoundingClientRect().height;

      if (height <= 0) continue;

      // Ignore sub-pixel noise while retaining small real layout changes
      const cachedHeight = heightCache.get(el) || 0;
      if (Math.abs(height - cachedHeight) < HEIGHT_EPSILON) continue;
      heightCache.set(el, height);

      resizeQueue.set(el, height);
    }

    if (resizeQueue.size > 0 && !resizePending) {
      resizePending = true;
      requestAnimationFrame(flush);
    }
  });

  function flush() {
    resizePending = false;
    const settings = window.RedditPro.Settings.get();
    if (settings.columns === '1' || !settings.masonry) {
      resizeQueue.clear();
      return;
    }

    for (const [el, height] of resizeQueue) {
      if (height <= 0) continue;

      const gridItem = el.closest('faceplate-tracker') || el;
      if (!hasMultipleGridColumns(el)) {
        clearGridItem(gridItem, el);
        continue;
      }
      const rowGap = getGridRowGap(gridItem);
      const span = Math.ceil((height + rowGap) / (ROW_HEIGHT + rowGap));
      const currentSpan = gridItem.getAttribute('data-rg-span');
      const expectedRowEnd = `span ${span}`;
      const currentRowEnd = gridItem.style.getPropertyValue('grid-row-end');

      if (currentSpan !== String(span) || currentRowEnd !== expectedRowEnd) {
        gridItem.style.setProperty('grid-row-end', expectedRowEnd, 'important');
        gridItem.setAttribute('data-rg-span', span);
        gridItem.setAttribute('data-rg-stable', '1');
        gridItem.removeAttribute('data-rg-loading');
      } else if (!gridItem.hasAttribute('data-rg-stable')) {
        gridItem.setAttribute('data-rg-stable', '1');
        gridItem.removeAttribute('data-rg-loading');
      }
    }
    resizeQueue.clear();
  }

  function getMediaElementsDeep(root, acc = []) {
    if (!root) return acc;
    if (root.nodeType === 1) {
      const tag = root.tagName.toLowerCase();
      if (tag === 'img' || tag === 'video') acc.push(root);
      if (root.shadowRoot) getMediaElementsDeep(root.shadowRoot, acc);
    }
    for (const child of root.childNodes) {
      getMediaElementsDeep(child, acc);
    }
    return acc;
  }

  /**
   * Attach load listeners to all images/videos inside a card (including Shadow DOM)
   * so masonry recalculates the moment each media finishes loading.
   * @param {Element} el
   */
  function attachImageListeners(el) {
    if (imgListeners.has(el)) return;
    imgListeners.add(el);

    const media = getMediaElementsDeep(el);
    media.forEach((node) => {
      const tag = node.tagName.toLowerCase();
      if (tag === 'img' && !node.complete) {
        node.addEventListener('load', () => recalculateCard(el), { once: true, passive: true });
        node.addEventListener('error', () => recalculateCard(el), { once: true, passive: true });
      } else if (tag === 'video' && node.readyState < 3) {
        node.addEventListener('loadeddata', () => recalculateCard(el), {
          once: true,
          passive: true,
        });
      }
    });
  }

  /**
   * @param {Element} el
   */
  function processCard(el) {
    if (!el || el.nodeType !== 1) return;
    const settings = window.RedditPro.Settings.get();
    const gridItem = el.closest('faceplate-tracker') || el;

    if (settings.columns !== '1' && settings.masonry && hasMultipleGridColumns(el)) {
      if (!gridItem.hasAttribute('data-rg-span') && !gridItem.hasAttribute('data-rg-stable')) {
        gridItem.setAttribute('data-rg-loading', '1');
      }
      observer.observe(el);
      attachImageListeners(el);

      requestAnimationFrame(() => {
        if (!el.isConnected) return;
        const height = el.getBoundingClientRect().height;
        if (height > 0) {
          heightCache.set(el, height);
          resizeQueue.set(el, height);
          if (!resizePending) {
            resizePending = true;
            requestAnimationFrame(flush);
          }
        }
      });
    } else {
      observer.unobserve(el);
      clearGridItem(gridItem, el);
    }
  }

  const GRID_CONTAINERS = [
    'shreddit-feed',
    'shreddit-profile-feed',
    'profile-feed',
    '[data-testid="post-list"]',
    'main > div:has(> shreddit-post)',
    'main > div:has(> article)',
  ].join(',');

  function processGridHeaders(force = false) {
    const settings = window.RedditPro.Settings.get();
    if (settings.columns === '1' || !settings.masonry) return;
    document.querySelectorAll(GRID_CONTAINERS).forEach((container) => {
      Array.from(container.children).forEach((child) => {
        if (
          child.matches(POST_SELECTORS) ||
          child.matches(
            'faceplate-tracker, faceplate-batch, shreddit-async-loader, shreddit-subreddit-discovery-unit, hr, style, script, template'
          )
        )
          return;

        // Ensure non-card header elements span all columns instead of occupying a single card column
        if (child.style.getPropertyValue('grid-column') !== '1 / -1') {
          child.style.setProperty('grid-column', '1 / -1', 'important');
        }

        if (force || !child.hasAttribute('data-rg-stable')) {
          if (force) {
            child.removeAttribute('data-rg-stable');
            child.removeAttribute('data-rg-loading');
            heightCache.delete(child);
          }
          processCard(child);
        }
      });
    });
  }

  function sweepNew() {
    const settings = window.RedditPro.Settings.get();
    if (settings.columns === '1' || !settings.masonry) return;
    document.querySelectorAll(POST_SELECTORS).forEach((el) => {
      if (!el.hasAttribute('data-rg-stable')) processCard(el);
    });
    processGridHeaders(false);
  }

  function sweepAll() {
    observeFeedContainer();
    document.querySelectorAll(POST_SELECTORS).forEach((el) => {
      const gridItem = el.closest('faceplate-tracker') || el;
      gridItem.removeAttribute('data-rg-stable');
      gridItem.removeAttribute('data-rg-loading');
      heightCache.delete(el);
      processCard(el);
    });
    processGridHeaders(true);
  }

  function disconnectAll() {
    observer.disconnect();
    if (feedObserver && activeObservedFeed) {
      feedObserver.unobserve(activeObservedFeed);
      activeObservedFeed = null;
    }
    resizeQueue.clear();
    resizePending = false;
  }

  window.addEventListener(
    'resize',
    () => {
      clearTimeout(viewportSweepTimer);
      viewportSweepTimer = window.setTimeout(() => {
        if (window.RedditPro.Settings.get().columns !== '1') {
          const container = getActiveFeedContainer();
          if (container) {
            const rect = container.getBoundingClientRect();
            if (rect.width > 0) updateColumnsForContainer(rect.width);
          }
          sweepAll();
        }
      }, 140);
    },
    { passive: true }
  );

  /**
   * @param {Element} el
   */
  function recalculateCard(el) {
    const gridItem = el.closest('faceplate-tracker') || el;
    gridItem.removeAttribute('data-rg-stable');
    heightCache.delete(el);
    processCard(el);
  }

  // Controlled diagnostics for layout verification without production noise
  window.RedditPro.Diagnostics = {
    isEnabled() {
      try {
        return Boolean(
          window.__RP_DEBUG ||
          (typeof localStorage !== 'undefined' &&
            localStorage.getItem('reddit_pro_debug') === 'true')
        );
      } catch {
        return false;
      }
    },
    log(event, data) {
      if (!this.isEnabled()) return;
      console.warn(`[RedditPro:Diagnostics] ${event}`, data);
    },
    checkLayout(feedContainer) {
      if (!this.isEnabled() || !feedContainer) return null;
      try {
        const computed = getComputedStyle(feedContainer);
        const rect = feedContainer.getBoundingClientRect();
        const cards = Array.from(feedContainer.querySelectorAll(POST_SELECTORS)).slice(0, 10);
        const cardWidths = cards.map((c) => Math.round(c.getBoundingClientRect().width));
        const isOverflowing = cards.some((c) => c.getBoundingClientRect().right > rect.right + 2);

        const info = {
          containerWidth: Math.round(rect.width),
          calculatedColumnCount:
            effectiveColumns ||
            parseInt(getComputedStyle(document.body).getPropertyValue('--reddit-cols'), 10) ||
            1,
          computedGridColumns: computed.gridTemplateColumns,
          columnGap: computed.columnGap,
          rowGap: computed.rowGap,
          firstCardWidth: cardWidths[0] || 0,
          cardWidths,
          isOverflowing,
        };
        this.log('Layout Geometry', info);
        return info;
      } catch {
        return null;
      }
    },
  };

  return {
    processCard,
    sweepNew,
    sweepAll,
    disconnectAll,
    recalculateCard,
    calculateColumns,
    observeFeedContainer,
    updateColumnsForContainer,
    getEffectiveColumns: () => effectiveColumns,
  };
})();
