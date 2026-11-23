/**
 * @file router.js
 * @description URL parsing, page classification, and route recognition for Reddit Pro.
 */
// @ts-nocheck
window.RedditPro = window.RedditPro || {};

window.RedditPro.Router = (function () {
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

  /**
   * Classifies a Reddit URL into a recognized PAGE_TYPE.
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
    if (/\/comments\/[a-z0-9]+(?:\/|$)/i.test(path)) return PAGE_TYPE.POST_THREAD;

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

  /**
   * Checks if a page type is a multi-column feed candidate.
   * @param {string} pageType
   * @returns {boolean}
   */
  function isFeedLike(pageType) {
    return [
      PAGE_TYPE.FEED,
      PAGE_TYPE.PROFILE,
      PAGE_TYPE.SAVED,
      PAGE_TYPE.SEARCH,
      PAGE_TYPE.COMMUNITIES,
    ].includes(pageType);
  }

  return { PAGE_TYPE, detectPageType, isFeedLike };
})();
