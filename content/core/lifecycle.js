/**
 * @file lifecycle.js
 * @description Master orchestrator that safely mounts and unmounts the extension during SPA navigation.
 */
window.RedditPro = window.RedditPro || {};

window.RedditPro.Lifecycle = (function() {
  const PAGE_TYPE = { FEED: 'feed', POST_THREAD: 'post_thread', PROFILE: 'profile', SEARCH: 'search' };
  /** @type {boolean} */
  let running = false;
  /** @type {string} */
  let lastUrl = location.href;
  /** @type {number | null} */
  let navDebounce = null;

  /**
   * Initializes the entire extension lifecycle.
   */
  function init() {
    window.RedditPro.Settings.load().then(() => {
      window.RedditPro.CSSVars.init();
      if (window.RedditPro.Filters) window.RedditPro.Filters.init();
      setupNavigationWatchers();
      applyRoutingLogic();
    });
  }

  /**
   * @param {string} url
   * @returns {string}
   */
  function detectPageType(url) {
    if (/\/comments\/[a-z0-9]+\//.test(url)) return PAGE_TYPE.POST_THREAD;
    if (/\/user\/[^/]+\/(saved|posts|comments|history|hidden|upvoted|downvoted)/i.test(url)) return PAGE_TYPE.PROFILE;
    if (/\/user\/[^/]+\/?$/.test(url)) return PAGE_TYPE.PROFILE;
    if (/\/search\/?/.test(url)) return PAGE_TYPE.SEARCH;
    if (/\/r\/[^/]+(\/?)?$/.test(url)) return PAGE_TYPE.FEED;
    if (url.endsWith('.reddit.com/') || /reddit\.com\/?$/.test(url)) return PAGE_TYPE.FEED;
    return PAGE_TYPE.FEED;
  }

  function applyRoutingLogic() {
    const pageType = detectPageType(location.href);
    if (pageType === PAGE_TYPE.POST_THREAD) {
      window.RedditPro.Settings.updateActive({ columns: '1' });
      halt();
    } else {
      window.RedditPro.Settings.updateActive({}); 
      resume();
    }
    if (pageType !== PAGE_TYPE.POST_THREAD) {
      setTimeout(() => window.RedditPro.Masonry.sweepAll(), 80);
      setTimeout(() => window.RedditPro.Masonry.sweepAll(), 400);
    }
  }

  function resume() {
    if (running) return;
    running = true;
    if (window.RedditPro.DOMObserver) window.RedditPro.DOMObserver.start();
    window.RedditPro.Masonry.sweepAll();
  }

  function halt() {
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

  return { init, resume, halt };
})();

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => window.RedditPro.Lifecycle.init());
  if (document.readyState === 'interactive' || document.readyState === 'complete') {
    window.RedditPro.Lifecycle.init();
  }
}
