/**
 * @file post-modal.js
 * @description Opens Reddit post threads in a modal without losing feed scroll position.
 */
window.RedditPro = window.RedditPro || {};

window.RedditPro.PostModal = (function () {
  let modalContainer = null;
  let isModalOpen = false;
  let originalTitle = document.title;
  let originalUrl = location.href;
  let requestController = null;
  let requestId = 0;
  let clearTimer = null;

  function init() {
    if (document.getElementById('rg-post-modal')) return;
    createModalDOM();
    attachListeners();
  }

  function createModalDOM() {
    modalContainer = document.createElement('div');
    modalContainer.id = 'rg-post-modal';
    modalContainer.className = 'rg-modal-hidden';
    modalContainer.setAttribute('role', 'dialog');
    modalContainer.setAttribute('aria-modal', 'true');
    modalContainer.setAttribute('aria-label', 'Reddit post');

    modalContainer.innerHTML = `
      <div class="rg-modal-backdrop"></div>
      <div class="rg-modal-content">
        <button class="rg-modal-close" type="button" aria-label="Close post">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
        <div class="rg-modal-scroll-area">
          <div id="rg-modal-loader" role="status" aria-live="polite">
            <div class="rg-spinner"></div>
          </div>
          <div id="rg-modal-body"></div>
        </div>
      </div>
    `;

    document.body.appendChild(modalContainer);
    modalContainer.querySelector('.rg-modal-backdrop').addEventListener('click', closeModal);
    modalContainer.querySelector('.rg-modal-close').addEventListener('click', closeModal);
  }

  function attachListeners() {
    document.addEventListener('click', handlePostClick, true);
    window.addEventListener('popstate', handlePopState);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && isModalOpen) closeModal();
    });
  }

  function handlePostClick(event) {
    if (
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey
    ) return;

    const link = event.target.closest?.('a[href*="/comments/"]');
    if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;

    let targetUrl;
    try {
      targetUrl = new URL(link.href, location.href);
    } catch {
      return;
    }

    if (
      targetUrl.origin !== location.origin ||
      !/\/comments\/[a-z0-9]+\//i.test(targetUrl.pathname)
    ) return;

    event.preventDefault();
    event.stopPropagation();
    openModal(targetUrl.href);
  }

  function getModalElements() {
    return {
      body: modalContainer.querySelector('#rg-modal-body'),
      loader: modalContainer.querySelector('#rg-modal-loader'),
      close: modalContainer.querySelector('.rg-modal-close'),
    };
  }

  async function openModal(url) {
    if (isModalOpen || !modalContainer) return;

    isModalOpen = true;
    requestId += 1;
    const activeRequestId = requestId;
    requestController?.abort();
    requestController = new AbortController();

    clearTimeout(clearTimer);
    originalUrl = location.href;
    originalTitle = document.title;

    history.pushState(
      { ...(history.state || {}), redditProModal: true, redditProModalUrl: url },
      '',
      url
    );

    const { body, loader, close } = getModalElements();
    body.replaceChildren();
    loader.style.display = 'flex';
    modalContainer.classList.remove('rg-modal-hidden');
    document.body.classList.add('rg-modal-open');
    close.focus();

    try {
      const response = await fetch(url, {
        credentials: 'same-origin',
        signal: requestController.signal,
      });
      if (!response.ok) throw new Error(`Post request failed: HTTP ${response.status}`);

      const html = await response.text();
      if (!isModalOpen || activeRequestId !== requestId) return;

      const doc = new DOMParser().parseFromString(html, 'text/html');
      const post = doc.querySelector('shreddit-post');
      const comments =
        doc.querySelector('comment-tree') || doc.querySelector('shreddit-comment-tree');
      const main = doc.querySelector('main');
      const sources = post || comments ? [post, comments].filter(Boolean) : main ? [main] : [];

      if (sources.length === 0) throw new Error('Reddit post content was not found');

      const fragment = document.createDocumentFragment();
      sources.forEach((source) => {
        const clone = document.importNode(source, true);
        sanitizeClone(clone);
        fragment.appendChild(clone);
      });

      if (!isModalOpen || activeRequestId !== requestId) return;
      body.replaceChildren(fragment);
      if (doc.title) document.title = doc.title;
    } catch (error) {
      if (error.name === 'AbortError') return;
      if (!isModalOpen || activeRequestId !== requestId) return;
      console.error('RedditPro Modal Error:', error);
      body.textContent = 'Unable to load this post. Please try again.';
      body.classList.add('rg-error');
    } finally {
      if (isModalOpen && activeRequestId === requestId) loader.style.display = 'none';
    }
  }

  function sanitizeClone(root) {
    root.querySelectorAll('script, object, embed').forEach((element) => element.remove());

    const elements = [root, ...root.querySelectorAll('*')];
    elements.forEach((element) => {
      [...element.attributes].forEach((attribute) => {
        const name = attribute.name.toLowerCase();
        const value = attribute.value.trim();
        if (name.startsWith('on')) element.removeAttribute(attribute.name);
        if (
          ['href', 'src', 'xlink:href', 'formaction'].includes(name) &&
          /^javascript:/i.test(value)
        ) {
          element.removeAttribute(attribute.name);
        }
      });
    });
  }

  function hideModal() {
    isModalOpen = false;
    requestId += 1;
    requestController?.abort();
    requestController = null;
    modalContainer.classList.add('rg-modal-hidden');
    document.body.classList.remove('rg-modal-open');
    document.title = originalTitle;

    clearTimer = setTimeout(() => {
      if (!isModalOpen) getModalElements().body.replaceChildren();
    }, 300);
  }

  function closeModal() {
    if (!isModalOpen) return;
    const shouldGoBack = history.state?.redditProModal === true;
    hideModal();

    if (shouldGoBack) history.back();
    else history.replaceState(null, '', originalUrl);
  }

  function handlePopState() {
    if (isModalOpen) hideModal();
  }

  return { init };
})();
