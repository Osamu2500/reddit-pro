/**
 * @file audio-observer.js
 * @description Gives audio focus to the visible Reddit player nearest the viewport center.
 */
window.RedditPro = window.RedditPro || {};

window.RedditPro.AudioObserver = (function () {
  const visible = new Set();
  let debounceTimer = null;

  function getVideo(player) {
    return player.querySelector('video') || player.shadowRoot?.querySelector('video') || null;
  }

  function mutePlayer(player) {
    const video = getVideo(player);
    if (video) video.muted = true;
    if ('muted' in player) player.muted = true;
    player.setAttribute('muted', '');
  }

  function unmutePlayer(player) {
    const video = getVideo(player);
    if (video) {
      video.muted = false;
    }
    if ('muted' in player) player.muted = false;
    player.removeAttribute('muted');
  }

  function muteAll() {
    visible.forEach(mutePlayer);
  }

  function updateFocus() {
    const settings = window.RedditPro.Settings.get();

    for (const player of visible) {
      if (!player.isConnected) visible.delete(player);
    }

    if (
      !settings.autoPlayAudio ||
      visible.size === 0 ||
      /\/comments\/[a-z0-9]+\//i.test(location.pathname)
    ) {
      muteAll();
      return;
    }

    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    let best = null;
    let bestDistance = Infinity;

    visible.forEach((player) => {
      const rect = player.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const distance = Math.hypot(
        rect.left + rect.width / 2 - centerX,
        rect.top + rect.height / 2 - centerY
      );

      if (distance < bestDistance) {
        bestDistance = distance;
        best = player;
      }
    });

    visible.forEach((player) => {
      if (player === best) unmutePlayer(player);
      else mutePlayer(player);
    });
  }

  function scheduleUpdate() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => requestAnimationFrame(updateFocus), 80);
  }

  const observer =
    typeof IntersectionObserver === 'function'
      ? new IntersectionObserver(
          (entries) => {
            const settings = window.RedditPro.Settings.get();

            entries.forEach((entry) => {
              if (entry.isIntersecting && settings.autoPlayAudio) {
                visible.add(entry.target);
              } else {
                visible.delete(entry.target);
                mutePlayer(entry.target);
              }
            });

            scheduleUpdate();
          },
          { threshold: 0.1 }
        )
      : null;

  function observe(node) {
    if (observer && node?.tagName === 'SHREDDIT-PLAYER') {
      observer.observe(node);
    }
  }

  function observeIn(root) {
    if (!root?.querySelectorAll) return;
    if (root.matches?.('shreddit-player')) observe(root);
    root.querySelectorAll('shreddit-player').forEach(observe);
  }

  function disconnectAll() {
    if (observer) observer.disconnect();
    muteAll();
    visible.clear();
    clearTimeout(debounceTimer);
  }

  window.addEventListener('scroll', scheduleUpdate, { passive: true });
  window.addEventListener('resize', scheduleUpdate, { passive: true });

  if (window.RedditPro.Settings?.subscribe) {
    window.RedditPro.Settings.subscribe((settings) => {
      if (!settings.autoPlayAudio) muteAll();
      else scheduleUpdate();
    });
  }

  return { observe, observeIn, updateFocus, scheduleUpdate, muteAll, disconnectAll };
})();
