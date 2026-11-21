/**
 * @file masonry.js
 * @description Masonry grid engine and responsive column controller for Reddit Pro.
 *
 * Key capabilities:
 *  - Responsive container-driven column calculation (1-10 columns)
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
  // Track which media elements we've attached listeners to
  const observedMediaNodes = new WeakSet();
  let viewportSweepTimer = 0;
  let placementPending = false;

  let feedObserver = null;
  let activeObservedFeed = null;
  let lastFeedWidth = 0;
  let effectiveColumns = 0;
  let sidebarObserver = null;
  let activeObservedSidebar = null;

  const ROW_HEIGHT = 1;
  const HEIGHT_EPSILON = 0.5;

  const FEED_SELECTORS = [
    'shreddit-feed',
    'shreddit-profile-feed',
    'profile-feed',
    'shreddit-user-feed',
    'shreddit-custom-feed',
    'custom-feed',
    '[data-testid="post-list"]',
    '[data-testid="profile-feed"]',
    '[data-testid="search-results"]',
    'main > div:has(> shreddit-post)',
    'main > div:has(> article)',
  ];

  const SIDEBAR_SELECTORS = [
    '#left-sidebar-container',
    '#left-sidebar',
    'reddit-sidebar-nav',
    '#flex-left-nav-container',
    'flex-left-nav-container',
    'left-nav',
    'shreddit-sidebar',
    'shreddit-sidebar-nav',
  ].join(',');

  const POST_SELECTORS = [
    'shreddit-post',
    'shreddit-ad-post',
    'article',
    '.Post',
    'shreddit-profile-comment',
    ':is(shreddit-feed, shreddit-profile-feed, profile-feed, shreddit-user-feed, shreddit-custom-feed, faceplate-batch, faceplate-tracker) > shreddit-comment',
  ].join(',');

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
      ? s.maxColumns || 10
      : Math.min(s.maxColumns || 10, parseInt(s.columns, 10) || 3);
    const columnGap = typeof s.columnGap === 'number' && s.columnGap >= 0 ? s.columnGap : 12;

    if (!containerWidth || containerWidth <= 0) {
      return Math.max(1, Math.min(maxColumns, parseInt(s.columns, 10) || 3));
    }

    const fitted = Math.floor((containerWidth + columnGap) / (minCardWidth + columnGap));
    return Math.max(1, Math.min(maxColumns, fitted));
  }

  function getActiveFeedContainer() {
    // Prefer the nearest real grid that contains posts over a stale or empty
    // outer feed wrapper left behind during Reddit SPA navigation.
    const firstPost = document.querySelector(POST_SELECTORS);
    if (firstPost) {
      const grid = getGridContainer(firstPost);
      if (grid && grid.isConnected) return grid;
    }

    const candidates = Array.from(document.querySelectorAll(FEED_SELECTORS.join(',')))
      .filter((candidate) => candidate.isConnected)
      .map((candidate) => ({
        candidate,
        width: candidate.getBoundingClientRect().width,
        isGrid: getComputedStyle(candidate).display.includes('grid'),
        postCount: candidate.querySelectorAll(POST_SELECTORS).length,
      }));

    const viable = candidates
      .filter((item) => item.width > 0 && item.isGrid && item.postCount > 0)
      .sort((a, b) => a.postCount - b.postCount);
    if (viable.length) return viable[0].candidate;

    // During initial page load the feed can exist before its first post arrives.
    // Keep observing that visible feed instead of falling back to the whole <main>.
    return candidates.find((item) => item.width > 0)?.candidate || document.querySelector('main');
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

  function observeSidebarContainer() {
    const settings = window.RedditPro.Settings ? window.RedditPro.Settings.get() : {};
    if (settings.hideSidebar) {
      if (document.body) {
        document.body.style.setProperty('--reddit-sidebar-width', '0px');
      }
      return;
    }

    const sidebar = document.querySelector(SIDEBAR_SELECTORS);
    if (!sidebar) return;

    if (sidebar !== activeObservedSidebar) {
      if (sidebarObserver && activeObservedSidebar) {
        sidebarObserver.unobserve(activeObservedSidebar);
      }
      activeObservedSidebar = sidebar;

      if (!sidebarObserver) {
        sidebarObserver = new ResizeObserver((entries) => {
          for (const entry of entries) {
            const currentSettings = window.RedditPro.Settings
              ? window.RedditPro.Settings.get()
              : {};
            if (currentSettings.hideSidebar) {
              document.body?.style.setProperty('--reddit-sidebar-width', '0px');
              continue;
            }
            const width =
              entry.borderBoxSize?.[0]?.inlineSize ?? entry.target.getBoundingClientRect().width;
            if (width > 0 && document.body) {
              document.body.style.setProperty('--reddit-sidebar-width', `${Math.round(width)}px`);
            }
          }
        });
      }
      sidebarObserver.observe(sidebar);
    }

    const rect = sidebar.getBoundingClientRect();
    if (rect.width > 0 && document.body) {
      document.body.style.setProperty('--reddit-sidebar-width', `${Math.round(rect.width)}px`);
    }
  }

  function observeFeedContainer() {
    observeSidebarContainer();
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
      'shreddit-feed, shreddit-profile-feed, profile-feed, shreddit-user-feed, shreddit-custom-feed, custom-feed, [data-testid="post-list"], [data-testid="profile-feed"], [data-testid="search-results"]'
    );
    if (feed && getComputedStyle(feed).display.includes('grid')) return feed;

    let ancestor = element.parentElement;
    while (ancestor && ancestor !== document.body && ancestor.tagName !== 'SHREDDIT-APP') {
      if (
        ancestor.id !== 'left-sidebar-container' &&
        !ancestor.classList.contains('grid-container')
      ) {
        const display = getComputedStyle(ancestor).display;
        if (display.includes('grid') && ancestor.querySelector(POST_SELECTORS)) return ancestor;
      }
      ancestor = ancestor.parentElement;
    }
    return null;
  }

  function getGridRowGap(element) {
    const grid = getGridContainer(element);
    return grid ? parseFloat(getComputedStyle(grid).rowGap) || 0 : 0;
  }

  function getGridColumnGap(element) {
    const grid = getGridContainer(element);
    return grid ? parseFloat(getComputedStyle(grid).columnGap) || 0 : 0;
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
    gridItem.style.removeProperty('grid-column-start');
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

  /**
   * Distributes cards into the currently shortest column while preserving
   * their source order within each column. Grid row spans remain responsible
   * for the exact vertical footprint; this pass chooses the column.
   * @param {Element | null} [container]
   * @returns {{columns: number, heights: number[]} | null}
   */
  function applyMasonryPlacement(container = getActiveFeedContainer()) {
    const settings = window.RedditPro.Settings.get();
    if (!container || settings.columns === '1' || !settings.masonry) return null;

    const grid = getComputedStyle(container);
    const computedTracks = grid.gridTemplateColumns || container.style.gridTemplateColumns || '';
    const columnTracks = computedTracks.trim().split(/\s+/).filter(Boolean);
    const columns = effectiveColumns || columnTracks.length;
    if (columns < 2) return null;

    const cards = Array.from(container.querySelectorAll(POST_SELECTORS));
    if (container.matches(POST_SELECTORS)) cards.unshift(container);
    if (!cards.length) return { columns, heights: Array(columns).fill(0) };

    const rowGap = parseFloat(grid.rowGap) || 0;
    const heights = Array(columns).fill(0);

    cards.forEach((card) => {
      const gridItem = card.closest('faceplate-tracker') || card;
      const measured = card.getBoundingClientRect().height;
      const estimated = measured > 0 ? measured : getEstimatedHeight(card);
      const cardHeight = Math.max(1, estimated || 180);

      let shortestColumn = 0;
      for (let index = 1; index < heights.length; index += 1) {
        if (heights[index] < heights[shortestColumn]) shortestColumn = index;
      }

      gridItem.style.setProperty('grid-column-start', String(shortestColumn + 1), 'important');
      heights[shortestColumn] += cardHeight + rowGap;
    });

    return { columns, heights };
  }

  function scheduleMasonryPlacement() {
    if (placementPending) return;
    placementPending = true;
    requestAnimationFrame(() => {
      placementPending = false;
      applyMasonryPlacement();
    });
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
    const media = getMediaElementsDeep(el);
    media.forEach((node) => {
      if (observedMediaNodes.has(node)) return;
      observedMediaNodes.add(node);

      const tag = node.tagName.toLowerCase();
      if (tag === 'img') {
        if (!node.complete) {
          node.addEventListener('load', () => recalculateCard(el), { once: true, passive: true });
          node.addEventListener('error', () => recalculateCard(el), { once: true, passive: true });
        } else if (node.naturalHeight > 0) {
          // If already complete with dimensions, ensure card isn't stuck with an early dummy measurement
          const currentHeight = heightCache.get(el) || 0;
          if (currentHeight <= 140) {
            requestAnimationFrame(() => recalculateCard(el));
          }
        }
      } else if (tag === 'video') {
        // Video metadata provides videoWidth & videoHeight dimensions
        node.addEventListener('loadedmetadata', () => recalculateCard(el), {
          once: true,
          passive: true,
        });
        node.addEventListener('loadeddata', () => recalculateCard(el), {
          once: true,
          passive: true,
        });
        node.addEventListener('canplay', () => recalculateCard(el), {
          once: true,
          passive: true,
        });
      }
    });
  }

  /**
   * Estimates the rendered card width before media has completed loading.
   * Prefer the actual card box; use grid geometry only as a fallback.
   * @param {Element} el
   * @returns {number}
   */
  function getEstimatedCardWidth(el) {
    const measuredWidth = el.getBoundingClientRect?.().width || 0;
    if (measuredWidth > 0) return measuredWidth;

    const grid = getGridContainer(el);
    const gridWidth = grid?.getBoundingClientRect
      ? grid.getBoundingClientRect().width
      : window.innerWidth || 1200;
    const columns = effectiveColumns ||
      parseInt(document.body?.style.getPropertyValue('--reddit-cols'), 10) || 3;
    const columnGap = getGridColumnGap(el);
    return Math.max(1, (gridWidth - (columns - 1) * columnGap) / columns);
  }

  function getEstimatedHeight(el) {
    if (!el || typeof el.getBoundingClientRect !== 'function') return 0;
    const rect = el.getBoundingClientRect();
    if (rect.height > 120) return rect.height;

    // Check for natural dimensions on media elements
    const imgEl = el.querySelector?.('img');
    if (imgEl && imgEl.naturalWidth > 0 && imgEl.naturalHeight > 0) {
      const naturalRatio = imgEl.naturalWidth / imgEl.naturalHeight;
      if (naturalRatio > 0.1 && naturalRatio < 10) {
        const cardWidth = getEstimatedCardWidth(el);
        return Math.round(cardWidth / naturalRatio + 124);
      }
    }

    const videoEl = el.querySelector?.('video');
    if (videoEl && videoEl.videoWidth > 0 && videoEl.videoHeight > 0) {
      const videoRatio = videoEl.videoWidth / videoEl.videoHeight;
      if (videoRatio > 0.1 && videoRatio < 10) {
        const cardWidth = getEstimatedCardWidth(el);
        return Math.round(cardWidth / videoRatio + 124);
      }
    }

    // Check for aspect ratio on the card or media child
    const ratioVal =
      el.style?.getPropertyValue?.('--card-aspect-ratio') ||
      el.getAttribute?.('style')?.match(/--card-aspect-ratio:\s*([0-9./]+)/)?.[1] ||
      el.querySelector?.('[id$="-aspect-ratio"]')?.style?.aspectRatio ||
      el.querySelector?.('shreddit-aspect-ratio')?.style?.aspectRatio;

    if (ratioVal) {
      let ratio = parseFloat(ratioVal);
      if (isNaN(ratio) || ratio <= 0) {
        const parts = String(ratioVal).split('/');
        if (parts.length === 2) {
          const w = parseFloat(parts[0]);
          const h = parseFloat(parts[1]);
          if (w > 0 && h > 0) ratio = w / h;
        }
      }
      if (ratio && ratio > 0.2 && ratio < 5) {
        const cardWidth = getEstimatedCardWidth(el);
        const mediaHeight = cardWidth / ratio;
        // Non-media card content: credit bar (~44px) + title (~40px) + action bar (~40px) = ~124px
        return Math.round(mediaHeight + 124);
      }
    }

    const img = el.querySelector?.('img[width][height]');
    if (img) {
      const w = parseFloat(img.getAttribute('width'));
      const h = parseFloat(img.getAttribute('height'));
      if (w > 0 && h > 0) {
        const ratio = w / h;
        const cardWidth = getEstimatedCardWidth(el);
        return Math.round(cardWidth / ratio + 124);
      }
    }

    return rect.height > 0 ? rect.height : 0;
  }

  /**
   * @param {Element} el
   * @param {boolean} [force]
   */
  function processCard(el, force = false) {
    if (!el || el.nodeType !== 1) return;
    const settings = window.RedditPro.Settings.get();
    const gridItem = el.closest('faceplate-tracker') || el;

    if (settings.columns !== '1' && settings.masonry && hasMultipleGridColumns(el)) {
      // Guard: Never re-process already stable cards unless explicitly forced (e.g. sweepAll on resize)
      if (
        !force &&
        gridItem.hasAttribute('data-rg-stable') &&
        gridItem.hasAttribute('data-rg-span')
      ) {
        return;
      }

      if (!gridItem.hasAttribute('data-rg-span') && !gridItem.hasAttribute('data-rg-stable')) {
        gridItem.setAttribute('data-rg-loading', '1');
      }
      observer.observe(el);
      attachImageListeners(el);

      // Pre-allocate initial span from estimated height so new cards never collapse to 0 or 40px
      const estimated = getEstimatedHeight(el);
      if (estimated > 80 && !gridItem.hasAttribute('data-rg-span')) {
        const rowGap = getGridRowGap(gridItem);
        const initialSpan = Math.ceil((estimated + rowGap) / (ROW_HEIGHT + rowGap));
        gridItem.style.setProperty('grid-row-end', `span ${initialSpan}`, 'important');
        gridItem.setAttribute('data-rg-span', String(initialSpan));
      }

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

  function processBatch(batchNode) {
    if (!batchNode) return;
    const settings = window.RedditPro.Settings.get();
    if (settings.columns === '1' || !settings.masonry) return;

    const posts = batchNode.matches?.(POST_SELECTORS)
      ? [batchNode]
      : Array.from(batchNode.querySelectorAll?.(POST_SELECTORS) || []);

    posts.forEach((post) => {
      const gridItem = post.closest('faceplate-tracker') || post;
      if (!gridItem.hasAttribute('data-rg-stable')) {
        processCard(post, false);
      }
    });

    processGridHeaders(false);
    scheduleMasonryPlacement();
  }

  const GRID_CONTAINERS = [
    'shreddit-feed',
    'shreddit-profile-feed',
    'profile-feed',
    'shreddit-user-feed',
    'shreddit-custom-feed',
    'custom-feed',
    '[data-testid="post-list"]',
    '[data-testid="profile-feed"]',
    '[data-testid="search-results"]',
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
            'faceplate-tracker, faceplate-batch, shreddit-async-loader, faceplate-partial, faceplate-tail, shreddit-subreddit-discovery-unit, hr, style, script, template'
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
      const gridItem = el.closest('faceplate-tracker') || el;
      if (!gridItem.hasAttribute('data-rg-stable')) processCard(el, false);
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
      processCard(el, true);
    });
    processGridHeaders(true);
    scheduleMasonryPlacement();
  }

  function disconnectAll() {
    observer.disconnect();
    if (feedObserver && activeObservedFeed) {
      feedObserver.unobserve(activeObservedFeed);
      activeObservedFeed = null;
    }
    if (sidebarObserver && activeObservedSidebar) {
      sidebarObserver.unobserve(activeObservedSidebar);
      activeObservedSidebar = null;
    }
    resizeQueue.clear();
    resizePending = false;
    placementPending = false;
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
    gridItem.removeAttribute('data-rg-loading');
    heightCache.delete(el);
    processCard(el, true);
    scheduleMasonryPlacement();
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
    processBatch,
    sweepNew,
    sweepAll,
    disconnectAll,
    recalculateCard,
    calculateColumns,
    observeFeedContainer,
    observeSidebarContainer,
    updateColumnsForContainer,
    getEffectiveColumns: () => effectiveColumns,
    applyMasonryPlacement,
  };
})();
