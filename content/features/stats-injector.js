/**
 * @file stats-injector.js
 * @description Extracts post IDs, batches them to the Reddit API, and injects
 * hidden metrics like exact score and upvote ratio directly into the post UI.
 */

window.RedditPro = window.RedditPro || {};

window.RedditPro.StatsInjector = (function() {
  // One API ID can correspond to more than one rendered node during SPA updates.
  const pendingPosts = new Map();
  const retryCounts = new Map();
  let fetchTimeout = null;
  let isFlushing = false;
  const FETCH_DELAY_MS = 250;
  const MAX_RETRIES = 2;
  const MAX_BATCH_SIZE = 100;
  const injectedPosts = new WeakSet();

  function init() {
    // Initialization is intentionally lazy; posts are queued by DOMObserver.
  }

  /**
   * Called by dom-observer when a new post is added to the DOM.
   * @param {Element} postNode
   */
  function queuePost(postNode) {
    if (!postNode || injectedPosts.has(postNode)) return;

    const id = postNode.getAttribute('id');
    if (!id || !/^t3_[a-z0-9]+(?:-|$)/i.test(id)) return;

    const baseId = id.split('-')[0];
    if (!pendingPosts.has(baseId)) pendingPosts.set(baseId, new Set());
    pendingPosts.get(baseId).add(postNode);

    if (fetchTimeout) clearTimeout(fetchTimeout);
    fetchTimeout = setTimeout(flushQueue, FETCH_DELAY_MS);
  }

  async function flushQueue() {
    if (isFlushing || pendingPosts.size === 0) return;

    isFlushing = true;
    fetchTimeout = null;
    const entries = Array.from(pendingPosts.entries());
    pendingPosts.clear();

    try {
      for (let offset = 0; offset < entries.length; offset += MAX_BATCH_SIZE) {
        const batch = entries.slice(offset, offset + MAX_BATCH_SIZE);
        await fetchBatch(batch);
      }
    } finally {
      isFlushing = false;
      if (pendingPosts.size > 0 && !fetchTimeout) {
        fetchTimeout = setTimeout(flushQueue, FETCH_DELAY_MS);
      }
    }
  }

  async function fetchBatch(batch) {
    const ids = batch.map(([id]) => id);
    const idsQuery = ids.join(',');

    try {
      const response = await fetch(
        `https://www.reddit.com/api/info.json?id=${encodeURIComponent(idsQuery)}`
      );
      if (!response.ok) throw new Error(`Reddit API returned HTTP ${response.status}`);

      const json = await response.json();
      const children = json?.data?.children;
      if (!Array.isArray(children)) throw new Error('Reddit API returned an invalid response');

      const statsMap = new Map();
      children.forEach(child => {
        if (child?.kind === 't3' && child.data?.name) {
          statsMap.set(child.data.name, child.data);
        }
      });

      batch.forEach(([id, nodes]) => {
        const data = statsMap.get(id);
        if (!data) return;
        nodes.forEach(node => injectStats(node, data));
        retryCounts.delete(id);
      });
    } catch (error) {
      console.warn('RedditPro: Failed to fetch post stats', error);
      batch.forEach(([id, nodes]) => {
        const attempts = retryCounts.get(id) || 0;
        if (attempts >= MAX_RETRIES) {
          retryCounts.delete(id);
          return;
        }

        retryCounts.set(id, attempts + 1);
        nodes.forEach(node => {
          if (node.isConnected && !injectedPosts.has(node)) {
            if (!pendingPosts.has(id)) pendingPosts.set(id, new Set());
            pendingPosts.get(id).add(node);
          }
        });
      });
    }
  }

  /**
   * @param {Element} postNode
   * @param {Object} data
   */
  function injectStats(postNode, data) {
    if (!postNode?.isConnected || injectedPosts.has(postNode)) return;

    // Do not mark the node complete until its destination exists; Reddit can
    // attach the credit bar after the post element itself has been discovered.
    const creditBar = postNode.querySelector('[slot="credit-bar"]');
    if (!creditBar) return;

    const statsContainer = document.createElement('div');
    statsContainer.className = 'rg-pro-stats';

    const ratio = Number(data.upvote_ratio);
    if (Number.isFinite(ratio)) {
      const ratioElement = document.createElement('span');
      ratioElement.className = 'rg-stat-ratio';
      ratioElement.title = `Upvote Ratio (${Number(data.score) || 0} pts)`;
      ratioElement.textContent = `👍 ${Math.round(ratio * 100)}%`;
      statsContainer.appendChild(ratioElement);
    }

    if (data.is_original_content) {
      const originalElement = document.createElement('span');
      originalElement.className = 'rg-stat-oc';
      originalElement.title = 'Original Content';
      originalElement.textContent = 'OC';
      statsContainer.appendChild(originalElement);
    }

    if (statsContainer.childElementCount === 0) return;
    creditBar.appendChild(statsContainer);
    injectedPosts.add(postNode);
  }

  return { init, queuePost };
})();
