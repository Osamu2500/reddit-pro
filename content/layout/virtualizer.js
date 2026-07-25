/**
 * @file virtualizer.js
 * @description Advanced Memory Management via DOM Virtualization.
 * Saves memory and layout thrashing by virtually unmounting off-screen batches
 * without breaking Reddit's SPA event bindings.
 */

window.RedditPro = window.RedditPro || {};

window.RedditPro.Virtualizer = (function() {
  /** @type {IntersectionObserver | null} */
  let observer = null;
  /** @type {boolean} */
  let isEnabled = true;

  /**
   * Initializes the virtualizer observer.
   */
  function init() {
    window.RedditPro.Settings.subscribe(settings => {
      // Allow users to toggle this via a future setting, defaulting to true for now
      isEnabled = settings.enableVirtualization !== false; 
      if (!isEnabled && observer) {
        disconnect();
      } else if (isEnabled && !observer) {
        start();
      }
    });
  }

  function start() {
    // Root margin of 4000px means we keep about 2-3 screen heights of content rendered above and below.
    observer = new IntersectionObserver((entries) => {
      if (!isEnabled) return;
      for (const entry of entries) {
        const batch = /** @type {HTMLElement} */ (entry.target);
        if (entry.isIntersecting) {
          mountBatch(batch);
        } else {
          unmountBatch(batch);
        }
      }
    }, { rootMargin: '4000px 0px' });

    // Observe existing batches
    document.querySelectorAll('faceplate-batch, .feed-container > div').forEach(observeBatch);
  }

  /**
   * @param {Element} batch
   */
  function observeBatch(batch) {
    if (observer && batch && batch.tagName) {
      observer.observe(batch);
    }
  }

  /**
   * Unmounts the batch by hiding its children and freezing its height.
   * @param {HTMLElement} batch
   */
  function unmountBatch(batch) {
    if (batch.classList.contains('rg-virtualized')) return;
    
    // Freeze the height before hiding children so the scrollbar doesn't jump
    const rect = batch.getBoundingClientRect();
    if (rect.height < 50) return; // Ignore empty or tiny batches

    batch.style.setProperty('height', `${rect.height}px`, 'important');
    batch.style.setProperty('min-height', `${rect.height}px`, 'important');
    batch.classList.add('rg-virtualized');
  }

  /**
   * Mounts the batch by showing its children and unlocking its height.
   * @param {HTMLElement} batch
   */
  function mountBatch(batch) {
    if (!batch.classList.contains('rg-virtualized')) return;
    
    batch.classList.remove('rg-virtualized');
    batch.style.removeProperty('height');
    batch.style.removeProperty('min-height');
  }

  function disconnect() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    document.querySelectorAll('.rg-virtualized').forEach(b => mountBatch(/** @type {HTMLElement} */ (b)));
  }

  return { init, start, disconnect, observeBatch };
})();
