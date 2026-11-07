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
  });
});
