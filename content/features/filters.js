window.RedditPro = window.RedditPro || {};

window.RedditPro.Filters = (function() {
  // Advanced filtering logic
  let activeFilters = {
    keywords: [],
    flairs: [],
    mediaType: 'all' // 'all', 'image', 'video', 'text'
  };

  function init() {
    // In a real scenario, this would load from a more advanced settings store
    // For now, we stub the API so the popup can interact with it.
  }

  function setFilters(filters) {
    activeFilters = { ...activeFilters, ...filters };
    applyToAll();
  }

  function applyToAll() {
    document.querySelectorAll('shreddit-post, article').forEach(applyToCard);
    window.RedditPro.Masonry.sweepAll(); // Reprocess layout after hiding cards
  }

  function applyToCard(card) {
    const settings = window.RedditPro.Settings.get();
    if (!settings.enableFilters) return;

    let shouldHide = false;
    
    // Extract metadata
    const title = card.getAttribute('post-title') || '';
    const flair = card.querySelector('shreddit-post-flair') ? card.querySelector('shreddit-post-flair').innerText : '';
    const isVideo = !!card.querySelector('shreddit-player, video');
    const isImage = !!card.querySelector('img[alt="Post image"]');
    
    // Keyword matching
    if (activeFilters.keywords.length > 0) {
      const lowerTitle = title.toLowerCase();
      if (activeFilters.keywords.some(k => lowerTitle.includes(k.toLowerCase()))) {
        shouldHide = true;
      }
    }

    // Flair matching
    if (activeFilters.flairs.length > 0 && flair) {
      if (activeFilters.flairs.some(f => flair.toLowerCase().includes(f.toLowerCase()))) {
        shouldHide = true;
      }
    }

    // Media type matching
    if (activeFilters.mediaType !== 'all') {
      if (activeFilters.mediaType === 'video' && !isVideo) shouldHide = true;
      if (activeFilters.mediaType === 'image' && !isImage) shouldHide = true;
      if (activeFilters.mediaType === 'text' && (isVideo || isImage)) shouldHide = true;
    }

    if (shouldHide) {
      card.classList.add('rg-filtered-out');
    } else {
      card.classList.remove('rg-filtered-out');
    }
  }

  return { init, setFilters, applyToCard, applyToAll };
})();
