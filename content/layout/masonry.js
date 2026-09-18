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
// @ts-nocheck
window.RedditPro = window.RedditPro || {};

window.RedditPro.Masonry = (function() {
  let resizePending = false;
  const resizeQueue = new Map(); // Emptied every frame
  const stableCount = new WeakMap(); // WeakMap prevents memory leaks for removed nodes
  const heightCache = new WeakMap();
  // Track which posts we've attached image listeners to
  const imgListeners = new WeakSet();

  const ROW_HEIGHT = 1;
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
    'shreddit-post', 'shreddit-ad-post', 'article', '.Post'
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

      // We defer the span math to flush() (rAF) to prevent layout thrashing
      // caused by getComputedStyle inside the ResizeObserver callback.
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
      const gridItem = el.closest('faceplate-tracker') || el;
      const currentSpan = gridItem.getAttribute('data-rg-span');

      if (currentSpan !== String(span)) {
        gridItem.style.setProperty('grid-row-end', `span ${span}`, 'important');
        gridItem.setAttribute('data-rg-span', span);
        gridItem.removeAttribute('data-rg-stable');
        stableCount.set(gridItem, 0);

        // First time this card gets a span: remove loading state so it fades in
        if (gridItem.hasAttribute('data-rg-loading')) {
          gridItem.removeAttribute('data-rg-loading');
        }
      } else {
        const count = (stableCount.get(gridItem) || 0) + 1;
        stableCount.set(gridItem, count);
        if (count >= STABILITY_THRESHOLD) {
          gridItem.setAttribute('data-rg-stable', '1');
          gridItem.removeAttribute('data-rg-loading');
        }
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
   * This is the #1 cause of mid-scroll card reflow.
   * @param {Element} el
   */
  function attachImageListeners(el) {
    if (imgListeners.has(el)) return;
    imgListeners.add(el);

    const media = getMediaElementsDeep(el);
    media.forEach(node => {
      const tag = node.tagName.toLowerCase();
      if (tag === 'img' && !node.complete) {
        node.addEventListener('load', () => recalculateCard(el), { once: true, passive: true });
        node.addEventListener('error', () => recalculateCard(el), { once: true, passive: true });
      } else if (tag === 'video' && node.readyState < 3) {
        node.addEventListener('loadeddata', () => recalculateCard(el), { once: true, passive: true });
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

    if (settings.columns !== '1') {
      // Mark as loading so it stays invisible until first span is set
      if (!gridItem.hasAttribute('data-rg-span') && !gridItem.hasAttribute('data-rg-stable')) {
        gridItem.setAttribute('data-rg-loading', '1');
      }
      observer.observe(el);
      attachImageListeners(el);
    } else {
      observer.unobserve(el);
      gridItem.style.removeProperty('grid-row-end');
      gridItem.removeAttribute('data-rg-span');
      gridItem.removeAttribute('data-rg-stable');
      gridItem.removeAttribute('data-rg-loading');
      stableCount.delete(gridItem);
    }
  }

  const GRID_CONTAINERS = [
    'shreddit-feed > faceplate-batch',
    'main > div > faceplate-batch',
    'shreddit-async-loader > faceplate-batch',
    'shreddit-feed > faceplate-batch > div',
    'main > div > faceplate-batch > div',
    'shreddit-async-loader > faceplate-batch > div',
    'shreddit-feed:not(:has(> faceplate-batch))',
    'main > div:not(:has(> faceplate-batch))',
    'shreddit-async-loader:not(:has(> faceplate-batch))',
    'shreddit-profile-feed faceplate-batch > div',
    'profile-feed faceplate-batch > div',
    '[data-testid="post-list"]'
  ].join(',');

  function processGridHeaders(force = false) {
    if (window.RedditPro.Settings.get().columns === '1') return;
    document.querySelectorAll(GRID_CONTAINERS).forEach(container => {
      Array.from(container.children).forEach(child => {
        // Skip cards (they are handled by POST_SELECTORS)
        if (child.matches(POST_SELECTORS) || child.matches('faceplate-tracker')) return;
        
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
    if (window.RedditPro.Settings.get().columns === '1') return;
    document.querySelectorAll(POST_SELECTORS).forEach(el => {
      if (!el.hasAttribute('data-rg-stable')) processCard(el);
    });
    processGridHeaders(false);
  }

  function sweepAll() {
    document.querySelectorAll(POST_SELECTORS).forEach(el => {
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
    resizeQueue.clear();
    resizePending = false;
  }

  /**
   * @param {Element} el
   */
  function recalculateCard(el) {
    const gridItem = el.closest('faceplate-tracker') || el;
    gridItem.removeAttribute('data-rg-stable');
    heightCache.delete(el);
    processCard(el);
  }

  return { processCard, sweepNew, sweepAll, disconnectAll, recalculateCard };
})();
