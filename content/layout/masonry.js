/**
 * @file masonry.js
 * @description Advanced JS-Driven Masonry Grid Engine, 2D Column Controller & Responsive Layout Manager for Reddit Pro.
 *
 * Core Capabilities:
 *  - High-performance 2D Column Geometry Engine (tracks column baselines, coordinates, and shortest-column balance)
 *  - Double-buffered RAF Scheduler with strict Read/Write phase separation (eliminates layout thrashing)
 *  - Frame-level container style caching (prevents repeated getComputedStyle reflows)
 *  - Zero-CLS Pre-Layout Aspect-Ratio Resolver (prevents layout jumping on image/video load)
 *  - Break Node Coordinator: synchronizes column baselines for full-width headers, carousels, and discovery modules
 *  - Infinite Scroll Sentinel Anchor: positions pagination sentinels reliably below the lowest column
 *  - Lifecycle-managed media listeners with WeakMap cleanup preventing memory leaks
 *  - Responsive container-driven column calculation (1-8 columns) with live sidebar tracking
 *  - Controlled layout diagnostics and telemetry (column balance ratio, height distribution, geometry metrics)
 */
// @ts-nocheck
window.RedditPro = window.RedditPro || {};

window.RedditPro.Masonry = (function () {
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

  const POST_SELECTORS = ['shreddit-post', 'shreddit-ad-post', 'article', '.Post'].join(',');

  const GRID_CONTAINERS = [
    'shreddit-feed',
    'shreddit-profile-feed',
    'profile-feed',
    '[data-testid="post-list"]',
    'main > div:has(> shreddit-post)',
    'main > div:has(> article)',
  ].join(',');

  const SENTINEL_SELECTORS = [
    '#feed-next-page-partial',
    '[slot="load-after"]',
    'faceplate-partial[src*="after="]',
    'faceplate-partial[src*="more-posts"]',
    'faceplate-partial[src*="/feeds/"]',
    'shreddit-async-loader[bundlename*="feed" i]',
    '[slot="more-posts"]',
    '[slot="load-more"]',
    'button[aria-label*="more posts" i]',
  ].join(',');

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * 1. 2D COLUMN GEOMETRY ENGINE
   * Tracks column baselines, coordinates, and shortest-column distribution.
   * ═══════════════════════════════════════════════════════════════════════════
   */
  class MasonryGeometry {
    constructor() {
      this.columns = 1;
      this.containerWidth = 0;
      this.colWidth = 0;
      this.colGap = 12;
      this.rowGap = 12;
      this.colHeights = new Float64Array(1);
      this.colTracks = new Uint32Array(1);
      this.colTracks.fill(1);
      this.cardPositions = new WeakMap();
    }

    reset(columns, containerWidth, colGap = 12, rowGap = 12) {
      this.columns = Math.max(1, columns);
      this.containerWidth = Math.max(0, containerWidth);
      this.colGap = Math.max(0, colGap);
      this.rowGap = Math.max(0, rowGap);
      this.colHeights = new Float64Array(this.columns);
      this.colTracks = new Uint32Array(this.columns);
      this.colTracks.fill(1);
      const totalGaps = (this.columns - 1) * this.colGap;
      const usableWidth = Math.max(0, this.containerWidth - totalGaps);
      this.colWidth =
        this.columns === 1
          ? usableWidth
          : this.columns > 0
            ? Math.max(160, usableWidth / this.columns)
            : usableWidth;
    }

    getShortestColumn() {
      if (this.columns <= 1) {
        return { col: 0, y: this.colHeights[0] || 0, track: this.colTracks[0] || 1 };
      }
      let minIdx = 0;
      let minY = this.colHeights[0];
      for (let i = 1; i < this.columns; i++) {
        if (this.colHeights[i] < minY) {
          minY = this.colHeights[i];
          minIdx = i;
        }
      }
      return { col: minIdx, y: minY, track: this.colTracks[minIdx] || 1 };
    }

    placeCard(card, height, customSpan) {
      const rowGap = this.rowGap || 12;
      const span = customSpan || Math.max(1, Math.ceil((height + rowGap) / (ROW_HEIGHT + rowGap)));
      const existing = this.cardPositions.get(card);
      if (existing) {
        const deltaHeight = height - existing.height;
        const deltaSpan = span - existing.span;
        existing.height = Math.round(height);
        existing.span = span;
        this.colHeights[existing.col] = Math.max(0, this.colHeights[existing.col] + deltaHeight);
        this.colTracks[existing.col] = Math.max(1, this.colTracks[existing.col] + deltaSpan);
        return existing;
      }

      const gridItem = card.closest ? card.closest('faceplate-tracker') || card : card;
      const savedColStr = gridItem.getAttribute ? gridItem.getAttribute('data-rg-col') : null;
      const savedCol = savedColStr !== null ? parseInt(savedColStr, 10) : -1;
      const isStable = gridItem.hasAttribute ? gridItem.hasAttribute('data-rg-stable') : false;

      let col, y, track;
      if (isStable && savedCol >= 0 && savedCol < this.columns) {
        // Locked: already loaded posts must NEVER shift or rearrange to another column
        col = savedCol;
        y = this.colHeights[col];
        track = this.colTracks[col] || 1;
      } else {
        // New post: place into the shortest column among already loaded posts
        const shortest = this.getShortestColumn();
        col = shortest.col;
        y = shortest.y;
        track = shortest.track || this.colTracks[col] || 1;
      }

      const x = col * (this.colWidth + this.colGap);
      const pos = {
        col,
        x: Math.round(x),
        y: Math.round(y),
        track: Math.max(1, Math.round(track)),
        span,
        width: Math.round(this.colWidth),
        height: Math.round(height),
      };
      this.colHeights[col] = y + height + this.rowGap;
      this.colTracks[col] = track + span;
      this.cardPositions.set(card, pos);
      return pos;
    }

    removeCard(card) {
      const existing = this.cardPositions.get(card);
      if (existing) {
        this.colHeights[existing.col] = Math.max(
          0,
          this.colHeights[existing.col] - (existing.height + this.rowGap)
        );
        this.cardPositions.delete(card);
      }
    }

    placeBreakNode(height, customSpan) {
      const rowGap = this.rowGap || 12;
      const span = customSpan || Math.max(1, Math.ceil((height + rowGap) / (ROW_HEIGHT + rowGap)));
      const maxY = this.getMaxHeight();
      const maxTrack = this.getMaxTrack();
      const pos = {
        col: -1,
        x: 0,
        y: Math.round(maxY),
        track: Math.max(1, Math.round(maxTrack)),
        span,
        width: '100%',
        height: Math.round(height),
      };
      const nextBaseline = maxY + height + this.rowGap;
      this.colHeights.fill(nextBaseline);
      this.colTracks.fill(maxTrack + span);
      return pos;
    }

    getMaxHeight() {
      let max = 0;
      for (let i = 0; i < this.colHeights.length; i++) {
        if (this.colHeights[i] > max) max = this.colHeights[i];
      }
      return max;
    }

    getMinHeight() {
      if (this.colHeights.length === 0) return 0;
      let min = this.colHeights[0];
      for (let i = 1; i < this.colHeights.length; i++) {
        if (this.colHeights[i] < min) min = this.colHeights[i];
      }
      return min;
    }

    getMaxTrack() {
      let max = 1;
      for (let i = 0; i < this.colTracks.length; i++) {
        if (this.colTracks[i] > max) max = this.colTracks[i];
      }
      return max;
    }

    getMinTrack() {
      if (this.colTracks.length === 0) return 1;
      let min = this.colTracks[0];
      for (let i = 1; i < this.colTracks.length; i++) {
        if (this.colTracks[i] < min) min = this.colTracks[i];
      }
      return min;
    }

    getColumnBalanceRatio() {
      const max = this.getMaxHeight();
      if (max <= 0) return 1;
      const min = this.getMinHeight();
      return Math.round((min / max) * 100) / 100;
    }
  }

  const geometry = new MasonryGeometry();

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * 2. STATE & CACHES
   * ═══════════════════════════════════════════════════════════════════════════
   */
  let resizePending = false;
  const resizeQueue = new Map(); // Card -> measured height
  const heightCache = new WeakMap();
  const mediaListeners = new WeakMap(); // Card -> array of cleanup functions
  const imgListeners = new WeakSet();

  let viewportSweepTimer = 0;
  let feedObserver = null;
  let activeObservedFeed = null;
  let lastFeedWidth = 0;
  let effectiveColumns = 0;
  let sidebarObserver = null;
  let activeObservedSidebar = null;

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

    const colGap = typeof settings.columnGap === 'number' && settings.columnGap >= 0 ? settings.columnGap : 12;
    const rowGap = typeof settings.rowGap === 'number' && settings.rowGap >= 0 ? settings.rowGap : 12;

    if (previousCols !== 0 && previousCols !== cols) {
      geometry.reset(cols, containerWidth, colGap, rowGap);
      sweepAll();
    } else if (previousCols === 0) {
      geometry.reset(cols, containerWidth, colGap, rowGap);
    } else {
      // Width changed slightly but column count is identical; update dimensions without wiping card positions or column heights!
      geometry.containerWidth = Math.max(0, containerWidth);
      geometry.colGap = Math.max(0, colGap);
      geometry.rowGap = Math.max(0, rowGap);
      const totalGaps = (geometry.columns - 1) * geometry.colGap;
      const usableWidth = Math.max(0, geometry.containerWidth - totalGaps);
      geometry.colWidth =
        geometry.columns === 1
          ? usableWidth
          : geometry.columns > 0
            ? Math.max(160, usableWidth / geometry.columns)
            : usableWidth;
    }

    const body = document.body;
    if (body) {
      body.style.setProperty('--reddit-cols', String(cols));
      body.setAttribute('data-reddit-grid-cols', String(cols));
    }
    const container = activeObservedFeed || getActiveFeedContainer();
    if (container) {
      container.style.setProperty('--reddit-cols', String(cols));
      container.style.setProperty('--rg-cols', String(cols));
      container.style.setProperty('--rg-col-width', `${Math.round(geometry.colWidth)}px`);
    }

    if (window.RedditPro.Diagnostics) {
      window.RedditPro.Diagnostics.checkLayout(container || body);
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
    if (!sidebar) {
      if (document.body) {
        document.body.style.setProperty('--reddit-sidebar-width', '0px');
      }
      return;
    }

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
              entry.borderBoxSize?.[0]?.inlineSize ??
              entry.target.getBoundingClientRect().width;
            if (document.body) {
              document.body.style.setProperty(
                '--reddit-sidebar-width',
                width > 0 ? `${Math.round(width)}px` : '0px'
              );
            }
          }
        });
      }
      sidebarObserver.observe(sidebar);
    }

    const rect = sidebar.getBoundingClientRect();
    if (document.body) {
      document.body.style.setProperty(
        '--reddit-sidebar-width',
        rect.width > 0 && !settings.hideSidebar ? `${Math.round(rect.width)}px` : '0px'
      );
    }
  }

  function observeFeedContainer() {
    observeSidebarContainer();
    const container = getActiveFeedContainer();
    if (!container) return;

    if (container !== activeObservedFeed) {
      if (activeObservedFeed?.style) {
        activeObservedFeed.style.removeProperty('min-height');
      }
      if (container.style) {
        container.style.removeProperty('min-height');
      }
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
    neutralizeEmptyBreakNodes(container);
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
    gridItem.style.removeProperty('grid-column-start');
    gridItem.style.removeProperty('grid-row-start');
    gridItem.style.removeProperty('--rg-x');
    gridItem.style.removeProperty('--rg-y');
    gridItem.style.removeProperty('--rg-w');
    gridItem.style.removeProperty('--rg-col');
    gridItem.removeAttribute('data-rg-span');
    gridItem.removeAttribute('data-rg-col');
    gridItem.removeAttribute('data-rg-track');
    gridItem.removeAttribute('data-rg-stable');
    gridItem.removeAttribute('data-rg-loading');
    heightCache.delete(card);
    geometry.removeCard(card);

    // Clean up media listeners
    const cleanups = mediaListeners.get(card);
    if (cleanups) {
      cleanups.forEach((fn) => fn());
      mediaListeners.delete(card);
    }
    imgListeners.delete(card);
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * 3. RESIZEOBSERVER & DOUBLE-BUFFERED RAF FLUSH
   * Caches container styles once per frame to eliminate layout thrashing.
   * ═══════════════════════════════════════════════════════════════════════════
   */
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

    // Frame-level container style cache to avoid redundant getComputedStyle calls
    const containerStyleCache = new Map();

    /** @param {Element} el */
    function getCachedContainerInfo(el) {
      const container = getGridContainer(el) || activeObservedFeed || getActiveFeedContainer();
      if (!container) {
        return { container: null, rowGap: 12, colGap: 12, isMultiCol: true };
      }
      let cached = containerStyleCache.get(container);
      if (!cached) {
        const computed = getComputedStyle(container);
        const columns = (computed.gridTemplateColumns || '').trim();
        const isMultiCol = columns ? columns.split(/\s+/).length > 1 : true;
        const parsedRowGap = parseFloat(computed.rowGap);
        const parsedColGap = parseFloat(computed.columnGap);
        const rowGap = Number.isFinite(parsedRowGap) ? parsedRowGap : 12;
        const colGap = Number.isFinite(parsedColGap) ? parsedColGap : 12;
        cached = { container, rowGap, colGap, isMultiCol };
        containerStyleCache.set(container, cached);
      }
      return cached;
    }

    // PHASE 1: BATCH PROCESSING OF DIRTY CARDS
    for (const [el, height] of resizeQueue) {
      if (height <= 0) {
        const gridItem = el.closest('faceplate-tracker') || el;
        clearGridItem(gridItem, el);
        continue;
      }

      const gridItem = el.closest('faceplate-tracker') || el;
      const { rowGap, isMultiCol, container } = getCachedContainerInfo(el);

      if (!isMultiCol) {
        clearGridItem(gridItem, el);
        continue;
      }

      // Compute row span with row gap consideration
      const span = Math.ceil((height + rowGap) / (ROW_HEIGHT + rowGap));
      const currentSpan = gridItem.getAttribute('data-rg-span');
      const expectedRowEnd = `span ${span}`;
      const currentRowEnd = gridItem.style.getPropertyValue('grid-row-end');

      // Place in 2D Geometry Engine
      const pos = geometry.placeCard(el, height, span);

      if (currentSpan !== String(span) || currentRowEnd !== expectedRowEnd) {
        gridItem.style.setProperty('grid-row-end', expectedRowEnd, 'important');
        gridItem.setAttribute('data-rg-span', String(span));
        gridItem.setAttribute('data-rg-stable', '1');
        gridItem.removeAttribute('data-rg-loading');
      } else if (!gridItem.hasAttribute('data-rg-stable')) {
        gridItem.setAttribute('data-rg-stable', '1');
        gridItem.removeAttribute('data-rg-loading');
      }

      // Enforce column and track placement in CSS Grid so shortest-column arrangement renders accurately
      if (geometry.columns > 1 && pos.col >= 0) {
        gridItem.style.setProperty('grid-column-start', String(pos.col + 1), 'important');
        gridItem.style.setProperty('grid-row-start', String(pos.track), 'important');
      } else {
        gridItem.style.removeProperty('grid-column-start');
        gridItem.style.removeProperty('grid-row-start');
      }

      // Inject 2D geometry coordinates
      gridItem.setAttribute('data-rg-col', String(pos.col));
      gridItem.setAttribute('data-rg-track', String(pos.track));
      gridItem.style.setProperty('--rg-x', `${pos.x}px`);
      gridItem.style.setProperty('--rg-y', `${pos.y}px`);
      gridItem.style.setProperty('--rg-col', String(pos.col));
      gridItem.style.setProperty('--rg-w', `${pos.width}px`);

      if (container) {
        const maxHeight = geometry.getMaxHeight();
        container.style.setProperty('--rg-total-height', `${Math.round(maxHeight)}px`);
        if (container.style) {
          container.style.minHeight = `${Math.round(maxHeight)}px`;
        }
      }
    }
    resizeQueue.clear();

    // Anchor the infinite scroll sentinel below the lowest column
    anchorSentinel(activeObservedFeed || getActiveFeedContainer());
    scheduleAutoAdjust(activeObservedFeed || getActiveFeedContainer());
  }

  /**
   * Anchors Reddit's infinite scroll sentinel element below the lowest column.
   * Ensures native IntersectionObserver triggers reliably without occlusion,
   * while completely neutralizing previous/spent batch sentinels to prevent full-width grid breaks.
   * @param {Element | null} container
   */
  function anchorSentinel(container) {
    if (!container) return;
    const allSentinels = Array.from(container.querySelectorAll(SENTINEL_SELECTORS)).filter((el) => {
      if (el.closest('shreddit-post, article, .Post, shreddit-profile-comment')) return false;
      if (el.querySelector('shreddit-post, article, .Post')) return false;
      return true;
    });

    if (allSentinels.length === 0) return;

    // The genuine active sentinel is the very last one at the bottom of the feed
    const activeSentinel = allSentinels[allSentinels.length - 1];

    // Deactivate and neutralize all previous, spent sentinels so they never break the grid
    for (let i = 0; i < allSentinels.length - 1; i++) {
      const old = allSentinels[i];
      old.removeAttribute('data-rg-sentinel');
      old.setAttribute('data-rg-spent-sentinel', '1');
      old.style.setProperty('display', 'none', 'important');
      old.style.removeProperty('grid-column');
      old.style.removeProperty('grid-row-end');
      old.style.removeProperty('--rg-sentinel-y');
    }

    const maxHeight = geometry.getMaxHeight();
    if (maxHeight > 0) {
      activeSentinel.style.setProperty('--rg-sentinel-y', `${Math.round(maxHeight)}px`);
    }
    activeSentinel.setAttribute('data-rg-sentinel', '1');
    activeSentinel.removeAttribute('data-rg-spent-sentinel');
    activeSentinel.style.setProperty('display', 'flex', 'important');
    activeSentinel.style.setProperty('grid-column', '1 / -1', 'important');
    activeSentinel.style.setProperty('width', '100%', 'important');
    activeSentinel.style.setProperty('min-height', '100px', 'important');
    activeSentinel.style.setProperty('align-items', 'center', 'important');
    activeSentinel.style.setProperty('justify-content', 'center', 'important');

    const maxTrack = geometry.getMaxTrack();
    const hasPosts = container.querySelector(POST_SELECTORS) !== null;
    if (hasPosts && maxTrack > 1) {
      activeSentinel.style.setProperty('grid-row-start', String(maxTrack + 1), 'important');
    } else {
      activeSentinel.style.removeProperty('grid-row-start');
    }
  }

  /**
   * Neutralizes zero-height or empty break nodes, spent sentinels, and in-feed discovery units
   * so they never create empty rows or gaps in CSS Grid.
   * @param {Element} container
   */
  function neutralizeEmptyBreakNodes(container) {
    if (!container) return;

    // Completely collapse and hide any hr, separator or divider elements anywhere in the feed
    container
      .querySelectorAll('hr, [role="separator"], shreddit-separator, [data-testid*="separator"], [data-testid*="divider"]')
      .forEach((sep) => {
        const sepEl = /** @type {any} */ (sep);
        if (sepEl.style) {
          sepEl.style.setProperty('display', 'none', 'important');
          sepEl.style.setProperty('height', '0px', 'important');
          sepEl.style.setProperty('margin', '0px', 'important');
          sepEl.style.setProperty('padding', '0px', 'important');
          sepEl.style.setProperty('border', 'none', 'important');
        }
      });

    Array.from(container.children).forEach((child) => {
      // Direct child separators must never occupy grid cells
      if (
        child.matches?.(
          'hr, [role="separator"], shreddit-separator, [data-testid*="separator"], [data-testid*="divider"]'
        )
      ) {
        child.style.setProperty('display', 'none', 'important');
        child.style.setProperty('height', '0px', 'important');
        child.style.setProperty('margin', '0px', 'important');
        child.style.setProperty('padding', '0px', 'important');
        child.style.removeProperty('grid-column');
        child.style.removeProperty('grid-row-end');
        return;
      }

      // Unloaded intermediate partials or loaders inside feed must not create empty cards or naked spinners
      if (
        child.matches?.('faceplate-partial, shreddit-async-loader') &&
        !child.hasAttribute?.('data-rg-sentinel') &&
        !child.querySelector?.('shreddit-post, article, .Post')
      ) {
        child.style.setProperty('display', 'none', 'important');
        return;
      }

      if (
        child.matches?.(POST_SELECTORS) ||
        child.matches?.('faceplate-tracker') ||
        child.matches?.(SENTINEL_SELECTORS) ||
        child.hasAttribute?.('data-rg-sentinel')
      ) {
        return;
      }

      // Hide spent sentinels completely
      if (
        child.hasAttribute?.('data-rg-spent-sentinel') ||
        child.matches?.('[data-rg-spent-sentinel="1"]')
      ) {
        child.style.setProperty('display', 'none', 'important');
        child.style.removeProperty('grid-column');
        return;
      }

      const rect = child.getBoundingClientRect ? child.getBoundingClientRect() : { height: 0 };
      // If height is 0, empty, or display is none, it must not occupy a grid row or span 1 / -1
      if (
        rect.height <= 0 &&
        !child.matches?.(
          'shreddit-feed-header, shreddit-profile-header, profile-header, shreddit-subreddit-header, shreddit-subreddit-banner, faceplate-tab-group, [role="tablist"], header, nav'
        )
      ) {
        child.style.removeProperty('grid-column');
        child.style.removeProperty('grid-row-end');
        child.removeAttribute('data-rg-break');
        child.removeAttribute('data-rg-span');
        return;
      }

      // In-feed widgets (discovery units, recommendation carousels) should span 1 column like cards
      if (
        child.matches?.(
          'shreddit-subreddit-discovery-unit, community-recommendations, shreddit-carousel, [data-testid*="discovery"], [data-testid*="recommendation"]'
        )
      ) {
        child.style.setProperty('grid-column', 'span 1', 'important');
        child.style.setProperty('max-width', '100%', 'important');
      }
    });
  }

  let autoAdjustPending = false;

  /**
   * Schedules RAF-debounced gap compaction and auto-adjustment.
   * @param {Element | null} [container]
   * @param {boolean} [force]
   */
  function scheduleAutoAdjust(container, force = false) {
    if (autoAdjustPending) return;
    autoAdjustPending = true;
    requestAnimationFrame(() => {
      autoAdjustPending = false;
      autoAdjustAndFillGaps(container || activeObservedFeed || getActiveFeedContainer(), force);
    });
  }

  /**
   * Auto-adjusts cards across columns to fill gaps and eliminate vertical voids.
   * Compares column heights and reassigns downstream cards to shorter columns.
   * @param {Element | null} [container]
   * @param {boolean} [forceRebalance]
   */
  function autoAdjustAndFillGaps(container, forceRebalance = false) {
    const feed = container || activeObservedFeed || getActiveFeedContainer();
    if (!feed) return;
    const settings = window.RedditPro.Settings ? window.RedditPro.Settings.get() : {};
    if (settings.columns === '1' || !settings.masonry) return;

    neutralizeEmptyBreakNodes(feed);

    const cols = geometry.columns;
    if (cols <= 1) return;

    const rowGap = getGridRowGap(feed) || geometry.rowGap || 12;

    // Check if feed has leading headers or banners before posts
    let initialTrack = 1;
    let initialHeight = 0;
    const headerEl = feed.querySelector?.(
      'shreddit-feed-header, shreddit-subreddit-header, shreddit-subreddit-banner, [slot="header"], [slot="banner"]'
    );
    if (headerEl && headerEl.parentElement === feed) {
      const hRect = headerEl.getBoundingClientRect();
      if (hRect.height > 0) {
        const hSpan = Math.ceil((hRect.height + rowGap) / (ROW_HEIGHT + rowGap));
        initialTrack = 1 + hSpan;
        initialHeight = hRect.height + rowGap;
      }
    }

    const virtualHeights = new Float64Array(cols);
    virtualHeights.fill(initialHeight);
    const virtualTracks = new Uint32Array(cols);
    virtualTracks.fill(initialTrack);

    const allCards = Array.from(feed.querySelectorAll(POST_SELECTORS)).filter(
      (c) => !(c.tagName.toLowerCase() === 'article' && c.querySelector('shreddit-post'))
    );

    for (const card of allCards) {
      const gridItem = card.closest('faceplate-tracker') || card;
      if (!gridItem || !card.isConnected) continue;

      // Skip completely hidden cards
      if (
        typeof getComputedStyle === 'function' &&
        getComputedStyle(gridItem).display === 'none'
      ) {
        clearGridItem(gridItem, card);
        continue;
      }

      const rect = card.getBoundingClientRect ? card.getBoundingClientRect() : { height: 0, top: 0 };
      const currentHeight =
        rect.height > 0
          ? rect.height
          : heightCache.get(card) || getEstimatedHeight(card) || 180;

      const span = Math.ceil((currentHeight + rowGap) / (ROW_HEIGHT + rowGap));
      const expectedRowEnd = `span ${span}`;

      if (gridItem.style.getPropertyValue('grid-row-end') !== expectedRowEnd) {
        gridItem.style.setProperty('grid-row-end', expectedRowEnd, 'important');
        gridItem.setAttribute('data-rg-span', String(span));
      }

      const currentCol = parseInt(gridItem.getAttribute('data-rg-col') ?? '-1', 10);
      const isAlreadyStable =
        !forceRebalance &&
        gridItem.hasAttribute('data-rg-stable') &&
        currentCol >= 0 &&
        currentCol < cols;

      let targetCol = currentCol;

      if (isAlreadyStable) {
        // Locked: already loaded posts must NEVER shift or rearrange to another column
        targetCol = currentCol;
      } else {
        // New post: find the shortest column among already loaded posts to fit in seamlessly!
        let shortestIdx = 0;
        let minH = virtualHeights[0];
        for (let c = 1; c < cols; c++) {
          if (virtualHeights[c] < minH) {
            minH = virtualHeights[c];
            shortestIdx = c;
          }
        }
        targetCol = shortestIdx;
      }

      const track = virtualTracks[targetCol];

      // Register or update in geometry cardPositions
      geometry.cardPositions.set(card, {
        col: targetCol,
        x: Math.round(targetCol * (geometry.colWidth + geometry.colGap)),
        y: Math.round(virtualHeights[targetCol]),
        track,
        span,
        width: Math.round(geometry.colWidth),
        height: Math.round(currentHeight),
      });

      virtualHeights[targetCol] += currentHeight + rowGap;
      virtualTracks[targetCol] += span;
      const colAttr = String(targetCol);

      if (gridItem.getAttribute('data-rg-col') !== colAttr) {
        gridItem.setAttribute('data-rg-col', colAttr);
        gridItem.style.setProperty('--rg-col', colAttr);
      }
      gridItem.style.setProperty('grid-column-start', String(targetCol + 1), 'important');
      gridItem.style.setProperty('grid-row-start', String(track), 'important');
      gridItem.setAttribute('data-rg-track', String(track));

      gridItem.setAttribute('data-rg-stable', '1');
      gridItem.removeAttribute('data-rg-loading');
    }

    // Sync geometry column heights and tracks with virtual values
    for (let c = 0; c < cols; c++) {
      geometry.colHeights[c] = virtualHeights[c];
      geometry.colTracks[c] = virtualTracks[c];
    }

    const maxHeight = geometry.getMaxHeight();
    if (feed) {
      feed.style.setProperty('--rg-total-height', `${Math.round(maxHeight)}px`);
      if (feed.style) {
        feed.style.minHeight = `${Math.round(maxHeight)}px`;
      }
    }

    anchorSentinel(feed);
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
   * Registers cleanup functions in mediaListeners WeakMap to prevent memory leaks.
   * @param {Element} el
   */
  function attachImageListeners(el) {
    if (imgListeners.has(el)) return;
    imgListeners.add(el);

    const cleanups = [];
    const media = getMediaElementsDeep(el);

    media.forEach((node) => {
      const tag = node.tagName.toLowerCase();
      if (tag === 'img' && !node.complete) {
        const onLoad = () => recalculateCard(el);
        const onError = () => recalculateCard(el);
        node.addEventListener('load', onLoad, { once: true, passive: true });
        node.addEventListener('error', onError, { once: true, passive: true });
        cleanups.push(() => {
          node.removeEventListener('load', onLoad);
          node.removeEventListener('error', onError);
        });
      } else if (tag === 'video' && node.readyState < 3) {
        const onLoadedData = () => recalculateCard(el);
        node.addEventListener('loadeddata', onLoadedData, { once: true, passive: true });
        cleanups.push(() => {
          node.removeEventListener('loadeddata', onLoadedData);
        });
      }
    });

    if (cleanups.length > 0) {
      mediaListeners.set(el, cleanups);
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * 4. ZERO-CLS MEDIA & ASPECT RATIO ESTIMATION
   * Pre-allocates column slots before media loads, eliminating CLS.
   * ═══════════════════════════════════════════════════════════════════════════
   */
  function getEstimatedHeight(el) {
    if (!el || typeof el.getBoundingClientRect !== 'function') return 0;
    const rect = el.getBoundingClientRect();
    if (rect.height > 120) return rect.height;

    // Check for aspect ratio on the card or media child
    const aspectEl = el.querySelector?.('[id$="-aspect-ratio"], shreddit-aspect-ratio');
    const ratioVal =
      el.style?.getPropertyValue?.('--card-aspect-ratio') ||
      el.getAttribute?.('style')?.match(/--card-aspect-ratio:\s*([0-9./]+)/)?.[1] ||
      aspectEl?.style?.aspectRatio ||
      aspectEl?.getAttribute?.('aspect-ratio') ||
      aspectEl?.getAttribute?.('style')?.match(/aspect-ratio:\s*([0-9./]+)/)?.[1];

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
        const grid = getGridContainer(el);
        const gridWidth =
          grid && grid.getBoundingClientRect
            ? grid.getBoundingClientRect().width
            : typeof window !== 'undefined'
              ? window.innerWidth
              : 1200;
        const cols =
          effectiveColumns ||
          parseInt(document.body?.style.getPropertyValue('--reddit-cols'), 10) ||
          3;
        const colGap = getGridRowGap(el) || 12;
        const cardWidth = Math.max(180, (gridWidth - (cols - 1) * colGap) / cols);
        const mediaHeight = Math.min(720, cardWidth / ratio);
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
        const grid = getGridContainer(el);
        const gridWidth =
          grid && grid.getBoundingClientRect
            ? grid.getBoundingClientRect().width
            : typeof window !== 'undefined'
              ? window.innerWidth
              : 1200;
        const cols = effectiveColumns || 3;
        const cardWidth = Math.max(180, gridWidth / cols);
        const mediaHeight = Math.min(720, cardWidth / ratio);
        return Math.round(mediaHeight + 124);
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
      const preallocHeight = estimated > 80 ? estimated : 180;
      if (!gridItem.hasAttribute('data-rg-span')) {
        const rowGap = getGridRowGap(gridItem);
        const initialSpan = Math.ceil((preallocHeight + rowGap) / (ROW_HEIGHT + rowGap));
        gridItem.style.setProperty('grid-row-end', `span ${initialSpan}`, 'important');
        gridItem.setAttribute('data-rg-span', String(initialSpan));
      }

      const currentHeight = el.getBoundingClientRect ? el.getBoundingClientRect().height : 0;
      if (currentHeight > 0) {
        heightCache.set(el, currentHeight);
        resizeQueue.set(el, currentHeight);
        if (!resizePending) {
          resizePending = true;
          requestAnimationFrame(flush);
        }
      } else {
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
      }
    } else {
      observer.unobserve(el);
      clearGridItem(gridItem, el);
    }
  }

  function processBatch(batchNode) {
    if (!batchNode) return;
    const settings = window.RedditPro.Settings.get();
    if (settings.columns === '1' || !settings.masonry) return;

    const rawPosts = batchNode.matches?.(POST_SELECTORS)
      ? [batchNode]
      : Array.from(batchNode.querySelectorAll?.(POST_SELECTORS) || []);

    const posts = rawPosts.filter(
      (p) => !(p.tagName.toLowerCase() === 'article' && p.querySelector('shreddit-post'))
    );

    posts.forEach((post) => {
      const gridItem = post.closest('faceplate-tracker') || post;
      if (!gridItem.hasAttribute('data-rg-stable')) {
        processCard(post, false);
      }
    });

    processGridHeaders(false);
    neutralizeEmptyBreakNodes(activeObservedFeed || getActiveFeedContainer());
    anchorSentinel(activeObservedFeed || getActiveFeedContainer());
    scheduleAutoAdjust(activeObservedFeed || getActiveFeedContainer());
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * 5. BREAK NODE & HEADER COORDINATOR
   * Synchronizes column baselines across full-width elements.
   * ═══════════════════════════════════════════════════════════════════════════
   */
  function processHeader(child, force = false) {
    if (!child || child.nodeType !== 1) return;

    // Never process sentinels as headers
    if (
      child.matches?.(SENTINEL_SELECTORS) ||
      child.hasAttribute?.('data-rg-sentinel') ||
      child.hasAttribute?.('data-rg-spent-sentinel')
    ) {
      return;
    }

    if (child.style.getPropertyValue('grid-column') !== '1 / -1') {
      child.style.setProperty('grid-column', '1 / -1', 'important');
    }

    const rect = child.getBoundingClientRect ? child.getBoundingClientRect() : { height: 0 };
    const height = rect.height;

    // Never allocate grid row spans or full-width breaks to hidden, empty, or zero-height elements
    if (height <= 0) {
      child.style.removeProperty('grid-row-end');
      child.removeAttribute('data-rg-span');
      child.removeAttribute('data-rg-stable');
      child.removeAttribute('data-rg-loading');
      child.removeAttribute('data-rg-break');
      heightCache.delete(child);
      observer.observe(child);
      return;
    }

    const rowGap = getGridRowGap(child);
    const span = Math.ceil((height + rowGap) / (ROW_HEIGHT + rowGap));
    const expectedRowEnd = `span ${span}`;
    const currentSpan = child.getAttribute('data-rg-span');

    // Register break node in 2D geometry engine
    const pos = geometry.placeBreakNode(height, span);
    child.style.setProperty('--rg-break-y', `${pos.y}px`);
    child.style.setProperty('grid-column', '1 / -1', 'important');
    child.style.setProperty('grid-row-start', String(pos.track), 'important');
    child.setAttribute('data-rg-break', '1');
    child.setAttribute('data-rg-track', String(pos.track));

    if (force || currentSpan !== String(span)) {
      child.style.setProperty('grid-row-end', expectedRowEnd, 'important');
      child.setAttribute('data-rg-span', String(span));
      child.setAttribute('data-rg-stable', '1');
      child.removeAttribute('data-rg-loading');
      heightCache.set(child, height);
    }

    observer.observe(child);
  }

  function processGridHeaders(force = false) {
    const settings = window.RedditPro.Settings.get();
    if (settings.columns === '1' || !settings.masonry) return;
    document.querySelectorAll(GRID_CONTAINERS).forEach((container) => {
      Array.from(container.children).forEach((child) => {
        if (
          child.matches(POST_SELECTORS) ||
          child.matches(SENTINEL_SELECTORS) ||
          child.hasAttribute('data-rg-sentinel') ||
          child.hasAttribute('data-rg-spent-sentinel') ||
          child.matches(
            'faceplate-tracker, faceplate-batch, shreddit-async-loader, faceplate-partial, hr, style, script, template, link, community-recommendations, shreddit-subreddit-discovery-unit, shreddit-carousel, [data-testid*="discovery"], [data-testid*="recommendation"]'
          )
        )
          return;

        // Skip items that are transparent to layout
        if (
          typeof getComputedStyle === 'function' &&
          getComputedStyle(child).display === 'contents'
        ) {
          return;
        }

        if (child.style.getPropertyValue('grid-column') !== '1 / -1') {
          child.style.setProperty('grid-column', '1 / -1', 'important');
        }

        if (force || !child.hasAttribute('data-rg-stable')) {
          if (force) {
            child.removeAttribute('data-rg-stable');
            child.removeAttribute('data-rg-loading');
            heightCache.delete(child);
          }
          processHeader(child, force);
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
    neutralizeEmptyBreakNodes(activeObservedFeed || getActiveFeedContainer());
    anchorSentinel(activeObservedFeed || getActiveFeedContainer());
    scheduleAutoAdjust(activeObservedFeed || getActiveFeedContainer());
  }

  function sweepAll() {
    observeFeedContainer();
    const container = activeObservedFeed || getActiveFeedContainer();
    if (container?.style) {
      container.style.removeProperty('min-height');
    }
    if (container) {
      const rect = container.getBoundingClientRect();
      const settings = window.RedditPro.Settings ? window.RedditPro.Settings.get() : {};
      const colGap = typeof settings.columnGap === 'number' ? settings.columnGap : 12;
      const rowGap = typeof settings.rowGap === 'number' ? settings.rowGap : 12;
      geometry.reset(effectiveColumns || 3, rect.width || 1200, colGap, rowGap);
    }

    document.querySelectorAll(POST_SELECTORS).forEach((el) => {
      const gridItem = el.closest('faceplate-tracker') || el;
      gridItem.removeAttribute('data-rg-stable');
      gridItem.removeAttribute('data-rg-loading');
      heightCache.delete(el);
      processCard(el, true);
    });
    processGridHeaders(true);
    anchorSentinel(container);
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
   * Recalculates layout for a single mutated card (e.g. media loaded or text expanded)
   * @param {Element} el
   */
  function recalculateCard(el) {
    heightCache.delete(el);
    processCard(el, true);
    scheduleAutoAdjust();
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * 6. CONTROLLED DIAGNOSTICS & TELEMETRY
   * ═══════════════════════════════════════════════════════════════════════════
   */
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
          columnHeights: Array.from(geometry.colHeights),
          columnBalanceRatio: geometry.getColumnBalanceRatio(),
          maxHeight: Math.round(geometry.getMaxHeight()),
        };
        this.log('Layout Geometry', info);
        return info;
      } catch {
        return null;
      }
    },
    getLayoutMetrics() {
      return {
        columns: geometry.columns,
        colWidth: Math.round(geometry.colWidth),
        colHeights: Array.from(geometry.colHeights),
        maxHeight: Math.round(geometry.getMaxHeight()),
        minHeight: Math.round(geometry.getMinHeight()),
        balanceRatio: geometry.getColumnBalanceRatio(),
      };
    },
  };

  return {
    processCard,
    processBatch,
    sweepNew,
    sweepAll,
    disconnectAll,
    recalculateCard,
    attachImageListeners,
    calculateColumns,
    observeFeedContainer,
    observeSidebarContainer,
    updateColumnsForContainer,
    autoAdjustAndFillGaps,
    scheduleAutoAdjust,
    getEffectiveColumns: () => effectiveColumns,
    getGeometry: () => geometry,
  };
})();
