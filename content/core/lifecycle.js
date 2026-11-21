/**
 * @file lifecycle.js
 * @description Master orchestrator that safely mounts and unmounts the extension during SPA navigation.
 */
// @ts-nocheck
window.RedditPro = window.RedditPro || {};

window.RedditPro.Lifecycle = (function () {
  const PAGE_TYPE = {
    FEED: 'feed',
    POST_THREAD: 'post_thread',
    PROFILE: 'profile',
    SAVED: 'saved',
    COMMUNITIES: 'communities',
    SEARCH: 'search',
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
   * Safely extracts the lowercased pathname from a URL string or object.
   * @param {string} url
   * @returns {string}
   */
  function getPathname(url) {
    try {
      return new URL(url, location.origin).pathname.toLowerCase();
    } catch {
      return (location.pathname || '').toLowerCase();
    }
  }

  /**
   * Detects the specific page type across all Reddit URLs.
   * @param {string} url
   * @returns {string}
   */
  function detectPageType(url) {
    const path = getPathname(url);

    // 1. Post threads & comment permalinks
    if (/\/comments\/[a-z0-9]+/i.test(path)) return PAGE_TYPE.POST_THREAD;

    // 2. Subreddit Wiki and documentation pages
    if (/\/wiki(?:\/.*)?$/i.test(path)) return PAGE_TYPE.WIKI;

    // 3. Subreddit About, Rules, and Moderator directories
    if (
      /\/about\/(?:rules|moderators|modqueue|reports|spam|traffic)(?:\/.*)?$/i.test(path) ||
      /\/about\/?$/i.test(path)
    ) {
      return PAGE_TYPE.ABOUT;
    }

    // 4. Saved items (/user/name/saved, /u/name/saved, /saved)
    if (
      /^\/(?:user|u)\/[^/]+\/saved(?:\/.*)?$/i.test(path) ||
      path === '/saved' ||
      path === '/saved/'
    ) {
      return PAGE_TYPE.SAVED;
    }

    // 5. User profile pages (/user/name, /u/name, overview, submitted, posts, comments, etc.)
    if (
      /^\/(?:user|u)\/[^/]+(?:\/(?:overview|submitted|posts|comments|history|hidden|upvoted|downvoted|gilded))?\/?$/i.test(
        path
      )
    ) {
      return PAGE_TYPE.PROFILE;
    }

    // 6. Submit and post creation editors
    if (/\/submit(?:\/.*)?$/i.test(path) || /^\/submit(?:\/.*)?$/i.test(path)) {
      return PAGE_TYPE.SUBMIT;
    }

    // 7. Activity & notifications hub
    if (/^\/notifications(?:\/.*)?$/i.test(path)) return PAGE_TYPE.NOTIFICATIONS;

    // 8. Inbox & messaging system
    if (/^\/message(?:\/.*)?$/i.test(path)) return PAGE_TYPE.MESSAGES;

    // 9. Account & preference settings
    if (/^\/settings(?:\/.*)?$/i.test(path)) return PAGE_TYPE.SETTINGS;

    // 10. Modmail & moderation center
    if (/^\/mod(?:\/.*)?$/i.test(path) || /^\/r\/[^/]+\/about\/mod/i.test(path)) {
      return PAGE_TYPE.MOD;
    }

    // 11. Communities directory & category explore hubs
    if (/^\/(?:communities|subreddits|topics|best\/communities|explore)(?:\/.*)?$/i.test(path)) {
      return PAGE_TYPE.COMMUNITIES;
    }

    // 12. Search results
    if (/(?:\/|^)search(?:\/|$)/i.test(path)) return PAGE_TYPE.SEARCH;

    // 13. Other standalone non-feed pages (vault, premium, policies)
    if (/^\/(?:vault|premium|gold|policies|coins|tokens)(?:\/.*)?$/i.test(path)) {
      return PAGE_TYPE.STANDALONE;
    }

    // 14. Community feeds (/r/name/...) and Custom Feeds (/user/name/m/...)
    if (
      /^\/r\/[^/]+(?:\/.*)?$/i.test(path) ||
      /^\/(?:user|u|me)\/[^/]+\/m\/[^/]+(?:\/.*)?$/i.test(path)
    ) {
      return PAGE_TYPE.FEED;
    }

    // 15. Home / Global feeds: /, /best, /hot, /new, /top, /rising, /r/popular, /r/all
    return PAGE_TYPE.FEED;
  }

  function applyRoutingLogic() {
    const pageType = detectPageType(location.href);
    const path = getPathname(location.href);

    // Manage Body Classes for SPA Routing CSS Targeting
    document.body.classList.remove(
      'rg-page-home',
      'rg-page-community',
      'rg-page-communities',
      'rg-page-profile',
      'rg-page-saved',
      'rg-page-post',
      'rg-page-search',
      'rg-page-wiki',
      'rg-page-about',
      'rg-page-submit',
      'rg-page-notifications',
      'rg-page-messages',
      'rg-page-settings',
      'rg-page-mod',
      'rg-page-standalone'
    );

    // Single-column & non-feed pages
    const isSingleColumnNonFeed = [
      PAGE_TYPE.POST_THREAD,
      PAGE_TYPE.WIKI,
      PAGE_TYPE.ABOUT,
      PAGE_TYPE.SUBMIT,
      PAGE_TYPE.NOTIFICATIONS,
      PAGE_TYPE.MESSAGES,
      PAGE_TYPE.SETTINGS,
      PAGE_TYPE.MOD,
      PAGE_TYPE.STANDALONE,
    ].includes(pageType);

    if (isSingleColumnNonFeed) {
      switch (pageType) {
        case PAGE_TYPE.POST_THREAD:
          document.body.classList.add('rg-page-post');
          break;
        case PAGE_TYPE.WIKI:
          document.body.classList.add('rg-page-wiki');
          break;
        case PAGE_TYPE.ABOUT:
          document.body.classList.add('rg-page-about');
          break;
        case PAGE_TYPE.SUBMIT:
          document.body.classList.add('rg-page-submit');
          break;
        case PAGE_TYPE.NOTIFICATIONS:
          document.body.classList.add('rg-page-notifications');
          break;
        case PAGE_TYPE.MESSAGES:
          document.body.classList.add('rg-page-messages');
          break;
        case PAGE_TYPE.SETTINGS:
          document.body.classList.add('rg-page-settings');
          break;
        case PAGE_TYPE.MOD:
          document.body.classList.add('rg-page-mod');
          break;
        default:
          document.body.classList.add('rg-page-standalone');
          break;
      }

      window.RedditPro.Settings.updateActive({ columns: '1' });
      halt();
    } else {
      // Multi-column feed pages
      if (pageType === PAGE_TYPE.SEARCH) {
        document.body.classList.add('rg-page-search');
      } else if (pageType === PAGE_TYPE.SAVED) {
        document.body.classList.add('rg-page-saved', 'rg-page-profile');
      } else if (pageType === PAGE_TYPE.PROFILE) {
        document.body.classList.add('rg-page-profile');
      } else if (pageType === PAGE_TYPE.COMMUNITIES) {
        document.body.classList.add('rg-page-communities');
      } else if (pageType === PAGE_TYPE.FEED) {
        if (
          path === '/' ||
          /^\/(?:best|hot|new|top|rising)\/?$/i.test(path) ||
          /^\/r\/(?:popular|all)\/?$/i.test(path)
        ) {
          document.body.classList.add('rg-page-home');
        } else {
          document.body.classList.add('rg-page-community');
        }
      }

      window.RedditPro.Settings.updateActive({});
      resume(true);
    }

    if (!isSingleColumnNonFeed) {
      setTimeout(() => window.RedditPro.Masonry?.sweepAll(), 80);
      setTimeout(() => window.RedditPro.Masonry?.sweepAll(), 300);
      setTimeout(() => window.RedditPro.Masonry?.sweepAll(), 700);
    }
  }

  function resume(forceRebind = false) {
    if (running) {
      if (forceRebind) {
        if (window.RedditPro.DOMObserver?.refresh) {
          window.RedditPro.DOMObserver.refresh();
        } else if (window.RedditPro.DOMObserver) {
          window.RedditPro.DOMObserver.start();
        }
        window.RedditPro.Masonry?.observeFeedContainer?.();
        window.RedditPro.Masonry?.sweepAll?.();
      }
      return;
    }
    running = true;
    if (window.RedditPro.DOMObserver) window.RedditPro.DOMObserver.start();
    window.RedditPro.Masonry?.observeFeedContainer?.();
    window.RedditPro.Masonry?.sweepAll?.();
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
    // When opening or closing the PostModal, preserve the current feed lifecycle state
    if (history.state?.redditProModal) return;

    const current = location.href;
    if (current === lastUrl) return;
    lastUrl = current;
    // @ts-ignore
    clearTimeout(navDebounce);
    navDebounce = window.setTimeout(() => applyRoutingLogic(), 200);
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
    history.pushState = function (...args) {
      _push(...args);
      setTimeout(onNavigate, 0);
    };
    history.replaceState = function (...args) {
      _replace(...args);
      setTimeout(onNavigate, 0);
    };
  }

  return {
    init,
    resume,
    halt,
    detectPageType,
    applyRoutingLogic,
    PAGE_TYPE,
  };
})();

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => window.RedditPro.Lifecycle.init());
  if (document.readyState === 'interactive' || document.readyState === 'complete') {
    window.RedditPro.Lifecycle.init();
  }
}
