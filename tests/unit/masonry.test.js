import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(
  path.resolve(process.cwd(), 'content/layout/masonry.js'),
  'utf8'
);

describe('Masonry layout engine', () => {
  let frames;
  let resizeObserver;

  beforeEach(() => {
    frames = [];
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
      }
    }

    globalThis.ResizeObserver = MockResizeObserver;
    window.RedditPro = {
      Settings: {
        get: () => ({ columns: '3', masonry: true }),
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
