/**
 * @file lifecycle.js
 * @description Master orchestrator that safely mounts and unmounts the extension during SPA navigation.
 */
// @ts-nocheck
window.RedditPro = window.RedditPro || {};

window.RedditPro.Lifecycle = (function() {
  const PAGE_TYPE = {
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
    let parsedUrl;
    try {
      parsedUrl = new URL(url, location.origin);
    } catch {
      return PAGE_TYPE.FEED;
    }

    const path = parsedUrl.pathname;

    // 1. Post threads
    if (/\/comments\/[a-z0-9]+\//i.test(path)) return PAGE_TYPE.POST_THREAD;

    // 2. Search
    if (/\/search(\/|\?|$)/i.test(path)) return PAGE_TYPE.SEARCH;

    // 3. Saved pages
    if (/\/(user|u)\/[^/]+\/saved(\/|\?|$)/i.test(path) || /^\/saved(\/|\?|$)/i.test(path)) {
      return PAGE_TYPE.SAVED;
    }

    // 4. Wiki & documentation
    if (/\/wiki(\/|$)/i.test(path)) return PAGE_TYPE.WIKI;

    // 5. Subreddit About & Rules & Mod
    if (/\/about\/mod(\/|$)/i.test(path) || /^\/mod(\/|$)/i.test(path)) return PAGE_TYPE.MOD;
    if (/\/about(\/|$)/i.test(path)) return PAGE_TYPE.ABOUT;

    // 6. Submit
    if (/\/submit(\/|$)/i.test(path)) return PAGE_TYPE.SUBMIT;

    // 7. Notifications
    if (/^\/notifications(\/|$)/i.test(path)) return PAGE_TYPE.NOTIFICATIONS;

    // 8. Messages
    if (/^\/message(\/|$)/i.test(path)) return PAGE_TYPE.MESSAGES;

    // 9. Settings
    if (/^\/settings(\/|$)/i.test(path)) return PAGE_TYPE.SETTINGS;

    // 10. Standalone utility pages
    if (/^\/(vault|premium|policies)(\/|$)/i.test(path)) return PAGE_TYPE.STANDALONE;

    // 11. Communities & subreddits directory
    if (/^\/(communities|subreddits|topics|best\/communities)(\/|$)/i.test(path)) {
      return PAGE_TYPE.COMMUNITIES;
    }

    // 12. Custom feeds under user (e.g. /user/spez/m/techfeed/ or /u/spez/m/news/)
    if (/\/(user|u)\/[^/]+\/m\/[^/]+/i.test(path)) return PAGE_TYPE.FEED;

    // 13. User profile pages
    if (/\/(user|u)\/[^/]+/i.test(path)) return PAGE_TYPE.PROFILE;

    // 14. Standard feeds
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

    if (isFeedLike) {
      setTimeout(() => window.RedditPro.Masonry?.sweepAll?.(), 80);
      setTimeout(() => window.RedditPro.Masonry?.sweepAll?.(), 400);
    }
  }

  function resume() {
    if (running) return;
    running = true;
    if (window.RedditPro.DOMObserver) window.RedditPro.DOMObserver.start();
    window.RedditPro.Masonry.sweepAll();
  }

  function halt() {
    // A route transition can leave a feed player visible while the feed observers
    // are being stopped. Mute immediately, even when already halted.
    window.RedditPro.AudioObserver?.muteAll();
    if (!running) return;
    running = false;
    if (window.RedditPro.DOMObserver) window.RedditPro.DOMObserver.stop();
    window.RedditPro.Masonry.disconnectAll();
  }

  function onNavigate() {
    const current = location.href;
    if (current === lastUrl) return;
    lastUrl = current;
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
    window.addEventListener('popstate', onNavigate);
    window.addEventListener('hashchange', onNavigate);
    const _push = history.pushState.bind(history);
    const _replace = history.replaceState.bind(history);
    history.pushState = function (...args) { _push(...args); setTimeout(onNavigate, 0); };
    history.replaceState = function (...args) { _replace(...args); setTimeout(onNavigate, 0); };
  }

  return { init, resume, halt, detectPageType, applyRoutingLogic, PAGE_TYPE };
})();

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => window.RedditPro.Lifecycle.init());
  if (document.readyState === 'interactive' || document.readyState === 'complete') {
    window.RedditPro.Lifecycle.init();
  }
}
