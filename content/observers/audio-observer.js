window.RedditPro = window.RedditPro || {};

window.RedditPro.AudioObserver = (function() {
  const visible = new Set();
  let debounceTimer = null;

  const observer = new IntersectionObserver((entries) => {
    const settings = window.RedditPro.Settings.get();
    if (!settings.autoPlayAudio) return;
    
    for (const entry of entries) {
      if (entry.isIntersecting) {
        visible.add(entry.target);
      } else {
        visible.delete(entry.target);
        mutePlayer(entry.target);
      }
    }
    scheduleUpdate();
  }, { threshold: 0.1 });

  function mutePlayer(player) {
    player.muted = true;
    player.setAttribute('muted', '');
    const v = player.querySelector('video') ||
              (player.shadowRoot && player.shadowRoot.querySelector('video'));
    if (v) v.muted = true;
  }

  function unmutePlayer(player) {
    player.muted = false;
    player.removeAttribute('muted');
    const v = player.querySelector('video') ||
              (player.shadowRoot && player.shadowRoot.querySelector('video'));
    if (v) { v.muted = false; v.volume = 1; }
  }

  function scheduleUpdate() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => requestAnimationFrame(updateFocus), 80);
  }

  function updateFocus() {
    const settings = window.RedditPro.Settings.get();
    if (visible.size === 0 || !settings.autoPlayAudio) return;
    if (/\/comments\/[a-z0-9]+\//.test(location.href)) return;

    // Calculate strict exact-center
    const cy = window.innerHeight / 2;
    const cx = window.innerWidth / 2;
    let best = null, minDist = Infinity;

    visible.forEach(player => {
      const r = player.getBoundingClientRect();
      const dist = Math.hypot(r.top + r.height / 2 - cy, r.left + r.width / 2 - cx);
      if (dist < minDist) { minDist = dist; best = player; }
    });

    visible.forEach(player => (player === best ? unmutePlayer(player) : mutePlayer(player)));
  }

  function muteAll() { visible.forEach(mutePlayer); }

  function observe(node) {
    if (node && node.tagName) observer.observe(node);
  }

  function observeIn(root) {
    root.querySelectorAll('shreddit-player').forEach(observe);
  }

  // Hook into scroll to keep audio centered
  window.addEventListener('scroll', scheduleUpdate, { passive: true });

  return { observe, observeIn, updateFocus, scheduleUpdate, muteAll };
})();
