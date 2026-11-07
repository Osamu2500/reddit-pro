/**
 * @file dom-observer.js
 * @description Watches Reddit's SPA DOM for new posts, media players, and feed batches.
 */
window.RedditPro = window.RedditPro || {};

window.RedditPro.DOMObserver = (function () {
  let observer = null;
  let sweepTimer = null;
  let rafPending = false;
  const mutationBatch = new Set();

  const POST_SELECTOR = 'shreddit-post, shreddit-ad-post, article, .Post';
  const BATCH_SELECTOR =
    'faceplate-batch, shreddit-feed, profile-feed, shreddit-profile-feed, shreddit-user-feed';
  const PLAYER_SELECTOR = 'shreddit-player';

  function processPost(node) {
    const settings = window.RedditPro.Settings.get();

    const aspectRatioNode = node.querySelector('[id$="-aspect-ratio"]');
    if (aspectRatioNode?.style.aspectRatio) {
      node.style.setProperty('--card-aspect-ratio', aspectRatioNode.style.aspectRatio);
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

  function handleElement(node) {
    if (node.nodeType !== 1 || node.hasAttribute('data-rg-processed')) return;

    if (node.matches(POST_SELECTOR)) {
      node.setAttribute('data-rg-processed', 'true');
      processPost(node);
      return;
    }

    if (node.matches(BATCH_SELECTOR)) {
      node.setAttribute('data-rg-processed', 'true');
      scheduleNewSweep();
      window.RedditPro.AudioObserver?.observeIn(node);
      window.RedditPro.Virtualizer?.observeBatch(node);
      return;
    }

    if (node.matches(PLAYER_SELECTOR)) {
      node.setAttribute('data-rg-processed', 'true');
      window.RedditPro.AudioObserver?.observe(node);
      return;
    }

    if (node.tagName === 'IMG') {
      node.setAttribute('data-rg-processed', 'true');
      const card = node.closest(POST_SELECTOR);
      if (card && !node.complete) {
        node.addEventListener(
          'load',
          () => window.RedditPro.Masonry.recalculateCard(card),
          { once: true, passive: true }
        );
      }
    }
  }

  function handleAddedNode(root) {
    if (root.nodeType !== 1) return;

    handleElement(root);
    root.querySelectorAll?.(
      `${POST_SELECTOR}, ${BATCH_SELECTOR}, ${PLAYER_SELECTOR}, img`
    ).forEach(handleElement);
  }

  function scheduleNewSweep() {
    clearTimeout(sweepTimer);
    sweepTimer = setTimeout(() => {
      requestAnimationFrame(() => window.RedditPro.Masonry.sweepNew());
    }, 80);
  }

  function processMutations() {
    const batch = Array.from(mutationBatch);
    mutationBatch.clear();
    rafPending = false;
    batch.forEach(handleAddedNode);
  }

  function enqueueNodes(nodes) {
    nodes.forEach((node) => mutationBatch.add(node));
    if (!rafPending && mutationBatch.size > 0) {
      rafPending = true;
      requestAnimationFrame(processMutations);
    }
  }

  function start() {
    if (observer || !document.documentElement) return;

    observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => enqueueNodes(Array.from(mutation.addedNodes)));
    });

    // Observe the document root so Reddit replacing <main> does not orphan the observer.
    observer.observe(document.documentElement, { childList: true, subtree: true });

    // Existing posts may already be present before the observer is attached.
    handleAddedNode(document.documentElement);
    scheduleNewSweep();
  }

  function stop() {
    observer?.disconnect();
    observer = null;
    clearTimeout(sweepTimer);
    mutationBatch.clear();
    rafPending = false;
  }

  return { start, stop };
})();
