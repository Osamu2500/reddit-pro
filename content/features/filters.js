/**
 * @file filters.js
 * @description Applies persistent keyword, flair, and media-type filters to Reddit posts.
 */
window.RedditPro = window.RedditPro || {};

window.RedditPro.Filters = (function () {
  const STORAGE_KEY = 'redditProFilters';
  const DEFAULT_FILTERS = {
    keywords: [],
    flairs: [],
    mediaType: 'all',
  };
  let activeFilters = { ...DEFAULT_FILTERS };

  function normalizeList(value) {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.map((item) => String(item).trim()).filter(Boolean))];
  }

  function normalizeFilters(filters = {}) {
    const mediaTypes = ['all', 'image', 'video', 'text'];
    return {
      keywords: normalizeList(filters.keywords),
      flairs: normalizeList(filters.flairs),
      mediaType: mediaTypes.includes(filters.mediaType) ? filters.mediaType : 'all',
    };
  }

  function init() {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get({ [STORAGE_KEY]: DEFAULT_FILTERS }, (result) => {
        if (chrome.runtime?.lastError) {
          console.warn('RedditPro: Could not load filters', chrome.runtime.lastError);
          return;
        }
        activeFilters = normalizeFilters(result[STORAGE_KEY]);
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
    document.querySelectorAll('.rg-filtered-out').forEach((gridItem) => {
      gridItem.classList.remove('rg-filtered-out');
      gridItem.style.removeProperty('display');
    });
  }

  function applyToAll() {
    document.querySelectorAll('shreddit-post, shreddit-ad-post, article, .Post').forEach(applyToCard);
    window.RedditPro.Masonry?.sweepAll();
  }

  function getCardText(card) {
    const title =
      card.getAttribute('post-title') ||
      card.querySelector('a[slot="title"], h1, h2, h3')?.textContent ||
      '';
    const flair = card.querySelector('shreddit-post-flair')?.textContent || '';
    return { title: title.trim(), flair: flair.trim() };
  }

  function applyToCard(card) {
    if (!card?.matches) return;

    const gridItem = card.closest('faceplate-tracker') || card;
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
