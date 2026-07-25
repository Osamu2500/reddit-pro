/**
 * @file css-vars.js
 * @description Injects and updates global CSS variables to control grid layouts.
 */

window.RedditPro = window.RedditPro || {};

window.RedditPro.CSSVars = (function() {
  /** @type {HTMLStyleElement | null} */
  let scrollbarStyleTag = null;

  /**
   * Initializes the CSS Variables controller.
   */
  function init() {
    window.RedditPro.Settings.subscribe(applySettingsToDOM);
  }

  /**
   * Applies settings to the document body via data attributes and CSS vars.
   * @param {import('./settings').RedditProSettings} settings
   */
  function applySettingsToDOM(settings) {
    const body = document.body;
    if (!body) {
      requestAnimationFrame(() => applySettingsToDOM(settings));
      return;
    }

    body.setAttribute('data-reddit-grid-cols', settings.columns);
    body.setAttribute('data-reddit-grid-autofit', String(settings.autoFit));
    body.setAttribute('data-reddit-grid-masonry', String(settings.masonry));
    body.setAttribute('data-reddit-grid-compact', String(settings.compactCards));
    body.setAttribute('data-reddit-grid-hide-promoted', String(settings.hidePromoted));
    body.setAttribute('data-reddit-grid-hide-sidebar', String(settings.hideSidebar));
    
    if (settings.theme === 'dark' || (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      body.classList.add('rg-theme-dark');
    } else {
      body.classList.remove('rg-theme-dark');
    }

    body.style.setProperty('--reddit-cols', settings.columns);
    body.style.setProperty('--reddit-col-gap', settings.masonry ? '8px' : '4px');
    body.style.setProperty('--reddit-batch-gap', settings.masonry ? '16px' : '8px');

    manageScrollbar(settings.hideScrollbar);
  }

  /**
   * Hides or shows the main window scrollbar.
   * @param {boolean} hide
   * @private
   */
  function manageScrollbar(hide) {
    if (hide) {
      if (!scrollbarStyleTag) {
        scrollbarStyleTag = document.createElement('style');
        scrollbarStyleTag.id = 'rg-scrollbar-styles';
        (document.head || document.documentElement).appendChild(scrollbarStyleTag);
        scrollbarStyleTag.textContent = `
          html, body { -ms-overflow-style: none !important; scrollbar-width: none !important; }
          html::-webkit-scrollbar, body::-webkit-scrollbar { display: none !important; }
        `;
      }
    } else if (scrollbarStyleTag) {
      scrollbarStyleTag.remove();
      scrollbarStyleTag = null;
    }
  }

  return { init };
})();
