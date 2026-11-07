/**
 * @file virtualizer.js
 * @description Deprecated in favor of native CSS content-visibility: auto in V4.
 */

window.RedditPro = window.RedditPro || {};

window.RedditPro.Virtualizer = (function() {
  function init() {}
  function start() {}
  function disconnect() {}
  /** @param {Element} _batch */
  function observeBatch(_batch) {}

  return { init, start, disconnect, observeBatch };
})();
