/**
 * @file theater-mode.js
 * @description Injects an "Expand" button into media elements. Clicking it expands
 * the media to fill the entire screen on a pitch-black background.
 */

window.RedditPro = window.RedditPro || {};

window.RedditPro.TheaterMode = (function() {
  let isTheaterModeActive = false;
  let activeElement = null;
  let placeholderElement = null;

  function init() {
    // Listen for escape key to close theater mode
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isTheaterModeActive) {
        closeTheaterMode();
      }
    });

    // Delegate clicks for the expand button
    document.addEventListener('click', (e) => {
      const expandBtn = e.target.closest('.rg-theater-expand-btn');
      if (expandBtn) {
        e.preventDefault();
        e.stopPropagation();
        
        // Find the media container (usually a relative wrapper inside the post)
        const mediaContainer = expandBtn.closest('shreddit-async-loader, shreddit-gallery, .gallery-carousel, img, video')?.parentElement;
        
        // As a fallback, try getting the closest preview container
        const fallbackContainer = expandBtn.closest('[slot="post-media-container"]');
        
        openTheaterMode(fallbackContainer || mediaContainer);
      }
      
      // Close if clicking the background overlay
      if (isTheaterModeActive && e.target.classList.contains('rg-theater-overlay')) {
        closeTheaterMode();
      }
    });
  }

  function openTheaterMode(element) {
    if (!element || isTheaterModeActive) return;

    // Create the full-screen overlay
    const overlay = document.createElement('div');
    overlay.className = 'rg-theater-overlay';
    
    // Create a close button
    const closeBtn = document.createElement('div');
    closeBtn.className = 'rg-theater-close-btn';
    closeBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    `;
    closeBtn.addEventListener('click', closeTheaterMode);
    overlay.appendChild(closeBtn);

    // Save the active element and create a placeholder to keep layout intact
    activeElement = element;
    placeholderElement = document.createElement('div');
    placeholderElement.className = 'rg-theater-placeholder';
    placeholderElement.style.width = activeElement.offsetWidth + 'px';
    placeholderElement.style.height = activeElement.offsetHeight + 'px';
    activeElement.parentNode.insertBefore(placeholderElement, activeElement);

    // Move the element into the overlay
    activeElement.classList.add('rg-in-theater');
    overlay.appendChild(activeElement);
    document.body.appendChild(overlay);

    // Freeze body scrolling
    document.body.classList.add('rg-theater-active');
    isTheaterModeActive = true;
  }

  function closeTheaterMode() {
    if (!isTheaterModeActive || !activeElement || !placeholderElement) return;

    // Restore the element
    activeElement.classList.remove('rg-in-theater');
    placeholderElement.parentNode.insertBefore(activeElement, placeholderElement);
    placeholderElement.remove();

    // Remove the overlay
    const overlay = document.querySelector('.rg-theater-overlay');
    if (overlay) overlay.remove();

    // Restore scrolling
    document.body.classList.remove('rg-theater-active');
    
    activeElement = null;
    placeholderElement = null;
    isTheaterModeActive = false;
  }

  /**
   * Called by the dom-observer to inject buttons into newly loaded posts.
   */
  function injectExpandButtons(post) {
    const mediaContainer = post.querySelector('[slot="post-media-container"]');
    if (!mediaContainer) return;

    // Only inject if we haven't already
    if (mediaContainer.querySelector('.rg-theater-expand-btn')) return;

    // Make sure the container is positioned so our absolute button works
    if (window.getComputedStyle(mediaContainer).position === 'static') {
      mediaContainer.style.position = 'relative';
    }

    const btn = document.createElement('div');
    btn.className = 'rg-theater-expand-btn';
    btn.title = 'Cinematic Theater Mode';
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="15 3 21 3 21 9"></polyline>
        <polyline points="9 21 3 21 3 15"></polyline>
        <line x1="21" y1="3" x2="14" y2="10"></line>
        <line x1="3" y1="21" x2="10" y2="14"></line>
      </svg>
    `;

    mediaContainer.appendChild(btn);
  }

  return { init, injectExpandButtons };
})();
