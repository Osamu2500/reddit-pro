/**
 * @file filters.js
 * @description Applies persistent keyword, flair, and media-type filters to Reddit posts.
 */
window.RedditPro = window.RedditPro || {};

/** @typedef {'all' | 'image' | 'video' | 'text'} FilterMediaType */
/** @typedef {{ keywords: string[], flairs: string[], mediaType: FilterMediaType }} FilterState */

window.RedditPro.Filters = (function () {
  const STORAGE_KEY = 'redditProFilters';
  /** @type {FilterState} */
  const DEFAULT_FILTERS = { keywords: [], flairs: [], mediaType: 'all' };
  /** @type {FilterState} */
  let activeFilters = { ...DEFAULT_FILTERS };

  /** @param {unknown} value */
  function normalizeList(value) {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.map((item) => String(item).trim()).filter(Boolean))];
  }

  /** @param {Partial<FilterState>} [filters] */
  function normalizeFilters(filters = {}) {
    const mediaTypes = ['all', 'image', 'video', 'text'];
    const mediaType = mediaTypes.includes(filters.mediaType) ? filters.mediaType : 'all';
    return {
      keywords: normalizeList(filters.keywords),
      flairs: normalizeList(filters.flairs),
      mediaType: /** @type {FilterMediaType} */ (mediaType),
    };
  }

  function init() {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get({ [STORAGE_KEY]: DEFAULT_FILTERS }, (result) => {
        if (chrome.runtime?.lastError) {
          console.warn('RedditPro: Could not load filters', chrome.runtime.lastError);
          return;
        }
        activeFilters = normalizeFilters(
          /** @type {Partial<FilterState>} */ (result[STORAGE_KEY])
        );
        applyToAll();
      });
    }

    window.RedditPro.Settings.subscribe((settings) => {
      if (!settings.enableFilters) restoreFilteredCards();
      else applyToAll();
    });
  }

  function getFilters() {
    return {
      keywords: [...activeFilters.keywords],
      flairs: [...activeFilters.flairs],
      mediaType: activeFilters.mediaType,
    };
  }

  /** @param {Partial<FilterState>} filters */
  function setFilters(filters) {
    activeFilters = normalizeFilters({ ...activeFilters, ...filters });

    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.set({ [STORAGE_KEY]: activeFilters }, () => {
        if (chrome.runtime?.lastError) {
          console.warn('RedditPro: Could not save filters', chrome.runtime.lastError);
        }
      });
    }

    applyToAll();
  }

  function restoreFilteredCards() {
    document.querySelectorAll('.rg-filtered-out').forEach((element) => {
      const gridItem = /** @type {HTMLElement} */ (element);
      gridItem.classList.remove('rg-filtered-out');
      gridItem.style.removeProperty('display');
    });
  }

  function applyToAll() {
    document.querySelectorAll('shreddit-post, shreddit-ad-post, article, .Post').forEach((card) => {
      applyToCard(card);
    });
    window.RedditPro.Masonry?.sweepAll();
  }

  /** @param {Element} card */
  function getCardText(card) {
    const title =
      card.getAttribute('post-title') ||
      card.querySelector('a[slot="title"], h1, h2, h3')?.textContent ||
      '';
    const flair = card.querySelector('shreddit-post-flair')?.textContent || '';
    return { title: title.trim(), flair: flair.trim() };
  }

  /** @param {Element} card */
  function applyToCard(card) {
    const gridItem = /** @type {HTMLElement} */ (card.closest('faceplate-tracker') || card);
    const settings = window.RedditPro.Settings.get();

    if (!settings.enableFilters) {
      if (gridItem.classList.contains('rg-filtered-out')) {
        gridItem.classList.remove('rg-filtered-out');
        gridItem.style.removeProperty('display');
      }
      return;
    }

    const { title, flair } = getCardText(card);
    const titleLower = title.toLowerCase();
    const flairLower = flair.toLowerCase();
    const hasVideo = !!card.querySelector('shreddit-player, video');
    const hasImage = !!card.querySelector(
      'shreddit-media-lightbox, shreddit-image, [slot="post-media-container"] img, img[alt="Post image"]'
    );

    const keywordMatch = activeFilters.keywords.some((keyword) =>
      titleLower.includes(keyword.toLowerCase())
    );
    const flairMatch = activeFilters.flairs.some((value) =>
      flairLower.includes(value.toLowerCase())
    );
    const mediaMatch =
      activeFilters.mediaType === 'all' ||
      (activeFilters.mediaType === 'video' && hasVideo) ||
      (activeFilters.mediaType === 'image' && hasImage && !hasVideo) ||
      (activeFilters.mediaType === 'text' && !hasImage && !hasVideo);

    const shouldHide = keywordMatch || flairMatch || !mediaMatch;

    if (shouldHide) {
      gridItem.classList.add('rg-filtered-out');
      gridItem.style.setProperty('display', 'none', 'important');
    } else if (gridItem.classList.contains('rg-filtered-out')) {
      gridItem.classList.remove('rg-filtered-out');
      gridItem.style.removeProperty('display');
    }
  }

  return { init, getFilters, setFilters, applyToCard, applyToAll };
})();
