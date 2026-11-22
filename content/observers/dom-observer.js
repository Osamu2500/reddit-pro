/**
 * @file dom-observer.js
 * @description Watches Reddit's SPA DOM for new posts, media players, and feed batches.
 */
window.RedditPro = window.RedditPro || {};

window.RedditPro.DOMObserver = (function () {
  /** @type {MutationObserver | null} */
  let observer = null;
  /** @type {number | undefined} */
  let sweepTimer;
  let rafPending = false;
  /** @type {Set<Node>} */
  const mutationBatch = new Set();

  const POST_SELECTOR = 'shreddit-post, shreddit-ad-post, article, .Post';
  const BATCH_SELECTOR =
    'faceplate-batch, shreddit-feed, profile-feed, shreddit-profile-feed, shreddit-user-feed';
  const PLAYER_SELECTOR = 'shreddit-player';

  /** @param {Element} node */
  function processPost(node) {
    const settings = window.RedditPro.Settings.get();

    const aspectRatioNode = /** @type {HTMLElement | null} */ (
      node.querySelector('[id$="-aspect-ratio"]')
    );
    const postElement = /** @type {HTMLElement} */ (node);
    if (aspectRatioNode?.style.aspectRatio) {
      postElement.style.setProperty('--card-aspect-ratio', aspectRatioNode.style.aspectRatio);
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

  /** @param {Element} node */
  function handleElement(node) {
    if (node.nodeType !== 1 || node.hasAttribute('data-rg-processed')) return;

    if (node.matches(POST_SELECTOR)) {
      node.setAttribute('data-rg-processed', 'true');
      node.setAttribute('data-rg-new', '1');
      setTimeout(() => {
        try {
          node.removeAttribute('data-rg-new');
        } catch {
          /* ignore */
        }
      }, 300);
      processPost(node);
      return;
    }

    if (node.matches(BATCH_SELECTOR)) {
      node.setAttribute('data-rg-processed', 'true');
      window.RedditPro.Masonry?.processBatch(node);
      observeFeedEnd();
      window.RedditPro.AudioObserver?.observeIn(node);
      window.RedditPro.Virtualizer?.observeBatch(node);
      const posts = node.querySelectorAll(POST_SELECTOR);
      if (posts.length > 0) {
        posts.forEach(handleElement);
      }
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
      const image = /** @type {HTMLImageElement} */ (node);
      if (card && !image.complete) {
        node.addEventListener(
          'load',
          () => window.RedditPro.Masonry.recalculateCard(card),
          { once: true, passive: true }
        );
      }
    }
  }

  /** @param {Element} root */
  function handleAddedNode(root) {
    if (root.nodeType !== 1) return;

    handleElement(root);
    root.querySelectorAll?.(
      `${POST_SELECTOR}, ${BATCH_SELECTOR}, ${PLAYER_SELECTOR}, img`
    ).forEach(handleElement);
  }

  /** @type {IntersectionObserver | null} */
  let preloadObserver = null;
  /** @type {Element | null} */
  let lastObservedSentinel = null;
  let isPreloading = false;
  let scrollPreloadTimer = 0;

  function triggerNextFeedBatch() {
    if (isPreloading) return;

    const feed = document.querySelector(
      'shreddit-feed, profile-feed, shreddit-profile-feed, shreddit-user-feed, [data-testid="post-list"], main > div:has(> shreddit-post), main > div:has(> article)'
    );
    if (!feed) return;

    isPreloading = true;

    // Filter to find actual bottom-of-feed pagination sentinels
    // CRITICAL: Exclude all partials/loaders that are nested inside individual post cards
    const candidates = Array.from(
      feed.querySelectorAll(
        'faceplate-partial, shreddit-async-loader, [slot="more-posts"], [slot="load-more"], button[aria-label*="more posts" i], button:has(> [slot*="load-more"])'
      )
    ).filter((el) => {
      if (el.closest('shreddit-post, article, .Post, shreddit-profile-comment')) {
        return false;
      }
      if (el.querySelector('shreddit-post, article, .Post')) {
        return false;
      }
      return !el.hasAttribute('data-rg-triggered');
    });

    const target = candidates.length > 0 ? candidates[candidates.length - 1] : null;
    if (target) {
      target.setAttribute('data-rg-triggered', 'true');
      const targetEl = /** @type {any} */ (target);

      // 1. If it's or contains a button, click it
      const btn = target.tagName === 'BUTTON' ? target : target.querySelector('button');
      if (btn) {
        try { /** @type {HTMLElement} */ (btn).click(); } catch {}
      }

      // 2. Set eager loading on lazy elements
      if (target.hasAttribute('loading') || target.tagName.toLowerCase() === 'faceplate-partial') {
        target.setAttribute('loading', 'eager');
        try { targetEl.loading = 'eager'; } catch {}
      }

      // 3. Trigger native methods if defined by Web Component
      if (typeof targetEl.load === 'function') {
        try { targetEl.load(); } catch {}
      } else if (typeof targetEl.fetch === 'function') {
        try { targetEl.fetch(); } catch {}
      } else if (typeof targetEl.reload === 'function') {
        try { targetEl.reload(); } catch {}
      }

      // 4. Dispatch standard custom events expected by Reddit Faceplate components
      // Note: Never dispatch synthetic "load" event which prematurely flags the loader as completed
      target.dispatchEvent(new CustomEvent('faceplate-trigger', { bubbles: true }));
      feed.dispatchEvent(new CustomEvent('shreddit-feed-more-posts', { bubbles: true }));

      setTimeout(() => {
        if (target.isConnected && !target.querySelector('shreddit-post, article, .Post')) {
          target.removeAttribute('data-rg-triggered');
        }
      }, 2000);

      setTimeout(() => {
        isPreloading = false;
      }, 500);
      return;
    }

    // Fallback: Notify feed container
    feed.dispatchEvent(new CustomEvent('shreddit-feed-more-posts', { bubbles: true }));

    setTimeout(() => {
      isPreloading = false;
    }, 400);
  }

  function observeFeedEnd() {
    const feed = document.querySelector(
      'shreddit-feed, profile-feed, shreddit-profile-feed, shreddit-user-feed, [data-testid="post-list"], main > div:has(> shreddit-post), main > div:has(> article)'
    );
    if (!feed) return;

    const targets = Array.from(
      feed.querySelectorAll(
        'faceplate-partial, shreddit-async-loader, [slot="more-posts"], [slot="load-more"], faceplate-batch'
      )
    ).filter((el) => {
      if (el.closest('shreddit-post, article, .Post, shreddit-profile-comment')) return false;
      if (el.querySelector('shreddit-post, article, .Post')) return false;
      return true;
    });

    const sentinel = targets.length > 0 ? targets[targets.length - 1] : feed.lastElementChild;
    if (!sentinel) return;

    if (!preloadObserver && typeof IntersectionObserver !== 'undefined') {
      preloadObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              triggerNextFeedBatch();
            }
          }
        },
        {
          root: null,
          rootMargin: '2500px 0px',
          threshold: 0,
        }
      );
    }

    if (lastObservedSentinel && lastObservedSentinel !== sentinel) {
      preloadObserver?.unobserve(lastObservedSentinel);
    }
    lastObservedSentinel = sentinel;
    preloadObserver?.observe(sentinel);
  }

  function handleScrollPreload() {
    clearTimeout(scrollPreloadTimer);
    scrollPreloadTimer = window.setTimeout(() => {
      const doc = document.documentElement;
      const scrollHeight = doc.scrollHeight || document.body.scrollHeight;
      const currentScroll = window.scrollY + window.innerHeight;
      if (scrollHeight - currentScroll < 2200) {
        triggerNextFeedBatch();
      }
    }, 120);
  }

  function scheduleNewSweep() {
    clearTimeout(sweepTimer);
    sweepTimer = setTimeout(() => {
      requestAnimationFrame(() => {
        window.RedditPro.Masonry?.sweepNew?.();
        observeFeedEnd();
      });
    }, 80);
  }

  function processMutations() {
    const batch = Array.from(mutationBatch);
    mutationBatch.clear();
    rafPending = false;
    batch.forEach((node) => {
      if (node instanceof Element) handleAddedNode(node);
    });
  }

  /** @param {Node[]} nodes */
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

    // Track sidebar expansion/collapse toggle buttons
    document.addEventListener(
      'click',
      (e) => {
        const target = /** @type {Element | null} */ (e.target);
        if (
          target &&
          target.closest?.(
            'button[aria-label*="Navigation" i], #left-sidebar-container button, reddit-sidebar-nav button'
          )
        ) {
          setTimeout(() => {
            window.RedditPro.Masonry?.observeSidebarContainer?.();
          }, 60);
        }
      },
      { passive: true }
    );

    // Existing posts may already be present before the observer is attached.
    handleAddedNode(document.documentElement);
    observeFeedEnd();
    window.addEventListener('scroll', handleScrollPreload, { passive: true });
    scheduleNewSweep();
  }

  function stop() {
    observer?.disconnect();
    observer = null;
    preloadObserver?.disconnect();
    preloadObserver = null;
    lastObservedSentinel = null;
    window.removeEventListener('scroll', handleScrollPreload);
    clearTimeout(scrollPreloadTimer);
    clearTimeout(sweepTimer);
    mutationBatch.clear();
    rafPending = false;
  }

  return { start, stop };
})();
