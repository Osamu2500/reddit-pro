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
  const processedSquircleRoots = new WeakSet();

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
    }
    :host(:is(button, shreddit-join-button, rpl-join-button, shreddit-vote-buttons, shreddit-comment-button, shreddit-crosspost-button, shreddit-repost-button, rpl-crosspost-button, rpl-repost-button, shreddit-post-share-button, shreddit-share-button, rpl-share-button)) {
      overflow: hidden !important;
      border-radius: 8px !important;
    }
    :host(:is(shreddit-crosspost-button, shreddit-repost-button, rpl-crosspost-button, rpl-repost-button)) {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      height: 32px !important;
      max-height: 32px !important;
      min-width: 32px !important;
      width: 32px !important;
      padding: 0 !important;
      border-radius: 8px !important;
      background: var(--rg-btn-bg, #1a1a1b) !important;
      border: 1px solid var(--rg-btn-border, rgba(255, 255, 255, 0.12)) !important;
      box-sizing: border-box !important;
    }
    :host(:is(shreddit-post-share-button, shreddit-share-button, rpl-share-button)) {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      height: 32px !important;
      max-height: 32px !important;
      min-width: 32px !important;
      padding: 0 10px !important;
      gap: 6px !important;
      border-radius: 8px !important;
      background: var(--rg-btn-bg, #1a1a1b) !important;
      border: 1px solid var(--rg-btn-border, rgba(255, 255, 255, 0.12)) !important;
      box-sizing: border-box !important;
    }
    :host(:is(shreddit-crosspost-button, shreddit-repost-button, rpl-crosspost-button, rpl-repost-button, shreddit-post-share-button, shreddit-share-button, rpl-share-button)) :is(button, a, [role="button"]) {
      background: transparent !important;
      border: none !important;
      border-radius: 8px !important;
      height: 100% !important;
      width: 100% !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      box-shadow: none !important;
      color: inherit !important;
      padding: 0 !important;
    }
    :host(:is(shreddit-overflow-menu, faceplate-dropdown-menu, shreddit-post-overflow-menu)) {
      overflow: visible !important;
    }
    hr,
    [role="separator"],
    shreddit-separator,
    .separator,
    .divider {
      display: none !important;
      height: 0 !important;
      border: none !important;
      margin: 0 !important;
      padding: 0 !important;
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
   * Recursively traverses an element, its children, and any open ShadowRoots,
   * injecting squircle styling directly into each shadow root and styling all buttons and avatars.
   * @param {Node} rootNode
   * @param {boolean} [force]
   */
  function deepPierceSquircle(rootNode, force = false) {
    if (!rootNode) return;
    if (!force && processedSquircleRoots.has(rootNode)) return;
    processedSquircleRoots.add(rootNode);

    // 1. If this node has an open shadowRoot, inject squircle style and recurse inside it
    const elWithShadow = /** @type {any} */ (rootNode);
    if (elWithShadow.shadowRoot) {
      injectSquircleToShadow(elWithShadow.shadowRoot);
      deepPierceSquircle(elWithShadow.shadowRoot, force);
    }

    if (rootNode.nodeType === 1) {
      const el = /** @type {HTMLElement} */ (rootNode);
      const tag = el.tagName.toLowerCase();

      // Check Join button and position it below three dots at top: 42px, right: 12px
      const ariaLabel = el.getAttribute('aria-label')?.toLowerCase() || '';
      const testId = el.getAttribute('data-testid')?.toLowerCase() || '';
      const noun = el.getAttribute('noun')?.toLowerCase() || '';
      const action = el.getAttribute('action')?.toLowerCase() || '';
      const clickLoc = el.getAttribute('data-post-click-location')?.toLowerCase() || '';
      const clickId = el.getAttribute('data-click-id')?.toLowerCase() || '';
      const isJoin =
        tag === 'shreddit-join-button' ||
        tag === 'rpl-join-button' ||
        testId === 'join-button' ||
        testId === 'join' ||
        noun === 'join' ||
        action === 'join' ||
        (ariaLabel &&
          (ariaLabel === 'join' ||
            ariaLabel === 'joined' ||
            /^join\s+(community|r\/|[a-z0-9_]+)/i.test(ariaLabel)) &&
          !ariaLabel.includes('discussion') &&
          !ariaLabel.includes('conversation') &&
          !ariaLabel.includes('chat') &&
          !ariaLabel.includes('thread'));

      if (isJoin) {
        const post = el.closest('shreddit-post, article, .Post');
        if (post) post.setAttribute('data-rg-has-join', 'true');
        const host = el.closest('faceplate-tracker') || el;
        host.setAttribute('data-rg-join-target', 'true');
        /** @type {HTMLElement} */ (host).style.setProperty('position', 'absolute', 'important');
        /** @type {HTMLElement} */ (host).style.setProperty('top', '42px', 'important');
        /** @type {HTMLElement} */ (host).style.setProperty('right', '12px', 'important');
        /** @type {HTMLElement} */ (host).style.setProperty('z-index', '10', 'important');
        el.style.setProperty('border-radius', '8px', 'important');
        el.style.setProperty('overflow', 'hidden', 'important');
      }

      // Check Reshare / Crosspost button
      const isReshare =
        tag === 'shreddit-crosspost-button' ||
        tag === 'shreddit-repost-button' ||
        tag === 'rpl-crosspost-button' ||
        tag === 'rpl-repost-button' ||
        noun.includes('crosspost') ||
        noun.includes('repost') ||
        noun.includes('reshare') ||
        action.includes('crosspost') ||
        action.includes('repost') ||
        action.includes('reshare') ||
        clickLoc.includes('crosspost') ||
        clickLoc.includes('repost') ||
        clickLoc.includes('reshare') ||
        clickId.includes('crosspost') ||
        clickId.includes('repost') ||
        clickId.includes('reshare') ||
        testId.includes('crosspost') ||
        testId.includes('repost') ||
        testId.includes('reshare') ||
        ariaLabel.includes('crosspost') ||
        ariaLabel.includes('repost') ||
        ariaLabel.includes('reshare') ||
        ariaLabel.includes('remix');

      const isShare =
        tag === 'shreddit-post-share-button' ||
        tag === 'shreddit-share-button' ||
        tag === 'rpl-share-button' ||
        noun.includes('share') ||
        action.includes('share') ||
        clickLoc.includes('share') ||
        clickId.includes('share') ||
        testId.includes('share') ||
        ariaLabel.includes('share');

      if (isReshare) {
        el.setAttribute('data-rg-reshare-btn', 'true');
        el.style.setProperty('border-radius', '8px', 'important');
        el.style.setProperty('height', '32px', 'important');
        el.style.setProperty('max-height', '32px', 'important');
        el.style.setProperty('min-width', '32px', 'important');
        el.style.setProperty('box-sizing', 'border-box', 'important');
        el.style.setProperty('display', 'inline-flex', 'important');
        el.style.setProperty('align-items', 'center', 'important');
        el.style.setProperty('justify-content', 'center', 'important');
        el.style.setProperty('overflow', 'hidden', 'important');
        const parentHasReshare = el.parentElement?.hasAttribute('data-rg-reshare-btn');
        if (!parentHasReshare) {
          el.style.setProperty('background', 'var(--rg-btn-bg, #1a1a1b)', 'important');
          el.style.setProperty('border', '1px solid var(--rg-btn-border, rgba(255, 255, 255, 0.12))', 'important');
        } else {
          el.style.setProperty('background', 'transparent', 'important');
          el.style.setProperty('border', 'none', 'important');
          el.style.setProperty('width', '100%', 'important');
          el.style.setProperty('height', '100%', 'important');
        }
        if (!el.textContent?.trim()) {
          el.style.setProperty('width', '32px', 'important');
          el.style.setProperty('padding', '0px', 'important');
        }
      }

      if (isShare) {
        el.setAttribute('data-rg-share-btn', 'true');
        el.style.setProperty('border-radius', '8px', 'important');
        el.style.setProperty('height', '32px', 'important');
        el.style.setProperty('max-height', '32px', 'important');
        el.style.setProperty('min-width', '32px', 'important');
        el.style.setProperty('box-sizing', 'border-box', 'important');
        el.style.setProperty('display', 'inline-flex', 'important');
        el.style.setProperty('align-items', 'center', 'important');
        el.style.setProperty('justify-content', 'center', 'important');
        el.style.setProperty('overflow', 'hidden', 'important');
        const parentHasShare = el.parentElement?.hasAttribute('data-rg-share-btn');
        if (!parentHasShare) {
          el.style.setProperty('background', 'var(--rg-btn-bg, #1a1a1b)', 'important');
          el.style.setProperty('border', '1px solid var(--rg-btn-border, rgba(255, 255, 255, 0.12))', 'important');
          el.style.setProperty('padding', '0 10px', 'important');
          el.style.setProperty('gap', '6px', 'important');
        } else {
          el.style.setProperty('background', 'transparent', 'important');
          el.style.setProperty('border', 'none', 'important');
          el.style.setProperty('width', '100%', 'important');
          el.style.setProperty('height', '100%', 'important');
        }
      }

      // Check SVG icon for crosspost/reshare inside button or tracker
      if (!isReshare && !isShare && (tag === 'button' || tag === 'faceplate-tracker')) {
        const svgEl = el.querySelector('svg');
        const svgIcon =
          svgEl?.getAttribute('icon-name')?.toLowerCase() ||
          el.getAttribute('icon-name')?.toLowerCase() ||
          '';
        if (svgIcon.includes('crosspost') || svgIcon.includes('repost') || svgIcon.includes('reshare')) {
          el.setAttribute('data-rg-reshare-btn', 'true');
          el.style.setProperty('border-radius', '8px', 'important');
          el.style.setProperty('height', '32px', 'important');
          el.style.setProperty('max-height', '32px', 'important');
          el.style.setProperty('min-width', '32px', 'important');
          el.style.setProperty('width', '32px', 'important');
          el.style.setProperty('padding', '0px', 'important');
          el.style.setProperty('box-sizing', 'border-box', 'important');
          el.style.setProperty('display', 'inline-flex', 'important');
          el.style.setProperty('align-items', 'center', 'important');
          el.style.setProperty('justify-content', 'center', 'important');
          el.style.setProperty('overflow', 'hidden', 'important');
          el.style.setProperty('background', 'var(--rg-btn-bg, #1a1a1b)', 'important');
          el.style.setProperty('border', '1px solid var(--rg-btn-border, rgba(255, 255, 255, 0.12))', 'important');
        }
      }

      // Check all buttons, action controls, vote containers, and pill-shaped elements
      const isBtn =
        tag === 'button' ||
        el.getAttribute('role') === 'button' ||
        tag.includes('button') ||
        tag.includes('vote') ||
        el.hasAttribute('data-post-click-location') ||
        el.className?.includes?.('rounded-full') ||
        el.className?.includes?.('rounded-');

      if (isBtn) {
        el.style.setProperty('border-radius', '8px', 'important');
        if (tag.includes('button') || tag.includes('vote')) {
          el.style.setProperty('overflow', 'hidden', 'important');
        }
      }

      // Check avatars and community icons
      const isAvatar =
        tag === 'img' &&
        (el.closest('[slot="credit-bar"]') !== null ||
          el.closest('shreddit-post-header') !== null ||
          testId.includes('avatar') ||
          testId.includes('icon') ||
          el.getAttribute('src')?.includes('communityIcon') ||
          el.getAttribute('src')?.includes('avatar') ||
          el.className?.includes?.('avatar') ||
          el.className?.includes?.('icon'));

      if (isAvatar) {
        el.style.setProperty('border-radius', '7px', 'important');
        el.style.setProperty('overflow', 'hidden', 'important');
      }

      // Check empty flairs and hide them so no empty pill artifact renders
      const isFlair =
        tag === 'shreddit-post-flair' ||
        tag === 'faceplate-pill' ||
        testId === 'post-flair' ||
        testId.includes('flair') ||
        el.className?.includes?.('flair');

      if (isFlair) {
        const text = el.textContent?.trim() || '';
        if (!text) {
          el.style.setProperty('display', 'none', 'important');
          el.style.setProperty('visibility', 'hidden', 'important');
          el.style.setProperty('height', '0px', 'important');
          el.style.setProperty('padding', '0px', 'important');
          el.style.setProperty('margin', '0px', 'important');
          el.style.setProperty('border', 'none', 'important');
        }
      }

      // Ensure three-dots menu and dropdowns are never clipped and are right-aligned
      const isMenuContainer =
        tag === 'shreddit-overflow-menu' ||
        tag === 'faceplate-dropdown-menu' ||
        tag === 'shreddit-post-overflow-menu' ||
        testId.includes('overflow-menu') ||
        noun === 'overflow-menu';

      if (isMenuContainer) {
        el.style.setProperty('overflow', 'visible', 'important');
      }

      if (tag === 'faceplate-dropdown-menu' || el.getAttribute('role') === 'menu') {
        el.style.setProperty('right', '0px', 'important');
        el.style.setProperty('left', 'auto', 'important');
        el.style.setProperty('z-index', '100000', 'important');
      }
    }

    // Traverse child nodes
    const children = rootNode.childNodes;
    if (children) {
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (child.nodeType === 1 || child.nodeType === 11) {
          deepPierceSquircle(child, force);
        }
      }
    }
  }

  /** @param {Element} node */
  function processPost(node) {
    const settings = window.RedditPro.Settings.get();

    // Ensure squircle styling and Join button positioning are enforced immediately
    if (!node.hasAttribute('data-rg-squircle-done')) {
      node.setAttribute('data-rg-squircle-done', 'true');
      deepPierceSquircle(node, true);
      node.addEventListener(
        'mouseenter',
        () => deepPierceSquircle(node, true),
        { once: true, passive: true }
      );
    }

    // Ensure title box formatting and uniform line alignment across line breaks
    const titleEl = node.querySelector(
      '[slot="title"], [slot="post-title"], shreddit-post-title, a[id*="post-title"]'
    );
    if (titleEl) {
      /** @type {HTMLElement} */ (titleEl).style.setProperty('display', 'block', 'important');
      /** @type {HTMLElement} */ (titleEl).style.setProperty('box-sizing', 'border-box', 'important');
      /** @type {HTMLElement} */ (titleEl).style.setProperty('width', '100%', 'important');
      /** @type {HTMLElement} */ (titleEl).style.setProperty('word-break', 'break-word', 'important');
    }

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

    // Immediately collapse and eliminate any hr, separator or divider elements
    if (
      node.matches?.(
        'hr, [role="separator"], shreddit-separator, [data-testid*="separator"], [data-testid*="divider"]'
      )
    ) {
      node.setAttribute('data-rg-processed', 'true');
      const nodeEl = /** @type {any} */ (node);
      if (nodeEl.style) {
        nodeEl.style.setProperty('display', 'none', 'important');
        nodeEl.style.setProperty('height', '0px', 'important');
        nodeEl.style.setProperty('margin', '0px', 'important');
        nodeEl.style.setProperty('padding', '0px', 'important');
        nodeEl.style.setProperty('border', 'none', 'important');
      }
      return;
    }
    if (node.querySelectorAll) {
      node
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
    }

    if (node.matches(POST_SELECTOR)) {
      node.setAttribute('data-rg-processed', 'true');
      node.setAttribute('data-rg-new', '1');
      isPreloading = false;
      if (lastObservedSentinel?.isConnected) {
        lastObservedSentinel.removeAttribute('data-rg-triggered');
      }
      setTimeout(() => {
        try {
          node.removeAttribute('data-rg-new');
        } catch {
          /* ignore */
        }
      }, 300);
      processPost(node);
      observeFeedEnd();
      return;
    }

    if (node.matches(BATCH_SELECTOR)) {
      node.setAttribute('data-rg-processed', 'true');
      isPreloading = false;
      if (lastObservedSentinel?.isConnected) {
        lastObservedSentinel.removeAttribute('data-rg-triggered');
      }
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
      if (card) {
        window.RedditPro.Masonry?.attachImageListeners?.(card);
      }
      return;
    }
  }

  /** @param {Element} root */
  function handleAddedNode(root) {
    if (root.nodeType !== 1) return;

    // Immediately eliminate any separators or horizontal lines in this added subtree
    if (
      root.matches?.(
        'hr, [role="separator"], shreddit-separator, [data-testid*="separator"], [data-testid*="divider"], [class*="separator"], [class*="divider"]'
      )
    ) {
      root.setAttribute('data-rg-processed', 'true');
      const rootEl = /** @type {any} */ (root);
      if (rootEl.style) {
        rootEl.style.setProperty('display', 'none', 'important');
        rootEl.style.setProperty('height', '0px', 'important');
        rootEl.style.setProperty('margin', '0px', 'important');
        rootEl.style.setProperty('padding', '0px', 'important');
        rootEl.style.setProperty('border', 'none', 'important');
      }
      return;
    }

    if (root.querySelectorAll) {
      root
        .querySelectorAll(
          'hr, [role="separator"], shreddit-separator, [data-testid*="separator"], [data-testid*="divider"], [class*="separator"], [class*="divider"]'
        )
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

      // Strip border-bottom and padding from any wrapper article containing shreddit-post
      root.querySelectorAll('article:has(shreddit-post), faceplate-tracker:has(shreddit-post)').forEach((el) => {
        const artEl = /** @type {any} */ (el);
        if (artEl.style) {
          artEl.style.setProperty('border', 'none', 'important');
          artEl.style.setProperty('border-bottom', 'none', 'important');
          artEl.style.setProperty('background', 'transparent', 'important');
          artEl.style.setProperty('padding-bottom', '0px', 'important');
          artEl.style.setProperty('margin-bottom', '0px', 'important');
        }
      });
    }

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
  let scrollPreloadRafPending = false;

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
      if (el.hasAttribute('data-rg-spent-sentinel') || el.matches('[data-rg-spent-sentinel="1"]')) return false;
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
      if (el.hasAttribute('data-rg-spent-sentinel') || el.matches('[data-rg-spent-sentinel="1"]')) return false;
      if (el.closest('shreddit-post, article, .Post, shreddit-profile-comment')) return false;
      if (el.querySelector('shreddit-post, article, .Post')) return false;
      const src = (el.getAttribute('src') || el.getAttribute('data-src') || '').toLowerCase();
      if (src && /(modal|dialog|hover-card|menu|banner|drawer|consent)/i.test(src)) return false;
      return true;
    });

    return generalCandidates.length > 0 ? generalCandidates[generalCandidates.length - 1] : null;
  }

  /**
   * Directly fetches the partial HTML payload from Reddit when the native custom element
   * fails or stalls to load content, then safely injects the new post cards and updates layout.
   * @param {Element} sentinel
   * @param {Element} feed
   * @param {string} src
   */
  async function fetchBatchDirectly(sentinel, feed, src) {
    if (!sentinel || !feed || !src) return;
    try {
      const fullUrl = src.startsWith('http') ? src : `${window.location.origin}${src}`;
      const response = await fetch(fullUrl, {
        credentials: 'include',
        headers: {
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });

      if (!response.ok) return;

      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      // Strip any hr, separator or divider elements from server HTML immediately
      doc
        .querySelectorAll('hr, [role="separator"], shreddit-separator, [data-testid*="separator"], [data-testid*="divider"]')
        .forEach((el) => el.remove());

      // Extract batch, post cards, and subsequent sentinel partials
      const elementsToInject = doc.querySelectorAll(
        'faceplate-batch, shreddit-post, article, .Post, faceplate-partial[slot="load-after"], faceplate-partial[id*="feed-next-page"], faceplate-partial[src*="/feeds/"]'
      );

      if (elementsToInject.length === 0) return;

      // Mark the spent sentinel so it doesn't get triggered again
      sentinel.setAttribute('data-rg-spent-sentinel', '1');
      sentinel.removeAttribute('data-rg-sentinel');
      sentinel.removeAttribute('data-rg-triggered');
      const sentinelEl = /** @type {any} */ (sentinel);
      if (sentinelEl.style) {
        sentinelEl.style.setProperty('display', 'none', 'important');
      }

      const fragment = document.createDocumentFragment();
      /** @type {Element | null} */
      let nextSentinel = null;
      const seen = new Set();

      elementsToInject.forEach((el) => {
        if (el.matches?.('faceplate-partial')) {
          nextSentinel = el;
          return;
        }

        const tag = el.tagName.toLowerCase();
        if (tag === 'faceplate-batch') {
          if (!seen.has(el)) {
            seen.add(el);
            fragment.appendChild(el);
            el.querySelectorAll('shreddit-post, article, .Post').forEach((c) => seen.add(c));
          }
        } else if (!seen.has(el) && !el.closest('faceplate-batch')) {
          seen.add(el);
          fragment.appendChild(el);
        }
      });

      if (nextSentinel) {
        fragment.appendChild(nextSentinel);
      }

      if (sentinel.parentNode === feed) {
        feed.insertBefore(fragment, sentinel);
      } else {
        feed.appendChild(fragment);
      }

      // Re-observe feed container and recalculate layout
      if (window.RedditPro?.Masonry?.observeFeedContainer) {
        window.RedditPro.Masonry.observeFeedContainer();
      }
    } catch {
      // Fallback network or parse error silently ignored
    } finally {
      isPreloading = false;
    }
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
    target.setAttribute('data-rg-sentinel', '1');
    target.setAttribute('data-rg-triggered', 'true');
    const targetEl = /** @type {any} */ (target);
    if (targetEl.style) {
      targetEl.style.setProperty('display', 'flex', 'important');
      targetEl.style.setProperty('grid-column', '1 / -1', 'important');
      targetEl.style.setProperty('width', '100%', 'important');
      targetEl.style.setProperty('min-height', '80px', 'important');
      targetEl.style.setProperty('align-items', 'center', 'important');
      targetEl.style.setProperty('justify-content', 'center', 'important');
    }

    // 1. If it's or contains a button, click it (only if it's genuinely a load-more button, never back-to-top)
    const isLoadMoreButton = (/** @type {Element | null} */ el) => {
      if (!el || el.tagName !== 'BUTTON') return false;
      const label = (
        el.getAttribute('aria-label') ||
        el.getAttribute('title') ||
        el.textContent ||
        ''
      ).toLowerCase();
      const icon = (el.getAttribute('icon-name') || '').toLowerCase();
      if (
        label.includes('top') ||
        label.includes('up') ||
        icon.includes('top') ||
        icon.includes('up') ||
        icon === 'back-to-top'
      ) {
        return false;
      }
      return (
        el.getAttribute('slot') === 'load-more' ||
        el.getAttribute('slot') === 'more-posts' ||
        label.includes('more posts') ||
        label.includes('load more') ||
        label.includes('view more')
      );
    };

    const btn = target.tagName === 'BUTTON' ? target : target.querySelector('button');
    if (btn && isLoadMoreButton(btn)) {
      try { /** @type {HTMLElement} */ (btn).click(); } catch {}
    }

    // 2. Set eager loading on lazy elements so Faceplate fetches immediately
    try {
      target.setAttribute('loading', 'eager');
      targetEl.loading = 'eager';
    } catch {}

    // 3. Trigger native Web Component loading methods
    if (typeof targetEl.loadContent === 'function') {
      try { targetEl.loadContent(); } catch {}
    } else if (typeof targetEl.load === 'function') {
      try {
        target.setAttribute('loading', 'programmatic');
        targetEl.loading = 'programmatic';
        targetEl.load();
      } catch {}
    } else if (typeof targetEl.fetch === 'function') {
      try { targetEl.fetch(); } catch {}
    } else if (typeof targetEl.reload === 'function') {
      try { targetEl.reload(); } catch {}
    }

    // 4. Dispatch standard custom events expected by Reddit Faceplate components
    target.dispatchEvent(new CustomEvent('faceplate-trigger', { bubbles: true }));
    feed.dispatchEvent(new CustomEvent('shreddit-feed-more-posts', { bubbles: true }));

    // 5. Direct Fetch fallback: If Reddit's web component does not append posts within 1200ms,
    // fetch the src directly and inject the next batch seamlessly.
    const initialPostCount = feed.querySelectorAll(POST_SELECTOR).length;
    const src = target.getAttribute('src') || target.getAttribute('data-src');
    if (src) {
      setTimeout(() => {
        if (
          target.isConnected &&
          !target.querySelector(POST_SELECTOR) &&
          feed.querySelectorAll(POST_SELECTOR).length <= initialPostCount
        ) {
          fetchBatchDirectly(target, feed, src);
        }
      }, 1200);
    }

    // 6. Ensure that if the custom element hasn't been defined/upgraded yet, we trigger once defined
    if (typeof customElements !== 'undefined' && customElements && typeof customElements.get === 'function') {
      const tag = target.tagName.toLowerCase();
      if (tag.includes('-') && !customElements.get(tag)) {
        customElements
          .whenDefined(tag)
          .then(() => {
            if (target.isConnected && !target.querySelector('shreddit-post, article, .Post')) {
              try {
                if (typeof targetEl.loadContent === 'function') targetEl.loadContent();
                else if (typeof targetEl.load === 'function') targetEl.load();
                else if (typeof targetEl.fetch === 'function') targetEl.fetch();
              } catch {}
            }
          })
          .catch(() => {});
      }
    }

    setTimeout(() => {
      if (target.isConnected && !target.querySelector('shreddit-post, article, .Post')) {
        target.removeAttribute('data-rg-triggered');
      }
    }, 1500);

    setTimeout(() => {
      isPreloading = false;
    }, 1000);
  }

  function observeFeedEnd() {
    const feed = document.querySelector(
      'shreddit-feed, profile-feed, shreddit-profile-feed, shreddit-user-feed, [data-testid="post-list"], main > div:has(> shreddit-post), main > div:has(> article)'
    );
    if (!feed) return;

    const sentinel = findFeedSentinel(feed);
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
          rootMargin: '800px 0px',
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
    if (scrollPreloadRafPending) return;
    scrollPreloadRafPending = true;
    requestAnimationFrame(() => {
      scrollPreloadRafPending = false;
      if (isPreloading) return;
      if (window.scrollY < 200) return;
      const doc = document.documentElement;
      const scrollHeight = doc ? doc.scrollHeight : (document.body?.scrollHeight || 0);
      const currentScroll = window.scrollY + window.innerHeight;
      if (scrollHeight - currentScroll < 1000) {
        triggerNextFeedBatch();
      }
    });
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
      if (node instanceof Element) {
        handleAddedNode(node);
        deepPierceSquircle(node);
      }
    });

    // Feed-wide sweep to eliminate any lingering separators or trailing lines on infinite scroll
    const feed = document.querySelector(
      'shreddit-feed, profile-feed, shreddit-profile-feed, shreddit-user-feed, [data-testid="post-list"]'
    );
    if (feed) {
      feed
        .querySelectorAll(
          'hr, [role="separator"], shreddit-separator, [data-testid*="separator"], [data-testid*="divider"]'
        )
        .forEach((el) => {
          const sep = /** @type {any} */ (el);
          if (sep.style) {
            sep.style.setProperty('display', 'none', 'important');
            sep.style.setProperty('height', '0px', 'important');
            sep.style.setProperty('margin', '0px', 'important');
            sep.style.setProperty('padding', '0px', 'important');
            sep.style.setProperty('border', 'none', 'important');
          }
        });
      feed.querySelectorAll('article:has(shreddit-post), faceplate-tracker:has(shreddit-post)').forEach((el) => {
        const art = /** @type {any} */ (el);
        if (art.style) {
          art.style.setProperty('border', 'none', 'important');
          art.style.setProperty('border-bottom', 'none', 'important');
          art.style.setProperty('background', 'transparent', 'important');
          art.style.setProperty('padding-bottom', '0px', 'important');
          art.style.setProperty('margin-bottom', '0px', 'important');
        }
      });
    }
  }

  /** @param {Node[]} nodes */
  function enqueueNodes(nodes) {
    nodes.forEach((node) => mutationBatch.add(node));
    if (!rafPending && mutationBatch.size > 0) {
      rafPending = true;
      requestAnimationFrame(processMutations);
    }
  }

  /** @param {Event} e */
  function onSidebarToggleClick(e) {
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
  }

  /** @param {Event} e */
  function onDropdownClick(e) {
    const target = /** @type {Element | null} */ (e.target);
    if (!target) return;

    const trigger = target.closest(
      'shreddit-overflow-menu, [data-post-click-location="overflow-menu"], button[aria-haspopup="menu"]'
    );

    if (trigger) {
      const post = trigger.closest('shreddit-post, article, .Post');
      if (post) {
        requestAnimationFrame(() => {
          const isOpen =
            trigger.hasAttribute('open') ||
            trigger.querySelector('[open], [aria-expanded="true"]') !== null ||
            trigger.getAttribute('aria-expanded') === 'true' ||
            !post.hasAttribute('data-rg-menu-open');

          document.querySelectorAll('[data-rg-menu-open="true"]').forEach((p) => {
            if (p !== post) p.removeAttribute('data-rg-menu-open');
          });

          if (isOpen) {
            post.setAttribute('data-rg-menu-open', 'true');
            /** @type {HTMLElement} */ (post).style.setProperty('overflow', 'visible', 'important');
            /** @type {HTMLElement} */ (post).style.setProperty('z-index', '99999', 'important');

            const menu = post.querySelector('faceplate-dropdown-menu, [role="menu"], [slot="dropdown"]');
            if (menu) {
              /** @type {HTMLElement} */ (menu).style.setProperty('right', '0px', 'important');
              /** @type {HTMLElement} */ (menu).style.setProperty('left', 'auto', 'important');
              /** @type {HTMLElement} */ (menu).style.setProperty('z-index', '100000', 'important');
            }
          } else {
            post.removeAttribute('data-rg-menu-open');
          }
        });
      }
    } else if (!target.closest('faceplate-dropdown-menu, [role="menu"], [slot="dropdown"]')) {
      document.querySelectorAll('[data-rg-menu-open="true"]').forEach((p) => {
        p.removeAttribute('data-rg-menu-open');
      });
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
    document.addEventListener('click', onSidebarToggleClick, { passive: true });

    // Track three-dots dropdown open/close to elevate host card and prevent edge clipping
    document.addEventListener('click', onDropdownClick, true);

    // Existing posts may already be present before the observer is attached.
    handleAddedNode(document.documentElement);
    deepPierceSquircle(document.documentElement);
    setTimeout(() => deepPierceSquircle(document.documentElement), 150);
    setTimeout(() => deepPierceSquircle(document.documentElement), 600);
    setTimeout(() => deepPierceSquircle(document.documentElement), 1500);
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
    document.removeEventListener('click', onSidebarToggleClick);
    document.removeEventListener('click', onDropdownClick, true);
    scrollPreloadRafPending = false;
    clearTimeout(sweepTimer);
    mutationBatch.clear();
    rafPending = false;
  }

  return { start, stop, triggerNextFeedBatch, fetchBatchDirectly };
})();
