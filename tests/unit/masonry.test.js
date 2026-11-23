import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.resolve(process.cwd(), 'content/layout/masonry.js'), 'utf8');

describe('Masonry layout engine & responsive columns', () => {
  let frames;
  let resizeObserver;
  let mockResizeCallbacks;

  beforeEach(() => {
    frames = [];
    mockResizeCallbacks = [];
    window.requestAnimationFrame = (callback) => {
      frames.push(callback);
      return frames.length;
    };

    class MockResizeObserver {
      constructor(callback) {
        this.callback = callback;
        this.observe = vi.fn();
        this.unobserve = vi.fn();
        this.disconnect = vi.fn();
        resizeObserver = this;
        mockResizeCallbacks.push(this);
      }
    }

    globalThis.ResizeObserver = MockResizeObserver;
    window.RedditPro = {
      Settings: {
        get: () => ({
          columns: '3',
          autoFit: false,
          masonry: true,
          minCardWidth: 280,
          maxColumns: 8,
          columnGap: 12,
          rowGap: 12,
        }),
      },
    };
    eval(source);
  });

  afterEach(() => {
    window.RedditPro.Masonry?.disconnectAll();
    document.body.replaceChildren();
    frames = [];
    delete globalThis.ResizeObserver;
    vi.restoreAllMocks();
  });

  function runFrames() {
    let guard = 0;
    while (frames.length && guard < 20) {
      const callbacks = frames.splice(0);
      callbacks.forEach((callback) => callback());
      guard += 1;
    }
  }

  function makeGrid(columns = '160px 160px') {
    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = columns;
    grid.style.rowGap = '10px';

    const tracker = document.createElement('faceplate-tracker');
    const card = document.createElement('shreddit-post');
    grid.append(tracker);
    tracker.append(card);
    document.body.append(grid);

    card.getBoundingClientRect = () => ({
      width: 160,
      height: 240,
      top: 0,
      right: 160,
      bottom: 240,
      left: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    return { grid, tracker, card };
  }

  describe('Card measurement & stability', () => {
    it('measures a card, applies the correct span and marks it stable immediately', () => {
      const { tracker, card } = makeGrid();

      window.RedditPro.Masonry.processCard(card);
      runFrames();

      expect(resizeObserver.observe).toHaveBeenCalledWith(card);
      expect(tracker.getAttribute('data-rg-span')).toBe('23');
      expect(tracker.style.gridRowEnd).toBe('span 23');
      expect(tracker.getAttribute('data-rg-stable')).toBe('1');
      expect(tracker.hasAttribute('data-rg-loading')).toBe(false);
    });

    it('clears stale masonry spans when the responsive grid becomes one column', () => {
      const { grid, tracker, card } = makeGrid('320px');
      tracker.style.setProperty('grid-row-end', 'span 80', 'important');
      tracker.setAttribute('data-rg-span', '80');
      tracker.setAttribute('data-rg-stable', '1');

      window.RedditPro.Masonry.processCard(card);

      expect(resizeObserver.unobserve).toHaveBeenCalledWith(card);
      expect(tracker.style.getPropertyValue('grid-row-end')).toBe('');
      expect(tracker.hasAttribute('data-rg-span')).toBe(false);
      expect(tracker.hasAttribute('data-rg-stable')).toBe(false);
      expect(grid.style.gridTemplateColumns).toBe('320px');
    });

    it('re-measures cards during a full sweep even without a new ResizeObserver entry', () => {
      const { tracker, card } = makeGrid();
      window.RedditPro.Masonry.processCard(card);
      runFrames();
      tracker.style.setProperty('grid-row-end', 'span 4', 'important');

      window.RedditPro.Masonry.sweepAll();
      runFrames();

      expect(tracker.style.gridRowEnd).toBe('span 23');
    });
  });

  describe('Responsive column calculation (calculateColumns)', () => {
    it('calculates 5 columns when sufficient space exists', () => {
      // 1500px container width: (1500 + 12) / (280 + 12) = 1512 / 292 = 5.17 -> 5 cols
      const cols = window.RedditPro.Masonry.calculateColumns(1500, {
        columns: '6',
        autoFit: false,
        minCardWidth: 280,
        maxColumns: 8,
        columnGap: 12,
      });
      expect(cols).toBe(5);
    });

    it('calculates 6, 7, and 8 columns when space allows', () => {
      // 1800px: (1812 / 292) = 6.20 -> 6 cols
      expect(window.RedditPro.Masonry.calculateColumns(1800, { autoFit: true })).toBe(6);

      // 2100px: (2112 / 292) = 7.23 -> 7 cols
      expect(window.RedditPro.Masonry.calculateColumns(2100, { autoFit: true })).toBe(7);

      // 2400px: (2412 / 292) = 8.26 -> 8 cols (capped at maxColumns 8)
      expect(window.RedditPro.Masonry.calculateColumns(2400, { autoFit: true })).toBe(8);
    });

    it('decreases column count when container becomes narrower', () => {
      const wideCols = window.RedditPro.Masonry.calculateColumns(1500, { autoFit: true });
      const narrowCols = window.RedditPro.Masonry.calculateColumns(880, { autoFit: true });
      expect(wideCols).toBe(5);
      expect(narrowCols).toBe(3);
    });

    it('increases column count when container becomes wider', () => {
      const startCols = window.RedditPro.Masonry.calculateColumns(900, { autoFit: true });
      const expandedCols = window.RedditPro.Masonry.calculateColumns(1800, { autoFit: true });
      expect(startCols).toBe(3);
      expect(expandedCols).toBe(6);
    });

    it('strictly respects minimum card width so cards never get squished', () => {
      // 500px cannot fit two 280px cards with 12px gap (requires at least 280*2 + 12 = 572px)
      const cols = window.RedditPro.Masonry.calculateColumns(500, {
        autoFit: true,
        minCardWidth: 280,
        columnGap: 12,
      });
      expect(cols).toBe(1);
    });

    it('strictly respects manual maximum column setting when autoFit is disabled', () => {
      // 2400px could fit 8 columns, but user chose 4
      const cols = window.RedditPro.Masonry.calculateColumns(2400, {
        columns: '4',
        autoFit: false,
        maxColumns: 8,
      });
      expect(cols).toBe(4);
    });

    it('returns 1 column when settings.columns is "1"', () => {
      const cols = window.RedditPro.Masonry.calculateColumns(2400, {
        columns: '1',
        autoFit: true,
      });
      expect(cols).toBe(1);
    });
  });

  describe('Container ResizeObserver & sidebar expansion/collapse', () => {
    it('updates effective columns and body attributes when container is observed', () => {
      const feed = document.createElement('shreddit-feed');
      feed.getBoundingClientRect = () => ({
        width: 1500,
        height: 2000,
        top: 0,
        right: 1500,
        bottom: 2000,
        left: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });
      document.body.append(feed);

      window.RedditPro.Settings.get = () => ({
        columns: '6',
        autoFit: true,
        masonry: true,
        minCardWidth: 280,
        maxColumns: 8,
        columnGap: 12,
      });

      window.RedditPro.Masonry.observeFeedContainer();

      expect(document.body.getAttribute('data-reddit-grid-cols')).toBe('5');
      expect(document.body.style.getPropertyValue('--reddit-cols')).toBe('5');
      expect(window.RedditPro.Masonry.getEffectiveColumns()).toBe(5);
    });

    it('recalculates columns dynamically when sidebar expands or collapses', () => {
      const feed = document.createElement('shreddit-feed');
      let currentWidth = 1600; // Sidebar collapsed: fits 5 columns (1612 / 292 = 5.5)
      feed.getBoundingClientRect = () => ({
        width: currentWidth,
        height: 2000,
        top: 0,
        right: currentWidth,
        bottom: 2000,
        left: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });
      document.body.append(feed);

      window.RedditPro.Settings.get = () => ({
        columns: '8',
        autoFit: true,
        masonry: true,
        minCardWidth: 280,
        maxColumns: 8,
        columnGap: 12,
      });

      // Initial state
      window.RedditPro.Masonry.observeFeedContainer();
      expect(window.RedditPro.Masonry.getEffectiveColumns()).toBe(5);

      // Simulate sidebar expands (takes 280px from feed -> width becomes 1150px)
      currentWidth = 1150; // (1162 / 292) = 3.97 -> 3 columns
      window.RedditPro.Masonry.updateColumnsForContainer(currentWidth);
      expect(window.RedditPro.Masonry.getEffectiveColumns()).toBe(3);
      expect(document.body.getAttribute('data-reddit-grid-cols')).toBe('3');

      // Simulate sidebar collapses back (width becomes 1800px -> 6 columns)
      currentWidth = 1800; // (1812 / 292) = 6.2 -> 6 columns
      window.RedditPro.Masonry.updateColumnsForContainer(currentWidth);
      expect(window.RedditPro.Masonry.getEffectiveColumns()).toBe(6);
      expect(document.body.getAttribute('data-reddit-grid-cols')).toBe('6');
    });

    it('provides controlled layout diagnostics when enabled', () => {
      window.__RP_DEBUG = true;
      const feed = document.createElement('shreddit-feed');
      document.body.append(feed);

      const info = window.RedditPro.Diagnostics.checkLayout(feed);
      expect(info).not.toBeNull();
      expect(info).toHaveProperty('containerWidth');
      expect(info).toHaveProperty('calculatedColumnCount');
      window.__RP_DEBUG = false;
    });

    it('observes sidebar and updates --reddit-sidebar-width dynamically', () => {
      const sidebar = document.createElement('div');
      sidebar.id = 'left-sidebar-container';
      sidebar.getBoundingClientRect = () => ({
        width: 56,
        height: 800,
        top: 0,
        right: 56,
        bottom: 800,
        left: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });
      document.body.append(sidebar);

      window.RedditPro.Settings.get = () => ({
        columns: '4',
        hideSidebar: false,
      });

      window.RedditPro.Masonry.observeSidebarContainer();
      expect(document.body.style.getPropertyValue('--reddit-sidebar-width')).toBe('56px');

      // Expand sidebar
      sidebar.getBoundingClientRect = () => ({
        width: 272,
        height: 800,
        top: 0,
        right: 272,
        bottom: 800,
        left: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });
      window.RedditPro.Masonry.observeSidebarContainer();
      expect(document.body.style.getPropertyValue('--reddit-sidebar-width')).toBe('272px');

      // Hide sidebar setting
      window.RedditPro.Settings.get = () => ({
        columns: '4',
        hideSidebar: true,
      });
      window.RedditPro.Masonry.observeSidebarContainer();
      expect(document.body.style.getPropertyValue('--reddit-sidebar-width')).toBe('0px');
    });

    it('protects already stable cards from being re-measured or shifted', () => {
      const { tracker, card } = makeGrid();
      tracker.setAttribute('data-rg-stable', '1');
      tracker.setAttribute('data-rg-span', '45');
      tracker.style.setProperty('grid-row-end', 'span 45', 'important');

      // Calling processCard without force should respect stability
      window.RedditPro.Masonry.processCard(card, false);
      expect(tracker.getAttribute('data-rg-span')).toBe('45');
      expect(tracker.style.gridRowEnd).toBe('span 45');
    });

    it('processes only new unmeasured posts in a batch leaving stable posts untouched', () => {
      const { grid, tracker: stableTracker } = makeGrid();
      stableTracker.setAttribute('data-rg-stable', '1');
      stableTracker.setAttribute('data-rg-span', '50');
      stableTracker.style.setProperty('grid-row-end', 'span 50', 'important');

      const batch = document.createElement('faceplate-batch');
      const newTracker = document.createElement('faceplate-tracker');
      const newCard = document.createElement('shreddit-post');
      newCard.getBoundingClientRect = () => ({
        width: 160,
        height: 300,
        top: 0,
        right: 160,
        bottom: 300,
        left: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });
      newTracker.append(newCard);
      batch.append(newTracker);
      grid.append(batch);

      window.RedditPro.Masonry.processBatch(batch);
      runFrames();

      // Stable post is 100% untouched
      expect(stableTracker.getAttribute('data-rg-span')).toBe('50');
      expect(stableTracker.style.gridRowEnd).toBe('span 50');

      // New post receives its span
      expect(newTracker.getAttribute('data-rg-span')).toBe('29');
      expect(newTracker.getAttribute('data-rg-stable')).toBe('1');
    });

    it('pre-allocates row spans using aspect ratio to eliminate layout shift', () => {
      const grid = document.createElement('div');
      grid.style.display = 'grid';
      grid.style.gridTemplateColumns = '300px 300px';
      grid.style.rowGap = '10px';
      document.body.append(grid);

      const tracker = document.createElement('faceplate-tracker');
      const card = document.createElement('shreddit-post');
      card.style.setProperty('--card-aspect-ratio', '1.5');
      card.getBoundingClientRect = () => ({
        width: 300,
        height: 60, // Image not yet loaded, rect is tiny
        top: 0,
        right: 300,
        bottom: 60,
        left: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });
      tracker.append(card);
      grid.append(tracker);

      window.RedditPro.Masonry.processCard(card);

      // Estimated height: 300 / 1.5 + 124 = 324px. Span: ceil((324 + 10) / 11) = 31
      expect(parseInt(tracker.getAttribute('data-rg-span'), 10)).toBeGreaterThan(20);
      expect(tracker.style.gridRowEnd).toMatch(/^span \d+$/);
    });

    it('verifies CSS rules enforce header z-index clearance above cards and content', () => {
      const layoutCss = fs.readFileSync(
        path.resolve(process.cwd(), 'content/styles/layout.css'),
        'utf8'
      );
      const cardsCss = fs.readFileSync(
        path.resolve(process.cwd(), 'content/styles/cards.css'),
        'utf8'
      );

      // Topbar clearance rule
      expect(layoutCss).toMatch(/reddit-header-large[\s\S]*?z-index:\s*100\s*!important/);
      expect(layoutCss).toMatch(/shreddit-app > header[\s\S]*?z-index:\s*100\s*!important/);
      expect(layoutCss).toMatch(/reddit-header-large[\s\S]*?grid-column:\s*1\s*\/\s*-1\s*!important/);
      expect(layoutCss).toMatch(/shreddit-app\s*\{[\s\S]*?padding-top:\s*0\s*!important/);
      expect(layoutCss).toMatch(/faceplate-partial\s*\{[\s\S]*?display:\s*contents\s*!important/);

      // Card stacking isolation rule
      expect(cardsCss).toMatch(/shreddit-post[\s\S]*?isolation:\s*isolate\s*!important/);

      // Main content wrapper stacking containment
      expect(layoutCss).toMatch(/z-index:\s*1\s*!important/);
    });
  });

  describe('JS-Driven 2D Masonry Engine & Shortest-Column Placement', () => {
    it('tracks 2D coordinates and places cards into the shortest column', () => {
      const feed = document.createElement('shreddit-feed');
      feed.style.display = 'grid';
      feed.style.gridTemplateColumns = '300px 300px 300px';
      feed.style.columnGap = '12px';
      feed.style.rowGap = '12px';
      feed.getBoundingClientRect = () => ({
        width: 924,
        height: 1000,
        top: 0,
        right: 924,
        bottom: 1000,
        left: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });
      document.body.append(feed);

      window.RedditPro.Settings.get = () => ({
        columns: '3',
        masonry: true,
        columnGap: 12,
        rowGap: 12,
      });

      window.RedditPro.Masonry.observeFeedContainer();

      const geom = window.RedditPro.Masonry.getGeometry();
      expect(geom.columns).toBe(3);

      // Card 1: 400px -> Col 0
      const card1 = document.createElement('shreddit-post');
      const tracker1 = document.createElement('faceplate-tracker');
      tracker1.append(card1);
      feed.append(tracker1);
      card1.getBoundingClientRect = () => ({
        width: 300,
        height: 400,
        top: 0,
        right: 300,
        bottom: 400,
        left: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });
      window.RedditPro.Masonry.processCard(card1);
      runFrames();

      expect(tracker1.getAttribute('data-rg-col')).toBe('0');
      expect(tracker1.style.getPropertyValue('--rg-x')).toBe('0px');
      expect(tracker1.style.getPropertyValue('--rg-y')).toBe('0px');

      // Card 2: 200px -> Col 1
      const card2 = document.createElement('shreddit-post');
      const tracker2 = document.createElement('faceplate-tracker');
      tracker2.append(card2);
      feed.append(tracker2);
      card2.getBoundingClientRect = () => ({
        width: 300,
        height: 200,
        top: 0,
        right: 300,
        bottom: 200,
        left: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });
      window.RedditPro.Masonry.processCard(card2);
      runFrames();

      expect(tracker2.getAttribute('data-rg-col')).toBe('1');
      expect(tracker2.style.getPropertyValue('--rg-x')).toBe('312px');
      expect(tracker2.style.getPropertyValue('--rg-y')).toBe('0px');

      // Card 3: 300px -> Col 2
      const card3 = document.createElement('shreddit-post');
      const tracker3 = document.createElement('faceplate-tracker');
      tracker3.append(card3);
      feed.append(tracker3);
      card3.getBoundingClientRect = () => ({
        width: 300,
        height: 300,
        top: 0,
        right: 300,
        bottom: 300,
        left: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });
      window.RedditPro.Masonry.processCard(card3);
      runFrames();

      expect(tracker3.getAttribute('data-rg-col')).toBe('2');

      // Card 4: 150px -> Shortest column is Col 1 (height 200 vs Col 0: 400, Col 2: 300)
      const card4 = document.createElement('shreddit-post');
      const tracker4 = document.createElement('faceplate-tracker');
      tracker4.append(card4);
      feed.append(tracker4);
      card4.getBoundingClientRect = () => ({
        width: 300,
        height: 150,
        top: 0,
        right: 300,
        bottom: 150,
        left: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });
      window.RedditPro.Masonry.processCard(card4);
      runFrames();

      // Card 4 must be placed into column 1 at Y = 200 + 12 = 212px!
      expect(tracker4.getAttribute('data-rg-col')).toBe('1');
      expect(tracker4.style.getPropertyValue('--rg-x')).toBe('312px');
      expect(tracker4.style.getPropertyValue('--rg-y')).toBe('212px');
      expect(tracker1.style.getPropertyValue('grid-column-start')).toBe('1');
      expect(tracker2.style.getPropertyValue('grid-column-start')).toBe('2');
      expect(tracker3.style.getPropertyValue('grid-column-start')).toBe('3');
      expect(tracker4.style.getPropertyValue('grid-column-start')).toBe('2');
    });

    it('synchronizes baselines across all columns when a full-width break node is placed', () => {
      const feed = document.createElement('shreddit-feed');
      feed.style.display = 'grid';
      feed.style.gridTemplateColumns = '300px 300px';
      feed.getBoundingClientRect = () => ({
        width: 612,
        height: 800,
        top: 0,
        right: 612,
        bottom: 800,
        left: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });
      document.body.append(feed);

      window.RedditPro.Settings.get = () => ({
        columns: '2',
        masonry: true,
        columnGap: 12,
        rowGap: 12,
      });

      window.RedditPro.Masonry.observeFeedContainer();

      // Simulate a full-width header
      const header = document.createElement('shreddit-feed-header');
      header.getBoundingClientRect = () => ({
        width: 612,
        height: 100,
        top: 0,
        right: 612,
        bottom: 100,
        left: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });
      feed.append(header);

      window.RedditPro.Masonry.sweepNew();
      runFrames();

      expect(header.getAttribute('data-rg-break')).toBe('1');
      expect(header.style.gridColumn).toBe('1 / -1');

      // Subsequent card starts below header (100 + 12 = 112px)
      const card = document.createElement('shreddit-post');
      const tracker = document.createElement('faceplate-tracker');
      tracker.append(card);
      feed.append(tracker);
      card.getBoundingClientRect = () => ({
        width: 300,
        height: 200,
        top: 0,
        right: 300,
        bottom: 200,
        left: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });
      window.RedditPro.Masonry.processCard(card);
      runFrames();

      expect(tracker.style.getPropertyValue('--rg-y')).toBe('112px');
    });

    it('anchors the infinite scroll sentinel below the highest column baseline', () => {
      const feed = document.createElement('shreddit-feed');
      feed.style.display = 'grid';
      feed.style.gridTemplateColumns = '300px 300px';
      document.body.append(feed);

      const sentinel = document.createElement('faceplate-partial');
      sentinel.setAttribute('src', '/feeds/home?after=t3_xyz');
      feed.append(sentinel);

      const card = document.createElement('shreddit-post');
      const tracker = document.createElement('faceplate-tracker');
      tracker.append(card);
      feed.append(tracker);
      card.getBoundingClientRect = () => ({
        width: 300,
        height: 350,
        top: 0,
        right: 300,
        bottom: 350,
        left: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });

      window.RedditPro.Masonry.processCard(card);
      runFrames();

      expect(sentinel.getAttribute('data-rg-sentinel')).toBe('1');
      expect(sentinel.style.getPropertyValue('--rg-sentinel-y')).toMatch(/^\d+px$/);
    });

    it('neutralizes spent sentinels and prevents full-width grid breaks across batches', () => {
      const feed = document.createElement('shreddit-feed');
      feed.style.display = 'grid';
      feed.style.gridTemplateColumns = '300px 300px';
      feed.getBoundingClientRect = () => ({
        width: 612,
        height: 1200,
        top: 0,
        left: 0,
        right: 612,
        bottom: 1200,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });
      document.body.append(feed);

      window.RedditPro.Settings.get = () => ({
        columns: '2',
        masonry: true,
        columnGap: 12,
        rowGap: 12,
      });
      window.RedditPro.Masonry.observeFeedContainer();

      // Batch 1: card1 + sentinel1
      const card1 = document.createElement('shreddit-post');
      const tracker1 = document.createElement('faceplate-tracker');
      tracker1.append(card1);
      feed.append(tracker1);
      card1.getBoundingClientRect = () => ({
        width: 300,
        height: 400,
        top: 0,
        right: 300,
        bottom: 400,
        left: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });

      const sentinel1 = document.createElement('faceplate-partial');
      sentinel1.setAttribute('src', '/feeds/home?after=t3_batch1');
      feed.append(sentinel1);

      window.RedditPro.Masonry.processCard(card1);
      runFrames();

      expect(sentinel1.getAttribute('data-rg-sentinel')).toBe('1');

      // Batch 2 arrives: card2 + sentinel2
      const card2 = document.createElement('shreddit-post');
      const tracker2 = document.createElement('faceplate-tracker');
      tracker2.append(card2);
      feed.append(tracker2);
      card2.getBoundingClientRect = () => ({
        width: 300,
        height: 200,
        top: 0,
        right: 300,
        bottom: 200,
        left: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });

      const sentinel2 = document.createElement('faceplate-partial');
      sentinel2.setAttribute('src', '/feeds/home?after=t3_batch2');
      feed.append(sentinel2);

      window.RedditPro.Masonry.processCard(card2);
      runFrames();

      // Sentinel 1 must be marked spent and hidden so it never forces a row barrier
      expect(sentinel1.hasAttribute('data-rg-sentinel')).toBe(false);
      expect(sentinel1.getAttribute('data-rg-spent-sentinel')).toBe('1');
      expect(sentinel1.style.display).toBe('none');

      // Sentinel 2 is now the active sentinel
      expect(sentinel2.getAttribute('data-rg-sentinel')).toBe('1');

      // Card 2 must be placed in column 1 (the shortest column from Batch 1)
      expect(tracker2.getAttribute('data-rg-col')).toBe('1');
      expect(tracker2.style.getPropertyValue('grid-column-start')).toBe('2');
    });

    it('does not wipe geometry or column heights when container width changes without changing column count', () => {
      const feed = document.createElement('shreddit-feed');
      feed.style.display = 'grid';
      feed.style.gridTemplateColumns = 'repeat(2, 1fr)';
      document.body.append(feed);

      feed.getBoundingClientRect = () => ({
        width: 612,
        height: 800,
        top: 0,
        right: 612,
        bottom: 800,
        left: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });

      window.RedditPro.Masonry.observeFeedContainer();

      const card = document.createElement('shreddit-post');
      const tracker = document.createElement('faceplate-tracker');
      tracker.append(card);
      feed.append(tracker);
      card.getBoundingClientRect = () => ({
        width: 300,
        height: 400,
        top: 0,
        right: 300,
        bottom: 400,
        left: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });

      window.RedditPro.Masonry.processCard(card);
      runFrames();

      const metricsBefore = window.RedditPro.Diagnostics.getLayoutMetrics();
      expect(metricsBefore.maxHeight).toBeGreaterThan(0);

      // Width shifts slightly by 10px (e.g. scrollbar appearing or minor reflow), columns remain 2
      window.RedditPro.Masonry.updateColumnsForContainer(602);

      const metricsAfter = window.RedditPro.Diagnostics.getLayoutMetrics();
      // Height must be preserved and not wiped to 0
      expect(metricsAfter.maxHeight).toBe(metricsBefore.maxHeight);
    });

    it('provides layout quality metrics in telemetry', () => {
      const metrics = window.RedditPro.Diagnostics.getLayoutMetrics();
      expect(metrics).toHaveProperty('columns');
      expect(metrics).toHaveProperty('colHeights');
      expect(metrics).toHaveProperty('maxHeight');
      expect(metrics).toHaveProperty('balanceRatio');
    });
  });
});
