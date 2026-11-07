/**
 * @file stats-injector.js
 * @description Fetches Reddit post metrics in batches and injects them into post cards.
 */
window.RedditPro = window.RedditPro || {};

window.RedditPro.StatsInjector = (function () {
  /** @type {Map<string, Set<Element>>} */
  const pendingPosts = new Map();
  /** @type {Map<string, number>} */
  const retryCounts = new Map();
  /** @type {WeakMap<Element, { observer: MutationObserver, timeout: number }>} */
  const pendingInjection = new WeakMap();
  /** @type {number | null} */
  let fetchTimeout = null;
  let isFlushing = false;
  const FETCH_DELAY_MS = 250;
  const MAX_RETRIES = 2;
  const MAX_BATCH_SIZE = 100;
  const CREDIT_BAR_WAIT_MS = 8000;
  const injectedPosts = new WeakSet();

  function init() {
    // Posts are queued lazily by DOMObserver.
  }

  /** @param {Element} postNode */
  function queuePost(postNode) {
    if (!postNode || injectedPosts.has(postNode)) return;

    const id = postNode.getAttribute('id');
    if (!id || !/^t3_[a-z0-9]+(?:-|$)/i.test(id)) return;

    const baseId = id.split('-')[0];
    if (!pendingPosts.has(baseId)) pendingPosts.set(baseId, new Set());
    pendingPosts.get(baseId)?.add(postNode);

    if (fetchTimeout) clearTimeout(fetchTimeout);
    fetchTimeout = setTimeout(flushQueue, FETCH_DELAY_MS);
  }

  async function flushQueue() {
    if (isFlushing) {
      fetchTimeout = null;
      return;
    }
    if (pendingPosts.size === 0) {
      fetchTimeout = null;
      return;
    }

    isFlushing = true;
    fetchTimeout = null;
    const entries = Array.from(pendingPosts.entries());
    pendingPosts.clear();

    try {
      for (let offset = 0; offset < entries.length; offset += MAX_BATCH_SIZE) {
        await fetchBatch(entries.slice(offset, offset + MAX_BATCH_SIZE));
      }
    } finally {
      isFlushing = false;
      if (pendingPosts.size > 0 && !fetchTimeout) {
        fetchTimeout = setTimeout(flushQueue, FETCH_DELAY_MS);
      }
    }
  }

  /** @param {[string, Set<Element>][]} batch */
  async function fetchBatch(batch) {
    const idsQuery = batch.map(([id]) => id).join(',');

    try {
      const response = await fetch(
        `https://www.reddit.com/api/info.json?id=${encodeURIComponent(idsQuery)}`
      );
      if (!response.ok) {
        throw new Error(`Reddit API returned HTTP ${response.status}`);
      }

      const json = await response.json();
      const children = json?.data?.children;
      if (!Array.isArray(children)) {
        throw new Error('Reddit API returned an invalid response');
      }

      const statsMap = new Map();
      children.forEach((child) => {
        if (child?.kind === 't3' && child.data?.name) {
          statsMap.set(child.data.name, child.data);
        }
      });

      batch.forEach(([id, nodes]) => {
        const data = statsMap.get(id);
        if (!data) return;
        nodes.forEach((node) => injectStats(node, data));
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
        nodes.forEach((node) => {
          if (!node.isConnected || injectedPosts.has(node)) return;
          if (!pendingPosts.has(id)) pendingPosts.set(id, new Set());
          pendingPosts.get(id)?.add(node);
        });
      });
    }
  }

  /** @param {Element} postNode @param {any} data */
  function injectStats(postNode, data) {
    if (!postNode?.isConnected || injectedPosts.has(postNode)) return;

    const creditBar = postNode.querySelector('[slot="credit-bar"]');
    if (!creditBar) {
      waitForCreditBar(postNode, data);
      return;
    }

    renderStats(postNode, creditBar, data);
  }

  /** @param {Element} postNode @param {any} data */
  function waitForCreditBar(postNode, data) {
    if (pendingInjection.has(postNode)) return;

    const observer = new MutationObserver(() => {
      if (!postNode.isConnected) {
        stopWaiting(postNode);
        return;
      }

      const creditBar = postNode.querySelector('[slot="credit-bar"]');
      if (creditBar) {
        stopWaiting(postNode);
        renderStats(postNode, creditBar, data);
      }
    });

    const timeout = setTimeout(() => stopWaiting(postNode), CREDIT_BAR_WAIT_MS);
    pendingInjection.set(postNode, { observer, timeout });
    observer.observe(postNode, { childList: true, subtree: true });
  }

  /** @param {Element} postNode */
  function stopWaiting(postNode) {
    const pending = pendingInjection.get(postNode);
    if (!pending) return;
    pending.observer.disconnect();
    clearTimeout(pending.timeout);
    pendingInjection.delete(postNode);
  }

  /** @param {Element} postNode @param {Element} creditBar @param {any} data */
  function renderStats(postNode, creditBar, data) {
    if (!postNode.isConnected || injectedPosts.has(postNode)) return;

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
