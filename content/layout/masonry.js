/**
 * @file masonry.js
 * @description Masonry grid engine for Reddit Pro.
 *
 * Key improvements over v1:
 *  - Dynamic ROW_GAP read from CSS instead of hardcoded constant
 *  - "data-rg-loading" pre-hide pattern: new posts are invisible until
 *    their first span is computed, then revealed with CSS animation
 *  - Image load listeners so masonry recalculates the moment an image
 *    inside a card finishes loading (biggest cause of mid-scroll reflow)
 *  - STABILITY_THRESHOLD raised to 3 for rock-solid positioning
 *  - Removed all expanded-card logic (feature deleted)
 */
window.RedditPro = window.RedditPro || {};

window.RedditPro.Masonry = (function() {
  let resizePending = false;
  const resizeQueue = new Map();
  const stableCount = new Map();
  const heightCache = new WeakMap();
  // Track which posts we've attached image listeners to
  const imgListeners = new WeakSet();

  const ROW_HEIGHT = 5;
  const STABILITY_THRESHOLD = 3;

  /**
   * Read the actual column gap from computed CSS so the span math
   * always matches the rendered layout (fixes the gap-mismatch bug).
   * @returns {number}
   */
  function getRowGap() {
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue('--reddit-col-gap')
      .trim();
    return parseFloat(raw) || 8;
  }

  const POST_SELECTORS = [
    'shreddit-post', 'shreddit-ad-post', 'shreddit-feed article',
    'faceplate-batch > shreddit-post', 'faceplate-batch > article',
    'profile-feed shreddit-post', 'profile-feed article',
    'shreddit-profile-feed shreddit-post', 'shreddit-profile-feed article',
    'shreddit-user-feed shreddit-post', 'shreddit-user-feed article',
    '[data-feed-type] shreddit-post', '[data-feed-type] article', '.Post'
  ].join(',');

  const observer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const el = entry.target;
      const height = entry.contentRect
        ? entry.contentRect.height
        : el.getBoundingClientRect().height;

      if (height <= 0) continue;

      // Smart caching: only process if height changed by more than 2px
      const cachedHeight = heightCache.get(el) || 0;
      if (Math.abs(height - cachedHeight) < 2) continue;
      heightCache.set(el, height);

      if (el.hasAttribute('data-rg-stable')) {
        const rowGap = getRowGap();
        const currentSpan = parseInt(el.getAttribute('data-rg-span') || '0', 10);
        const newSpan = Math.ceil((height + rowGap) / ROW_HEIGHT);
        if (currentSpan === newSpan) continue;
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
    const settings = window.RedditPro.Settings.get();
    if (settings.columns === '1') {
      resizeQueue.clear();
      return;
    }

    const rowGap = getRowGap();

    for (const [el, height] of resizeQueue) {
      if (height <= 0) continue;

      const span = Math.ceil((height + rowGap) / ROW_HEIGHT);
      const currentSpan = el.getAttribute('data-rg-span');

      if (currentSpan !== String(span)) {
        el.style.setProperty('grid-row-end', `span ${span}`, 'important');
        el.setAttribute('data-rg-span', span);
        el.removeAttribute('data-rg-stable');
        stableCount.set(el, 0);

        // First time this card gets a span: remove loading state so it fades in
        if (el.hasAttribute('data-rg-loading')) {
          el.removeAttribute('data-rg-loading');
        }
      } else {
        const count = (stableCount.get(el) || 0) + 1;
        stableCount.set(el, count);
        if (count >= STABILITY_THRESHOLD) {
          el.setAttribute('data-rg-stable', '1');
          // Ensure loading state is cleared on stability
          el.removeAttribute('data-rg-loading');
        }
      }
    }
    resizeQueue.clear();
  }

  /**
   * Attach load listeners to all images inside a card so masonry
   * recalculates the moment each image finishes loading.
   * This is the #1 cause of mid-scroll card reflow.
   * @param {Element} el
   */
  function attachImageListeners(el) {
    if (imgListeners.has(el)) return;
    imgListeners.add(el);

    const imgs = el.querySelectorAll('img');
    imgs.forEach(img => {
      if (!img.complete) {
        img.addEventListener('load', () => recalculateCard(el), { once: true, passive: true });
        img.addEventListener('error', () => recalculateCard(el), { once: true, passive: true });
      }
    });
  }

  function processCard(el) {
    if (!el || el.nodeType !== 1) return;
    const settings = window.RedditPro.Settings.get();

    if (settings.columns !== '1') {
      // Mark as loading so it stays invisible until first span is set
      if (!el.hasAttribute('data-rg-span') && !el.hasAttribute('data-rg-stable')) {
        el.setAttribute('data-rg-loading', '1');
      }
      observer.observe(el);
      attachImageListeners(el);
    } else {
      observer.unobserve(el);
      el.style.removeProperty('grid-row-end');
      el.removeAttribute('data-rg-span');
      el.removeAttribute('data-rg-stable');
      el.removeAttribute('data-rg-loading');
      stableCount.delete(el);
    }
  }

  function sweepNew() {
    if (window.RedditPro.Settings.get().columns === '1') return;
    document.querySelectorAll(POST_SELECTORS).forEach(el => {
      if (!el.hasAttribute('data-rg-stable')) processCard(el);
    });
  }

  function sweepAll() {
    document.querySelectorAll(POST_SELECTORS).forEach(el => {
      el.removeAttribute('data-rg-stable');
      el.removeAttribute('data-rg-loading');
      stableCount.delete(el);
      heightCache.delete(el);
      processCard(el);
    });
  }

  function disconnectAll() {
    observer.disconnect();
    resizeQueue.clear();
    resizePending = false;
    stableCount.clear();
  }

  function recalculateCard(el) {
    el.removeAttribute('data-rg-stable');
    stableCount.delete(el);
    heightCache.delete(el);
    processCard(el);
  }

  return { processCard, sweepNew, sweepAll, disconnectAll, recalculateCard };
})();
