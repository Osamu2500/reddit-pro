/**
 * @file stats-injector.js
 * @description Extracts post IDs, batches them to the Reddit API, and injects
 * hidden metrics like exact score and upvote ratio directly into the post UI.
 */

window.RedditPro = window.RedditPro || {};

window.RedditPro.StatsInjector = (function() {
  let pendingIds = new Set();
  let fetchTimeout = null;
  const FETCH_DELAY_MS = 250; // Batch requests every 250ms
  const injectedPosts = new WeakSet();

  function init() {
    // Initialization if needed
  }

  /**
   * Called by dom-observer when a new post is added to the DOM.
   * @param {Element} postNode 
   */
  function queuePost(postNode) {
    if (injectedPosts.has(postNode)) return;
    
    // shreddit-post IDs are usually in the format "t3_xxxxx"
    const id = postNode.getAttribute('id');
    if (!id || !id.startsWith('t3_')) return;

    // Some IDs have suffixes like "t3_xxxxx-aspect-ratio" in our earlier mods,
    // we need the raw base ID
    const baseId = id.split('-')[0];
    
    pendingIds.add({ baseId, node: postNode });

    if (fetchTimeout) clearTimeout(fetchTimeout);
    fetchTimeout = setTimeout(flushQueue, FETCH_DELAY_MS);
  }

  async function flushQueue() {
    if (pendingIds.size === 0) return;

    const itemsToFetch = Array.from(pendingIds);
    pendingIds.clear();

    const idsQuery = itemsToFetch.map(item => item.baseId).join(',');
    
    try {
      const response = await fetch(`https://www.reddit.com/api/info.json?id=${idsQuery}`);
      if (!response.ok) return;
      const json = await response.json();

      if (!json || !json.data || !json.data.children) return;

      const statsMap = new Map();
      json.data.children.forEach(child => {
        if (child.kind === 't3' && child.data) {
          statsMap.set(child.data.name, child.data);
        }
      });

      itemsToFetch.forEach(item => {
        const data = statsMap.get(item.baseId);
        if (data) {
          injectStats(item.node, data);
        }
      });
    } catch (e) {
      console.warn('RedditPro: Failed to fetch post stats', e);
    }
  }

  /**
   * @param {Element} postNode 
   * @param {Object} data 
   */
  function injectStats(postNode, data) {
    if (injectedPosts.has(postNode)) return;
    injectedPosts.add(postNode);

    const upvoteRatio = Math.round(data.upvote_ratio * 100);
    const score = data.score;
    const isOC = data.is_original_content;

    // We'll inject this into the credit-bar slot
    const creditBar = postNode.querySelector('[slot="credit-bar"]');
    if (!creditBar) return;

    const statsContainer = document.createElement('div');
    statsContainer.className = 'rg-pro-stats';
    
    let html = `<span class="rg-stat-ratio" title="Upvote Ratio">👍 ${upvoteRatio}%</span>`;
    
    if (isOC) {
      html += `<span class="rg-stat-oc" title="Original Content">OC</span>`;
    }

    statsContainer.innerHTML = html;
    creditBar.appendChild(statsContainer);
  }

  return { init, queuePost };
})();
