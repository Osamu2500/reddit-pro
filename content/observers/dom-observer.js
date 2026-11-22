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

  const SQUIRCLE_SHADOW_STYLE = `
    :host {
      --button-border-radius: 8px !important;
      --rem-button-border-radius: 0.5rem !important;
      --radius-full: 8px !important;
      --faceplate-button-border-radius: 8px !important;
      --color-button-border-radius: 8px !important;
      --shreddit-button-border-radius: 8px !important;
      --rpl-radius-full: 8px !important;
      --rpl-button-border-radius: 8px !important;
      border-radius: 8px !important;
      overflow: hidden !important;
    }
    button,
    [role="button"],
    a,
    div,
    span,
    [class*="rounded-full"],
    [class*="rounded-"],
    [class*="button"],
    .button,
    .rounded-full,
    svg {
      border-radius: 8px !important;
    }
  `;

  /**
   * Injects squircle styling into open shadow root to pierce web component encapsulation.
   * @param {ShadowRoot | null} root
   */
  function injectSquircleToShadow(root) {
    if (!root || root.querySelector('style[data-rg-squircle]')) return;
    try {
      const style = document.createElement('style');
      style.setAttribute('data-rg-squircle', 'true');
      style.textContent = SQUIRCLE_SHADOW_STYLE;
      root.appendChild(style);
    } catch {
      /* ignore */
    }
    try {
      root
        .querySelectorAll('button, a, [role="button"], [class*="rounded-full"]')
        .forEach((el) => {
          /** @type {HTMLElement} */ (el).style.setProperty('border-radius', '8px', 'important');
        });
    } catch {
      /* ignore */
    }
  }

  /**
   * Applies squircle / rounded-square shape to community avatars and all buttons inside a card,
   * piercing open shadow roots (shreddit-join-button, shreddit-comment-button, etc.)
   * and correctly positioning the join button directly below three dots.
   * @param {Element} card
   */
  function applySquircleAndButtonStyles(card) {
    if (!card) return;

    // 1. Detect and configure Join Button placement below three dots
    const joinEl = card.querySelector(
      'shreddit-join-button, [data-testid="join-button"], [data-testid="credit-bar-join-button"], [data-testid*="join" i], button[aria-label*="join" i]'
    );
    if (joinEl) {
      card.setAttribute('data-rg-has-join', 'true');
      const host = joinEl.closest('faceplate-tracker') || joinEl;
      host.setAttribute('data-rg-join-target', 'true');
    }

    // 2. Pierce Shadow DOM for all Web Component buttons & action controls
    const shadowHosts = card.querySelectorAll(
      'shreddit-join-button, shreddit-comment-button, shreddit-post-share-button, shreddit-share-button, shreddit-vote-buttons, vote-buttons, rpl-vote-buttons, shreddit-overflow-menu, shreddit-crosspost-button, rpl-button, rpl-join-button, [slot="action-bar"] > *, [slot="credit-bar"] > *'
    );
    shadowHosts.forEach((host) => {
      const htmlHost = /** @type {HTMLElement} */ (host);
      htmlHost.style.setProperty('border-radius', '8px', 'important');
      htmlHost.style.setProperty('overflow', 'hidden', 'important');
      if (host.shadowRoot) {
        injectSquircleToShadow(host.shadowRoot);
      }
    });

    // 3. Style all Light DOM buttons, vote controls, comments, shares
    const lightButtons = card.querySelectorAll(
      'button, a[role="button"], [class*="rounded-full"], [data-post-click-location="vote"], [data-post-click-location="comments"], [data-post-click-location="share"], [data-post-click-location="save"]'
    );
    lightButtons.forEach((btn) => {
      /** @type {HTMLElement} */ (btn).style.setProperty('border-radius', '8px', 'important');
    });

    // 4. Style Community Avatars & Icons to 7px squircle
    const avatars = card.querySelectorAll(
      '[slot="credit-bar"] img, shreddit-post-header img, [data-testid="subreddit-icon"] img, [data-testid="user-avatar"] img, faceplate-img img, shreddit-avatar'
    );
    avatars.forEach((avatar) => {
      /** @type {HTMLElement} */ (avatar).style.setProperty('border-radius', '7px', 'important');
      /** @type {HTMLElement} */ (avatar).style.setProperty('overflow', 'hidden', 'important');
    });
  }

  /** @param {Element} node */
  function processPost(node) {
    const settings = window.RedditPro.Settings.get();

    // Ensure squircle styling and Join button positioning are enforced immediately
    applySquircleAndButtonStyles(node);
    node.addEventListener('mouseenter', () => applySquircleAndButtonStyles(node), { passive: true });

    const aspectRatioNode = /** @type {HTMLElement | null} */ (
      node.querySelector('[id$="-aspect-ratio"]')
    );
    const postElement = /** @type {HTMLElement} */ (node);
    if (aspectRatioNode?.style.aspectRatio) {
      postElement.style.setProperty('--card-aspect-ratio', aspectRatioNode.style.aspectRatio);
    }

    // Resolve true intrinsic aspect ratio from loaded media to prevent letterboxing
    const mediaImg = /** @type {HTMLImageElement | null} */ (
      node.querySelector('[slot="post-media-container"] img:not(.post-background-image-filter)')
    );
    if (mediaImg) {
      if (mediaImg.naturalWidth > 0 && mediaImg.naturalHeight > 0) {
        postElement.style.setProperty(
          '--card-aspect-ratio',
          String(mediaImg.naturalWidth / mediaImg.naturalHeight)
        );
      } else {
        mediaImg.addEventListener(
          'load',
          () => {
            if (mediaImg.naturalWidth > 0 && mediaImg.naturalHeight > 0) {
              postElement.style.setProperty(
                '--card-aspect-ratio',
                String(mediaImg.naturalWidth / mediaImg.naturalHeight)
              );
              window.RedditPro.Masonry?.recalculateCard(node);
            }
          },
          { once: true, passive: true }
        );
      }
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

  /**
   * Identifies the genuine pagination sentinel at the bottom of the feed.
   * Prioritizes exact pagination IDs and slots, while strictly ignoring modals,
   * dialogs, hover cards, and inner post loaders.
   * @param {Element} feed
   * @returns {Element | null}
   */
  function findFeedSentinel(feed) {
    if (!feed) return null;

    // 1. High priority: Exact known IDs, slots, or feed query endpoints
    const specificCandidates = Array.from(
      feed.querySelectorAll(
        '#feed-next-page-partial, [slot="load-after"], [slot="more-posts"], [slot="load-more"], faceplate-partial[src*="after="], faceplate-partial[src*="/feeds/"], shreddit-async-loader[bundlename*="feed" i], button[aria-label*="more posts" i], button:has(> [slot*="load-more"])'
      )
    ).filter((el) => {
      if (el.closest('shreddit-post, article, .Post, shreddit-profile-comment')) return false;
      if (el.querySelector('shreddit-post, article, .Post')) return false;
      return true;
    });

    if (specificCandidates.length > 0) {
      return specificCandidates[specificCandidates.length - 1];
    }

    // 2. Fallback: Filter all partials/loaders, explicitly excluding non-feed dialogs/modals
    const generalCandidates = Array.from(
      feed.querySelectorAll(
        'faceplate-partial, shreddit-async-loader, [slot="more-posts"], [slot="load-more"], button[aria-label*="more posts" i]'
      )
    ).filter((el) => {
      if (el.closest('shreddit-post, article, .Post, shreddit-profile-comment')) return false;
      if (el.querySelector('shreddit-post, article, .Post')) return false;
      const src = (el.getAttribute('src') || el.getAttribute('data-src') || '').toLowerCase();
      if (src && /(modal|dialog|hover-card|menu|banner|drawer|consent)/i.test(src)) return false;
      return true;
    });

    return generalCandidates.length > 0 ? generalCandidates[generalCandidates.length - 1] : null;
  }

  function triggerNextFeedBatch() {
    if (isPreloading) return;

    const feed = document.querySelector(
      'shreddit-feed, profile-feed, shreddit-profile-feed, shreddit-user-feed, [data-testid="post-list"], main > div:has(> shreddit-post), main > div:has(> article)'
    );
    if (!feed) return;

    const target = findFeedSentinel(feed);
    if (!target || target.hasAttribute('data-rg-triggered')) {
      return;
    }

    isPreloading = true;
    target.setAttribute('data-rg-triggered', 'true');
    const targetEl = /** @type {any} */ (target);

    // 1. If it's or contains a button, click it
    const btn = target.tagName === 'BUTTON' ? target : target.querySelector('button');
    if (btn) {
      try { /** @type {HTMLElement} */ (btn).click(); } catch {}
    }

    // 2. Trigger native Web Component loading
    // CRITICAL: Reddit Faceplate components (e.g. O.load) explicitly throw unless loading is 'programmatic'!
    if (
      typeof targetEl.load === 'function' ||
      target.tagName.toLowerCase() === 'faceplate-partial' ||
      target.id === 'feed-next-page-partial'
    ) {
      try {
        target.setAttribute('loading', 'programmatic');
        targetEl.loading = 'programmatic';
      } catch {}
      try {
        targetEl.load();
      } catch {}
    } else if (typeof targetEl.fetch === 'function') {
      try { targetEl.fetch(); } catch {}
    } else if (typeof targetEl.reload === 'function') {
      try { targetEl.reload(); } catch {}
    }

    // 3. Dispatch standard custom events expected by Reddit Faceplate components
    target.dispatchEvent(new CustomEvent('faceplate-trigger', { bubbles: true }));
    feed.dispatchEvent(new CustomEvent('shreddit-feed-more-posts', { bubbles: true }));

    setTimeout(() => {
      if (target.isConnected && !target.querySelector('shreddit-post, article, .Post')) {
        target.removeAttribute('data-rg-triggered');
      }
    }, 2500);

    setTimeout(() => {
      isPreloading = false;
    }, 600);
  }

  function observeFeedEnd() {
    const feed = document.querySelector(
      'shreddit-feed, profile-feed, shreddit-profile-feed, shreddit-user-feed, [data-testid="post-list"], main > div:has(> shreddit-post), main > div:has(> article)'
    );
    if (!feed) return;

    const sentinel = findFeedSentinel(feed) || feed.lastElementChild;
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
