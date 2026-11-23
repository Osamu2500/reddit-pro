/**
 * @file lifecycle.js
 * @description Master orchestrator that safely mounts and unmounts the extension during SPA navigation.
 */
// @ts-nocheck
window.RedditPro = window.RedditPro || {};

window.RedditPro.Lifecycle = (function() {
  const Router = window.RedditPro.Router;
  const PAGE_TYPE = Router ? Router.PAGE_TYPE : {
    FEED: 'feed',
    POST_THREAD: 'post_thread',
    PROFILE: 'profile',
    SAVED: 'saved',
    SEARCH: 'search',
    COMMUNITIES: 'communities',
    WIKI: 'wiki',
    ABOUT: 'about',
    SUBMIT: 'submit',
    NOTIFICATIONS: 'notifications',
    MESSAGES: 'messages',
    SETTINGS: 'settings',
    MOD: 'mod',
    STANDALONE: 'standalone',
  };
  /** @type {boolean} */
  let running = false;
  /** @type {string} */
  let lastUrl = location.href;
  /** @type {string} */
  let lastRoutedPath = '';
  /** @type {number | null} */
  let navDebounce = null;
  /** @type {boolean} */
  let isInitialized = false;

  /**
   * Initializes the entire extension lifecycle.
   */
  function init() {
    if (isInitialized) return;
    isInitialized = true;
    
    window.RedditPro.Settings.load().then(() => {
      window.RedditPro.CSSVars.init();
      if (window.RedditPro.Filters) window.RedditPro.Filters.init();
      if (window.RedditPro.Virtualizer) window.RedditPro.Virtualizer.init();
      if (window.RedditPro.PostModal) window.RedditPro.PostModal.init();
      setupNavigationWatchers();
      applyRoutingLogic();
    });
  }

  /**
   * @param {string} url
   * @returns {string}
   */
  function detectPageType(url) {
    if (window.RedditPro.Router?.detectPageType) {
      return window.RedditPro.Router.detectPageType(url);
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(url, location.origin);
    } catch {
      return PAGE_TYPE.FEED;
    }

    const path = parsedUrl.pathname;
    if (/\/comments\/[a-z0-9]+(?:\/|$)/i.test(path)) return PAGE_TYPE.POST_THREAD;
    if (/\/search(\/|\?|$)/i.test(path)) return PAGE_TYPE.SEARCH;
    if (/\/(user|u)\/[^/]+\/saved(\/|\?|$)/i.test(path) || /^\/saved(\/|\?|$)/i.test(path)) return PAGE_TYPE.SAVED;
    if (/\/wiki(\/|$)/i.test(path)) return PAGE_TYPE.WIKI;
    if (/\/about\/mod(\/|$)/i.test(path) || /^\/mod(\/|$)/i.test(path)) return PAGE_TYPE.MOD;
    if (/\/about(\/|$)/i.test(path)) return PAGE_TYPE.ABOUT;
    if (/\/submit(\/|$)/i.test(path)) return PAGE_TYPE.SUBMIT;
    if (/^\/notifications(\/|$)/i.test(path)) return PAGE_TYPE.NOTIFICATIONS;
    if (/^\/message(\/|$)/i.test(path)) return PAGE_TYPE.MESSAGES;
    if (/^\/settings(\/|$)/i.test(path)) return PAGE_TYPE.SETTINGS;
    if (/^\/(vault|premium|policies)(\/|$)/i.test(path)) return PAGE_TYPE.STANDALONE;
    if (/^\/(communities|subreddits|topics|best\/communities)(\/|$)/i.test(path)) return PAGE_TYPE.COMMUNITIES;
    if (/\/(user|u)\/[^/]+\/m\/[^/]+/i.test(path)) return PAGE_TYPE.FEED;
    if (/\/(user|u)\/[^/]+/i.test(path)) return PAGE_TYPE.PROFILE;
    return PAGE_TYPE.FEED;
  }

  function applyRoutingLogic() {
    if (!document.body) {
      if (typeof requestAnimationFrame !== 'undefined') {
        requestAnimationFrame(applyRoutingLogic);
      } else {
        setTimeout(applyRoutingLogic, 20);
      }
      return;
    }

    // Do not disrupt the background feed layout while a post modal preview is open
    if (document.body.classList.contains('rg-modal-open') || history.state?.redditProModal === true) {
      window.RedditPro.AudioObserver?.muteAll();
      return;
    }

    const pageType = detectPageType(location.href);
    
    // Manage Body Classes for SPA Routing CSS Targeting
    document.body.classList.remove(
      'rg-page-home',
      'rg-page-community',
      'rg-page-profile',
      'rg-page-saved',
      'rg-page-post',
      'rg-page-search',
      'rg-page-communities',
      'rg-page-wiki',
      'rg-page-about',
      'rg-page-submit',
      'rg-page-notifications',
      'rg-page-messages',
      'rg-page-settings',
      'rg-page-mod',
      'rg-page-standalone'
    );
    const path = location.pathname;
    
    switch (pageType) {
      case PAGE_TYPE.POST_THREAD:
        document.body.classList.add('rg-page-post');
        window.RedditPro.Settings?.updateActive({ columns: '1' });
        halt();
        break;
      case PAGE_TYPE.WIKI:
        document.body.classList.add('rg-page-wiki');
        window.RedditPro.Settings?.updateActive({ columns: '1' });
        halt();
        break;
      case PAGE_TYPE.ABOUT:
        document.body.classList.add('rg-page-about');
        window.RedditPro.Settings?.updateActive({ columns: '1' });
        halt();
        break;
      case PAGE_TYPE.SUBMIT:
        document.body.classList.add('rg-page-submit');
        window.RedditPro.Settings?.updateActive({ columns: '1' });
        halt();
        break;
      case PAGE_TYPE.NOTIFICATIONS:
        document.body.classList.add('rg-page-notifications');
        window.RedditPro.Settings?.updateActive({ columns: '1' });
        halt();
        break;
      case PAGE_TYPE.MESSAGES:
        document.body.classList.add('rg-page-messages');
        window.RedditPro.Settings?.updateActive({ columns: '1' });
        halt();
        break;
      case PAGE_TYPE.SETTINGS:
        document.body.classList.add('rg-page-settings');
        window.RedditPro.Settings?.updateActive({ columns: '1' });
        halt();
        break;
      case PAGE_TYPE.MOD:
        document.body.classList.add('rg-page-mod');
        window.RedditPro.Settings?.updateActive({ columns: '1' });
        halt();
        break;
      case PAGE_TYPE.STANDALONE:
        document.body.classList.add('rg-page-standalone');
        window.RedditPro.Settings?.updateActive({ columns: '1' });
        halt();
        break;
      case PAGE_TYPE.COMMUNITIES:
        document.body.classList.add('rg-page-communities');
        window.RedditPro.Settings?.updateActive({});
        resume();
        break;
      case PAGE_TYPE.SEARCH:
        document.body.classList.add('rg-page-search');
        window.RedditPro.Settings?.updateActive({});
        resume();
        break;
      case PAGE_TYPE.SAVED:
        document.body.classList.add('rg-page-saved', 'rg-page-profile');
        window.RedditPro.Settings?.updateActive({});
        resume();
        break;
      case PAGE_TYPE.PROFILE:
        document.body.classList.add('rg-page-profile');
        window.RedditPro.Settings?.updateActive({});
        resume();
        break;
      case PAGE_TYPE.FEED:
      default:
        if (
          path === '/' ||
          path.match(/^\/(best|hot|new)\/?$/) ||
          path.startsWith('/r/popular') ||
          path.startsWith('/r/all')
        ) {
          document.body.classList.add('rg-page-home');
        } else {
          document.body.classList.add('rg-page-community');
        }
        window.RedditPro.Settings?.updateActive({});
        resume();
        break;
    }
    
    const isFeedLike = [
      PAGE_TYPE.FEED,
      PAGE_TYPE.PROFILE,
      PAGE_TYPE.SAVED,
      PAGE_TYPE.SEARCH,
      PAGE_TYPE.COMMUNITIES,
    ].includes(pageType);

    if (isFeedLike && (!running || path !== lastRoutedPath)) {
      setTimeout(() => window.RedditPro.Masonry?.sweepAll?.(), 80);
      setTimeout(() => window.RedditPro.Masonry?.sweepAll?.(), 400);
    }
    lastRoutedPath = path;
  }

  function resume() {
    if (running) return;
    running = true;
    if (window.RedditPro.DOMObserver) window.RedditPro.DOMObserver.start();
    window.RedditPro.Masonry.sweepAll();
  }

  function halt() {
    // A route transition can leave a feed player visible while the feed observers
    // are being stopped. Mute and disconnect immediately to prevent memory leaks.
    if (typeof window.RedditPro.AudioObserver?.disconnectAll === 'function') {
      window.RedditPro.AudioObserver.disconnectAll();
    } else {
      window.RedditPro.AudioObserver?.muteAll?.();
    }
    if (!running) return;
    running = false;
    if (window.RedditPro.DOMObserver) window.RedditPro.DOMObserver.stop();
    window.RedditPro.Masonry.disconnectAll();
  }

  function onNavigate() {
    const current = location.href;
    if (current === lastUrl) return;

    let isPaginationOrScrollUpdate = false;
    try {
      const prevUrlObj = new URL(lastUrl, location.origin);
      const currUrlObj = new URL(current, location.origin);

      if (prevUrlObj.pathname === currUrlObj.pathname) {
        // Compare query params excluding pagination/scroll tracking params
        const prevParams = new URLSearchParams(prevUrlObj.search);
        const currParams = new URLSearchParams(currUrlObj.search);
        const scrollParams = [
          'after',
          'before',
          'count',
          'cursor',
          'page',
          'feed_view',
          'feedView',
          'uuid',
          'source',
        ];
        scrollParams.forEach((p) => {
          prevParams.delete(p);
          currParams.delete(p);
        });
        if (prevParams.toString() === currParams.toString()) {
          isPaginationOrScrollUpdate = true;
        }
      }
    } catch {
      // In case of invalid URL, fallback to full navigate
    }

    const currentPageType = detectPageType(current);
    const previousPageType = detectPageType(lastUrl);

    lastUrl = current;

    // Ignore query parameter and pagination cursor changes on the same page
    if (isPaginationOrScrollUpdate && currentPageType === previousPageType) {
      return;
    }

    // @ts-ignore
    clearTimeout(navDebounce);
    navDebounce = window.setTimeout(() => applyRoutingLogic(), 250);
  }

  function setupNavigationWatchers() {
    const headForTitle = document.querySelector('head');
    if (headForTitle) {
      new MutationObserver(() => {
        if (location.href !== lastUrl) onNavigate();
      }).observe(headForTitle, { childList: true, subtree: false });
    }
    if (!window.__rpNavListenersAttached) {
      window.addEventListener('popstate', () => window.RedditPro?.Lifecycle?.__onNavigate?.());
      window.addEventListener('hashchange', () => window.RedditPro?.Lifecycle?.__onNavigate?.());
      window.__rpNavListenersAttached = true;
    }
    if (!history.pushState.__redditProPatched) {
      const _push = history.pushState.bind(history);
      const pushWrapper = function (...args) {
        const res = _push(...args);
        setTimeout(() => window.RedditPro?.Lifecycle?.__onNavigate?.(), 0);
        return res;
      };
      pushWrapper.__redditProPatched = true;
      history.pushState = pushWrapper;
    }
    if (!history.replaceState.__redditProPatched) {
      const _replace = history.replaceState.bind(history);
      const replaceWrapper = function (...args) {
        const res = _replace(...args);
        setTimeout(() => window.RedditPro?.Lifecycle?.__onNavigate?.(), 0);
        return res;
      };
      replaceWrapper.__redditProPatched = true;
      history.replaceState = replaceWrapper;
    }
  }

  return { init, resume, halt, detectPageType, applyRoutingLogic, PAGE_TYPE, __onNavigate: onNavigate };
})();

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => window.RedditPro.Lifecycle.init());
  if (document.readyState === 'interactive' || document.readyState === 'complete') {
    window.RedditPro.Lifecycle.init();
  }
}
