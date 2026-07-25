/**
 * @file error-boundary.js
 * @description Global error catcher to ensure the extension doesn't hard-crash the page.
 */

window.RedditPro = window.RedditPro || {};

window.RedditPro.ErrorBoundary = (function() {
  /**
   * Wraps a function in a try-catch block for safe execution.
   * @template T
   * @param {string} context - The name of the module/function for logging.
   * @param {(...args: any[]) => T} fn - The function to wrap.
   * @returns {(...args: any[]) => T | undefined}
   */
  function wrap(context, fn) {
    return function(...args) {
      try {
        return fn(...args);
      } catch (err) {
        console.error(`[Reddit Pro] Error in ${context}:`, err);
        // Telemetry could be added here
        return undefined;
      }
    };
  }

  return { wrap };
})();
