/**
 * @file post-modal.js
 * @description Intercepts clicks on posts and opens them in a beautiful glassmorphic modal
 * to preserve the user's scroll position in the infinite masonry feed.
 */

window.RedditPro = window.RedditPro || {};

window.RedditPro.PostModal = (function() {
  let modalContainer = null;
  let isModalOpen = false;
  let originalTitle = document.title;
  let originalUrl = location.href;

  function init() {
    createModalDOM();
    attachListeners();
  }

  function createModalDOM() {
    modalContainer = document.createElement('div');
    modalContainer.id = 'rg-post-modal';
    modalContainer.className = 'rg-modal-hidden';
    
    modalContainer.innerHTML = `
      <div class="rg-modal-backdrop"></div>
      <div class="rg-modal-content">
        <button class="rg-modal-close" aria-label="Close">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
        <div class="rg-modal-scroll-area">
          <div id="rg-modal-loader">
            <div class="rg-spinner"></div>
          </div>
          <div id="rg-modal-body"></div>
        </div>
      </div>
    `;

    document.body.appendChild(modalContainer);

    // Close on backdrop click
    modalContainer.querySelector('.rg-modal-backdrop').addEventListener('click', closeModal);
    // Close on X button click
    modalContainer.querySelector('.rg-modal-close').addEventListener('click', closeModal);
  }

  function attachListeners() {
    // We use capturing phase to intercept before Reddit's SPA router
    document.addEventListener('click', handlePostClick, true);
    
    // Listen for back button to close modal instead of navigating away
    window.addEventListener('popstate', handlePopState);
    
    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isModalOpen) {
        closeModal();
      }
    });
  }

  function handlePostClick(e) {
    // Only intercept left clicks without modifier keys
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) return;

    // Find if the click is on a post link (title, comments button, or the post itself)
    const link = e.target.closest('a[href*="/comments/"]');
    if (!link) return;

    // Make sure it's a link to a post in the current subreddit or feed
    const href = link.getAttribute('href');
    if (!href || href.startsWith('http') && !href.includes(location.host)) return;

    e.preventDefault();
    e.stopPropagation(); // Stop Reddit's router
    
    openModal(href);
  }

  async function openModal(url) {
    if (isModalOpen) return;
    isModalOpen = true;

    // Save current state
    originalUrl = location.href;
    originalTitle = document.title;

    // Update URL without reloading (so sharing/copying URL works)
    history.pushState({ redditProModal: true }, '', url);

    // Show modal and loader
    modalContainer.classList.remove('rg-modal-hidden');
    document.body.classList.add('rg-modal-open');
    
    const bodyContainer = document.getElementById('rg-modal-body');
    const loader = document.getElementById('rg-modal-loader');
    
    bodyContainer.innerHTML = '';
    loader.style.display = 'flex';

    try {
      // Fetch the page HTML
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch post');
      const html = await res.text();

      // Parse the HTML
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      // Update document title to the post's title
      if (doc.title) {
        document.title = doc.title;
      }

      // Extract the main content (usually inside <main> or a specific faceplate layout)
      // Reddit's post page has a specific structure. We need the <shreddit-post> and the comment tree.
      const postContent = doc.querySelector('shreddit-post');
      const commentTree = doc.querySelector('comment-tree') || doc.querySelector('shreddit-comment-tree');
      
      // If we can't find the web components, fallback to main
      let contentToInject = '';
      if (postContent) {
        contentToInject += postContent.outerHTML;
      }
      if (commentTree) {
        contentToInject += commentTree.outerHTML;
      }
      
      if (!contentToInject) {
        const main = doc.querySelector('main');
        if (main) contentToInject = main.innerHTML;
      }

      loader.style.display = 'none';
      
      if (contentToInject) {
        bodyContainer.innerHTML = contentToInject;
        
        // Execute any scripts that might have been injected (Reddit uses faceplate initialization)
        // Note: For web components like <shreddit-post>, the browser usually initializes them automatically
        // if the custom elements are already registered on the page.
      } else {
        bodyContainer.innerHTML = '<div class="rg-error">Could not parse post content.</div>';
      }
      
    } catch (err) {
      console.error('RedditPro Modal Error:', err);
      loader.style.display = 'none';
      bodyContainer.innerHTML = '<div class="rg-error">Failed to load post. Check your connection.</div>';
    }
  }

  function closeModal() {
    if (!isModalOpen) return;
    isModalOpen = false;

    // Restore URL
    if (history.state && history.state.redditProModal) {
      history.back(); // This triggers popstate, which we handle, but we need to ensure we don't close twice
    } else {
      history.replaceState(null, '', originalUrl);
    }
    
    document.title = originalTitle;

    modalContainer.classList.add('rg-modal-hidden');
    document.body.classList.remove('rg-modal-open');
    
    // Clear content to free memory and stop background videos
    setTimeout(() => {
      document.getElementById('rg-modal-body').innerHTML = '';
    }, 300); // Wait for fade out animation
  }

  function handlePopState(e) {
    if (isModalOpen) {
      // User pressed back button while modal was open
      isModalOpen = false;
      modalContainer.classList.add('rg-modal-hidden');
      document.body.classList.remove('rg-modal-open');
      document.title = originalTitle;
      
      setTimeout(() => {
        document.getElementById('rg-modal-body').innerHTML = '';
      }, 300);
    }
  }

  return { init };
})();
