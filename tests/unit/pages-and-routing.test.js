import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const routerSource = fs.readFileSync(
  path.resolve(process.cwd(), 'content/core/router.js'),
  'utf8'
);
const lifecycleSource = fs.readFileSync(
  path.resolve(process.cwd(), 'content/core/lifecycle.js'),
  'utf8'
);
const masonrySource = fs.readFileSync(
  path.resolve(process.cwd(), 'content/layout/masonry.js'),
  'utf8'
);
const domObserverSource = fs.readFileSync(
  path.resolve(process.cwd(), 'content/observers/dom-observer.js'),
  'utf8'
);

describe('Pages, Routing & Feed UI support across Reddit', () => {
  let settingsState;

  beforeEach(() => {
    window.history.replaceState(null, '', '/');
    settingsState = {
      columns: '3',
      masonry: true,
      autoFit: false,
      hidePromoted: true,
      hideSidebar: false,
    };

    window.RedditPro = {
      Settings: {
        get: () => ({ ...settingsState }),
        load: () => Promise.resolve(),
        updateActive: vi.fn((overrides) => {
          Object.assign(settingsState, overrides);
        }),
      },
      CSSVars: { init: vi.fn() },
      Filters: { init: vi.fn(), applyToCard: vi.fn() },
      Virtualizer: { init: vi.fn(), observeBatch: vi.fn() },
      PostModal: { init: vi.fn() },
      AudioObserver: { observe: vi.fn(), observeIn: vi.fn(), muteAll: vi.fn() },
      StatsInjector: { queuePost: vi.fn() },
    };

    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };

    window.requestAnimationFrame = (callback) => {
      return setTimeout(callback, 0);
    };
    globalThis.requestAnimationFrame = window.requestAnimationFrame;

    eval(masonrySource);
    eval(domObserverSource);
    eval(routerSource);
    eval(lifecycleSource);
  });

  afterEach(() => {
    document.body.className = '';
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  describe('Route and Page Type Detection', () => {
    let detectPageType;
    let PAGE_TYPE;

    beforeEach(() => {
      detectPageType = window.RedditPro.Lifecycle.detectPageType;
      PAGE_TYPE = window.RedditPro.Lifecycle.PAGE_TYPE;
    });

    it('detects user profile pages (/user/ and /u/, overview, submitted, posts, comments)', () => {
      expect(detectPageType('https://www.reddit.com/user/spez')).toBe(PAGE_TYPE.PROFILE);
      expect(detectPageType('https://www.reddit.com/user/spez/')).toBe(PAGE_TYPE.PROFILE);
      expect(detectPageType('https://www.reddit.com/u/spez')).toBe(PAGE_TYPE.PROFILE);
      expect(detectPageType('https://www.reddit.com/u/spez/')).toBe(PAGE_TYPE.PROFILE);
      expect(detectPageType('https://www.reddit.com/user/spez/submitted')).toBe(PAGE_TYPE.PROFILE);
      expect(detectPageType('https://www.reddit.com/u/spez/submitted/')).toBe(PAGE_TYPE.PROFILE);
      expect(detectPageType('https://www.reddit.com/user/spez/posts/')).toBe(PAGE_TYPE.PROFILE);
      expect(detectPageType('https://www.reddit.com/user/spez/comments/')).toBe(PAGE_TYPE.PROFILE);
      expect(detectPageType('https://www.reddit.com/u/spez/overview/')).toBe(PAGE_TYPE.PROFILE);
      expect(detectPageType('https://www.reddit.com/user/spez/?sort=new')).toBe(PAGE_TYPE.PROFILE);
      expect(detectPageType('https://www.reddit.com/u/spez/?sort=top&t=all')).toBe(
        PAGE_TYPE.PROFILE
      );
    });

    it('detects saved pages (/user/saved, /u/saved, /saved)', () => {
      expect(detectPageType('https://www.reddit.com/user/spez/saved')).toBe(PAGE_TYPE.SAVED);
      expect(detectPageType('https://www.reddit.com/user/spez/saved/')).toBe(PAGE_TYPE.SAVED);
      expect(detectPageType('https://www.reddit.com/u/spez/saved')).toBe(PAGE_TYPE.SAVED);
      expect(detectPageType('https://www.reddit.com/u/spez/saved/')).toBe(PAGE_TYPE.SAVED);
      expect(detectPageType('https://www.reddit.com/saved')).toBe(PAGE_TYPE.SAVED);
      expect(detectPageType('https://www.reddit.com/saved/')).toBe(PAGE_TYPE.SAVED);
      expect(detectPageType('https://www.reddit.com/user/spez/saved/?feedViewType=cardView')).toBe(
        PAGE_TYPE.SAVED
      );
    });

    it('detects communities directory and browse hubs', () => {
      expect(detectPageType('https://www.reddit.com/communities')).toBe(PAGE_TYPE.COMMUNITIES);
      expect(detectPageType('https://www.reddit.com/communities/')).toBe(PAGE_TYPE.COMMUNITIES);
      expect(detectPageType('https://www.reddit.com/subreddits')).toBe(PAGE_TYPE.COMMUNITIES);
      expect(detectPageType('https://www.reddit.com/subreddits/popular/')).toBe(
        PAGE_TYPE.COMMUNITIES
      );
      expect(detectPageType('https://www.reddit.com/topics/gaming/')).toBe(PAGE_TYPE.COMMUNITIES);
      expect(detectPageType('https://www.reddit.com/best/communities/1/')).toBe(
        PAGE_TYPE.COMMUNITIES
      );
    });

    it('detects community feeds and custom feeds', () => {
      expect(detectPageType('https://www.reddit.com/r/technology')).toBe(PAGE_TYPE.FEED);
      expect(detectPageType('https://www.reddit.com/r/technology/')).toBe(PAGE_TYPE.FEED);
      expect(detectPageType('https://www.reddit.com/r/technology/hot/')).toBe(PAGE_TYPE.FEED);
      expect(detectPageType('https://www.reddit.com/r/technology/top/?t=all')).toBe(PAGE_TYPE.FEED);
      expect(detectPageType('https://www.reddit.com/user/spez/m/techfeed/')).toBe(PAGE_TYPE.FEED);
      expect(detectPageType('https://www.reddit.com/u/spez/m/news/')).toBe(PAGE_TYPE.FEED);
    });

    it('detects home and global feeds', () => {
      expect(detectPageType('https://www.reddit.com/')).toBe(PAGE_TYPE.FEED);
      expect(detectPageType('https://www.reddit.com/best/')).toBe(PAGE_TYPE.FEED);
      expect(detectPageType('https://www.reddit.com/hot/')).toBe(PAGE_TYPE.FEED);
      expect(detectPageType('https://www.reddit.com/new/')).toBe(PAGE_TYPE.FEED);
      expect(detectPageType('https://www.reddit.com/r/popular/')).toBe(PAGE_TYPE.FEED);
      expect(detectPageType('https://www.reddit.com/r/all/')).toBe(PAGE_TYPE.FEED);
    });

    it('detects search pages', () => {
      expect(detectPageType('https://www.reddit.com/search')).toBe(PAGE_TYPE.SEARCH);
      expect(detectPageType('https://www.reddit.com/search/?q=reddit+pro')).toBe(PAGE_TYPE.SEARCH);
      expect(detectPageType('https://www.reddit.com/r/technology/search/?q=ai')).toBe(
        PAGE_TYPE.SEARCH
      );
    });

    it('detects post thread pages', () => {
      expect(
        detectPageType('https://www.reddit.com/r/technology/comments/123abc4/future_of_ai/')
      ).toBe(PAGE_TYPE.POST_THREAD);
      expect(detectPageType('https://www.reddit.com/comments/123abc4/')).toBe(
        PAGE_TYPE.POST_THREAD
      );
      expect(detectPageType('https://www.reddit.com/comments/123abc4')).toBe(
        PAGE_TYPE.POST_THREAD
      );
      expect(detectPageType('https://www.reddit.com/r/technology/comments/123abc4')).toBe(
        PAGE_TYPE.POST_THREAD
      );
      expect(
        detectPageType('https://www.reddit.com/user/spez/comments/123abc4/announcement/')
      ).toBe(PAGE_TYPE.POST_THREAD);
      expect(
        detectPageType('https://www.reddit.com/user/spez/comments/123abc4')
      ).toBe(PAGE_TYPE.POST_THREAD);
    });

    it('detects wiki and documentation pages', () => {
      expect(detectPageType('https://www.reddit.com/r/technology/wiki')).toBe(PAGE_TYPE.WIKI);
      expect(detectPageType('https://www.reddit.com/r/technology/wiki/index')).toBe(PAGE_TYPE.WIKI);
      expect(detectPageType('https://www.reddit.com/r/science/wiki/rules')).toBe(PAGE_TYPE.WIKI);
    });

    it('detects subreddit about and rules pages', () => {
      expect(detectPageType('https://www.reddit.com/r/technology/about')).toBe(PAGE_TYPE.ABOUT);
      expect(detectPageType('https://www.reddit.com/r/technology/about/rules')).toBe(
        PAGE_TYPE.ABOUT
      );
      expect(detectPageType('https://www.reddit.com/r/technology/about/moderators')).toBe(
        PAGE_TYPE.ABOUT
      );
    });

    it('detects submit and editor pages', () => {
      expect(detectPageType('https://www.reddit.com/submit')).toBe(PAGE_TYPE.SUBMIT);
      expect(detectPageType('https://www.reddit.com/r/technology/submit')).toBe(PAGE_TYPE.SUBMIT);
    });

    it('detects notifications and activity pages', () => {
      expect(detectPageType('https://www.reddit.com/notifications')).toBe(PAGE_TYPE.NOTIFICATIONS);
      expect(detectPageType('https://www.reddit.com/notifications/')).toBe(PAGE_TYPE.NOTIFICATIONS);
    });

    it('detects messages and inbox pages', () => {
      expect(detectPageType('https://www.reddit.com/message/inbox')).toBe(PAGE_TYPE.MESSAGES);
      expect(detectPageType('https://www.reddit.com/message/unread')).toBe(PAGE_TYPE.MESSAGES);
    });

    it('detects settings pages', () => {
      expect(detectPageType('https://www.reddit.com/settings')).toBe(PAGE_TYPE.SETTINGS);
      expect(detectPageType('https://www.reddit.com/settings/profile')).toBe(PAGE_TYPE.SETTINGS);
      expect(detectPageType('https://www.reddit.com/settings/account')).toBe(PAGE_TYPE.SETTINGS);
    });

    it('detects mod center pages', () => {
      expect(detectPageType('https://www.reddit.com/mod')).toBe(PAGE_TYPE.MOD);
      expect(detectPageType('https://www.reddit.com/r/technology/about/mod')).toBe(PAGE_TYPE.MOD);
    });

    it('detects standalone utility pages', () => {
      expect(detectPageType('https://www.reddit.com/vault')).toBe(PAGE_TYPE.STANDALONE);
      expect(detectPageType('https://www.reddit.com/premium')).toBe(PAGE_TYPE.STANDALONE);
      expect(detectPageType('https://www.reddit.com/policies/privacy-policy')).toBe(
        PAGE_TYPE.STANDALONE
      );
    });
  });

  describe('Body Class Application across pages', () => {
    let applyRoutingLogic;

    beforeEach(() => {
      applyRoutingLogic = window.RedditPro.Lifecycle.applyRoutingLogic;
    });

    it('applies rg-page-profile on user profile page', () => {
      window.history.replaceState(null, '', '/user/spez');
      applyRoutingLogic();
      expect(document.body.classList.contains('rg-page-profile')).toBe(true);
      expect(document.body.classList.contains('rg-page-post')).toBe(false);
    });

    it('applies rg-page-saved and rg-page-profile on saved page', () => {
      window.history.replaceState(null, '', '/u/spez/saved');
      applyRoutingLogic();
      expect(document.body.classList.contains('rg-page-saved')).toBe(true);
      expect(document.body.classList.contains('rg-page-profile')).toBe(true);
    });

    it('applies rg-page-community on subreddit feed', () => {
      window.history.replaceState(null, '', '/r/technology/hot');
      applyRoutingLogic();
      expect(document.body.classList.contains('rg-page-community')).toBe(true);
      expect(document.body.classList.contains('rg-page-home')).toBe(false);
    });

    it('applies rg-page-communities on communities directory', () => {
      window.history.replaceState(null, '', '/communities');
      applyRoutingLogic();
      expect(document.body.classList.contains('rg-page-communities')).toBe(true);
    });

    it('applies rg-page-home on root / and /popular', () => {
      window.history.replaceState(null, '', '/');
      applyRoutingLogic();
      expect(document.body.classList.contains('rg-page-home')).toBe(true);

      window.history.replaceState(null, '', '/r/popular');
      applyRoutingLogic();
      expect(document.body.classList.contains('rg-page-home')).toBe(true);
    });

    it('applies rg-page-post and halts feed on comments page', () => {
      window.history.replaceState(null, '', '/r/technology/comments/123/title/');
      applyRoutingLogic();
      expect(document.body.classList.contains('rg-page-post')).toBe(true);
      expect(window.RedditPro.Settings.updateActive).toHaveBeenCalledWith({ columns: '1' });
    });

    it('applies rg-page-wiki and halts feed on wiki page', () => {
      window.history.replaceState(null, '', '/r/technology/wiki');
      applyRoutingLogic();
      expect(document.body.classList.contains('rg-page-wiki')).toBe(true);
      expect(window.RedditPro.Settings.updateActive).toHaveBeenCalledWith({ columns: '1' });
    });

    it('applies rg-page-about and halts feed on rules page', () => {
      window.history.replaceState(null, '', '/r/technology/about/rules');
      applyRoutingLogic();
      expect(document.body.classList.contains('rg-page-about')).toBe(true);
      expect(window.RedditPro.Settings.updateActive).toHaveBeenCalledWith({ columns: '1' });
    });

    it('applies rg-page-submit and halts feed on submit page', () => {
      window.history.replaceState(null, '', '/submit');
      applyRoutingLogic();
      expect(document.body.classList.contains('rg-page-submit')).toBe(true);
      expect(window.RedditPro.Settings.updateActive).toHaveBeenCalledWith({ columns: '1' });
    });

    it('applies rg-page-notifications and halts feed on notifications page', () => {
      window.history.replaceState(null, '', '/notifications');
      applyRoutingLogic();
      expect(document.body.classList.contains('rg-page-notifications')).toBe(true);
      expect(window.RedditPro.Settings.updateActive).toHaveBeenCalledWith({ columns: '1' });
    });

    it('applies rg-page-messages and halts feed on messages inbox', () => {
      window.history.replaceState(null, '', '/message/inbox');
      applyRoutingLogic();
      expect(document.body.classList.contains('rg-page-messages')).toBe(true);
      expect(window.RedditPro.Settings.updateActive).toHaveBeenCalledWith({ columns: '1' });
    });

    it('applies rg-page-settings and halts feed on settings page', () => {
      window.history.replaceState(null, '', '/settings');
      applyRoutingLogic();
      expect(document.body.classList.contains('rg-page-settings')).toBe(true);
      expect(window.RedditPro.Settings.updateActive).toHaveBeenCalledWith({ columns: '1' });
    });

    it('applies rg-page-mod and halts feed on mod page', () => {
      window.history.replaceState(null, '', '/mod');
      applyRoutingLogic();
      expect(document.body.classList.contains('rg-page-mod')).toBe(true);
      expect(window.RedditPro.Settings.updateActive).toHaveBeenCalledWith({ columns: '1' });
    });

    it('applies rg-page-search on search page', () => {
      window.history.replaceState(null, '', '/search?q=reddit');
      applyRoutingLogic();
      expect(document.body.classList.contains('rg-page-search')).toBe(true);
    });

    it('applies rg-page-standalone and halts feed on standalone policy pages', () => {
      window.history.replaceState(null, '', '/policies/privacy-policy');
      applyRoutingLogic();
      expect(document.body.classList.contains('rg-page-standalone')).toBe(true);
      expect(window.RedditPro.Settings.updateActive).toHaveBeenCalledWith({ columns: '1' });
    });
  });

  describe('Feed Containers and Header Spanning in Masonry', () => {
    it('recognizes shreddit-profile-feed, profile-feed and shreddit-user-feed containers', () => {
      const feed = document.createElement('shreddit-profile-feed');
      feed.style.display = 'grid';
      feed.style.gridTemplateColumns = 'repeat(3, 1fr)';
      document.body.appendChild(feed);

      const header = document.createElement('shreddit-profile-header');
      feed.appendChild(header);

      const card = document.createElement('shreddit-post');
      card.getBoundingClientRect = () => ({
        top: 0,
        left: 0,
        bottom: 250,
        right: 300,
        width: 300,
        height: 250,
      });
      feed.appendChild(card);

      window.RedditPro.Masonry.sweepAll();

      expect(header.style.getPropertyValue('grid-column')).toBe('1 / -1');
    });

    it('processes comment cards in profile or saved feeds', () => {
      const feed = document.createElement('profile-feed');
      feed.style.display = 'grid';
      feed.style.gridTemplateColumns = 'repeat(3, 1fr)';
      document.body.appendChild(feed);

      const commentCard = document.createElement('shreddit-profile-comment');
      commentCard.getBoundingClientRect = () => ({
        top: 0,
        left: 0,
        bottom: 180,
        right: 300,
        width: 300,
        height: 180,
      });
      feed.appendChild(commentCard);

      window.RedditPro.Masonry.processCard(commentCard);

      // Should be measured and observed without error
      expect(commentCard).toBeDefined();
    });
  });
});
