/**
 * @file smart-header.js
 * @description Automatically hides Reddit's top navigation bar when scrolling down,
 * and reveals it when scrolling up to maximize vertical screen space.
 */

window.RedditPro = window.RedditPro || {};

window.RedditPro.SmartHeader = (function() {
  let lastScrollTop = 0;
  let isHidden = false;
  let scrollTimeout = null;

  function init() {
    // Only apply if the user hasn't explicitly disabled the extension layout
    if (document.body.getAttribute('data-reddit-grid-cols') === '1') return;

    window.addEventListener('scroll', handleScroll, { passive: true });
    
    // Inject the CSS to handle the transitions
    injectStyles();
  }

  function handleScroll() {
    if (scrollTimeout) {
      cancelAnimationFrame(scrollTimeout);
    }

    scrollTimeout = requestAnimationFrame(() => {
      const currentScrollTop = window.scrollY || document.documentElement.scrollTop;
      
      // Don't trigger at the very top of the page
      if (currentScrollTop <= 60) {
        if (isHidden) showHeader();
        lastScrollTop = currentScrollTop <= 0 ? 0 : currentScrollTop;
        return;
      }

      // Scrolling DOWN
      if (currentScrollTop > lastScrollTop && !isHidden) {
        // Threshold to avoid micro-scroll jitter
        if (currentScrollTop - lastScrollTop > 10) {
          hideHeader();
        }
      } 
      // Scrolling UP
      else if (currentScrollTop < lastScrollTop && isHidden) {
        if (lastScrollTop - currentScrollTop > 20) {
          showHeader();
        }
      }

      lastScrollTop = currentScrollTop;
    });
  }

  function hideHeader() {
    isHidden = true;
    document.body.classList.add('rg-header-hidden');
  }

  function showHeader() {
    isHidden = false;
    document.body.classList.remove('rg-header-hidden');
  }

  function injectStyles() {
    let tag = document.getElementById('rg-smart-header-styles');
    if (!tag) {
      tag = document.createElement('style');
      tag.id = 'rg-smart-header-styles';
      (document.head || document.documentElement).appendChild(tag);
    }
    
    // Target both known reddit header variants
    tag.textContent = `
      reddit-header-large, 
      reddit-header-small, 
      #reddit-header,
      header {
        transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
        will-change: transform;
      }
      
      body.rg-header-hidden reddit-header-large, 
      body.rg-header-hidden reddit-header-small,
      body.rg-header-hidden #reddit-header,
      body.rg-header-hidden header {
        transform: translateY(-100%) !important;
      }
      
      /* Also shift our custom hover sidebar trigger zone up when header is hidden */
      body.rg-header-hidden[data-reddit-grid-hide-sidebar="true"]::before,
      body.rg-header-hidden[data-reddit-grid-hide-sidebar="true"] #left-sidebar-container {
        top: 0 !important;
        height: 100vh !important;
      }
    `;
  }

  return { init };
})();
