/**
 * @file dom-observer.js
 * @description Watches Reddit's SPA DOM for new posts and batch containers.
 *
 * Improvements over v1:
 *  - Uses requestAnimationFrame batching instead of requestIdleCallback
 *    (rIC can fire too late after page becomes interactive)
 *  - Attaches image load triggers at the DOM-observer level so masonry
 *    always knows the moment a card's images settle
 *  - Sweep debounce reduced from 150ms → 80ms for snappier batch detection
 *  - Removed audio observation from batch tags (audio observer handles itself)
 */
window.RedditPro = window.RedditPro || {};

window.RedditPro.DOMObserver = (function() {
  let mo = null;
  let sweepTimer = null;
  let rafPending = false;
  let mutationBatch = [];

  const POST_TAGS = new Set(['shreddit-post', 'article', 'shreddit-ad-post']);
  const BATCH_TAGS = new Set([
    'faceplate-batch', 'shreddit-feed',
    'profile-feed', 'shreddit-profile-feed', 'shreddit-user-feed',
  ]);

  function handleAddedNode(node) {
    if (node.nodeType !== 1) return;
    const tag = node.tagName.toLowerCase();
    const settings = window.RedditPro.Settings.get();

    if (POST_TAGS.has(tag) || (node.classList && node.classList.contains('Post'))) {
      // Only process unstable cards
      if (!node.hasAttribute('data-rg-stable')) {
        window.RedditPro.Masonry.processCard(node);
      }

      if (window.RedditPro.AudioObserver) {
        window.RedditPro.AudioObserver.observeIn(node);
      }

      // Promoted post hiding
      if (settings.hidePromoted &&
          (tag === 'shreddit-ad-post' || node.hasAttribute('ad-id'))) {
        node.setAttribute('data-reddit-grid-is-ad', 'true');
      }

      // Subreddit/keyword filters
      if (window.RedditPro.Filters) {
        window.RedditPro.Filters.applyToCard(node);
      }

    } else if (BATCH_TAGS.has(tag)) {
      // New batch container added — schedule a sweep after a short settle time
      scheduleNewSweep();

      // Let audio observer scan for any players inside the new batch
      if (window.RedditPro.AudioObserver) {
        window.RedditPro.AudioObserver.observeIn(node);
      }

    } else if (tag === 'shreddit-player') {
      if (window.RedditPro.AudioObserver) {
        window.RedditPro.AudioObserver.observe(node);
      }

    } else if (tag === 'img') {
      // An image was added directly (e.g. lazy-loaded into existing card)
      // Walk up to find the parent card and trigger recalculation on load
      const card = node.closest('shreddit-post, article');
      if (card) {
        if (!node.complete) {
          node.addEventListener('load', () => {
            window.RedditPro.Masonry.recalculateCard(card);
          }, { once: true, passive: true });
        }
      }
    }
  }

  function scheduleNewSweep() {
    clearTimeout(sweepTimer);
    // Tight debounce: 80ms to quickly detect batch end, then one rAF for paint sync
    sweepTimer = setTimeout(() => {
      requestAnimationFrame(() => {
        window.RedditPro.Masonry.sweepNew();
      });
    }, 80);
  }

  function processMutations() {
    const batch = mutationBatch.splice(0);
    rafPending = false;
    batch.forEach(node => handleAddedNode(node));
  }

  function start() {
    if (mo) return;

    mo = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          mutationBatch.push(node);
        }
      }
      if (!rafPending && mutationBatch.length > 0) {
        rafPending = true;
        // rAF is better than rIC here: we want to run before the next paint
        // so that loading states are set before the browser composites
        requestAnimationFrame(processMutations);
      }
    });

    const target = document.querySelector('main') || document.documentElement;
    mo.observe(target, { childList: true, subtree: true });
  }

  function stop() {
    if (mo) { mo.disconnect(); mo = null; }
    clearTimeout(sweepTimer);
    mutationBatch = [];
    rafPending = false;
  }

  return { start, stop };
})();
