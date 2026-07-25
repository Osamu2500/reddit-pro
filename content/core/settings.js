/**
 * @file settings.js
 * @description Core settings manager for Reddit Pro.
 * Handles loading, saving, and broadcasting settings changes.
 */

window.RedditPro = window.RedditPro || {};

/**
 * @typedef {Object} RedditProSettings
 * @property {string} columns
 * @property {boolean} autoFit
 * @property {boolean} masonry
 * @property {boolean} compactCards
 * @property {boolean} hidePromoted
 * @property {boolean} hideSidebar
 * @property {boolean} autoPlayAudio
 * @property {boolean} hideScrollbar
 * @property {boolean} enableFilters
 * @property {string} theme - 'dark', 'light', or 'system'
 */

window.RedditPro.Settings = (function() {
  /** @type {RedditProSettings} */
  const DEFAULT_SETTINGS = {
    columns: '3',
    autoFit: false,
    masonry: true,
    compactCards: false,
    hidePromoted: true,
    hideSidebar: false,
    autoPlayAudio: true,
    hideScrollbar: true,
    enableFilters: true,
    theme: 'system'
  };

  /** @type {RedditProSettings} */
  let userSettings = { ...DEFAULT_SETTINGS };
  /** @type {RedditProSettings} */
  let activeSettings = { ...DEFAULT_SETTINGS };
  /** @type {boolean} */
  let isLoaded = false;
  
  /** @type {Array<(settings: RedditProSettings) => void>} */
  const listeners = [];

  /**
   * Loads settings from chrome.storage.
   * @returns {Promise<RedditProSettings>}
   */
  function load() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(DEFAULT_SETTINGS, (result) => {
        // @ts-ignore - Chrome storage return type allows this merging
        userSettings = { ...DEFAULT_SETTINGS, ...result };
        activeSettings = { ...userSettings };
        isLoaded = true;
        notifyListeners();
        resolve(userSettings);
      });
    });
  }

  /**
   * Saves partial settings to storage.
   * @param {Partial<RedditProSettings>} newSettings
   */
  function save(newSettings) {
    userSettings = { ...userSettings, ...newSettings };
    activeSettings = { ...userSettings };
    chrome.storage.sync.set(userSettings, () => {
      notifyListeners();
    });
  }

  /**
   * Gets the current active settings.
   * @returns {RedditProSettings}
   */
  function get() {
    return { ...activeSettings };
  }

  /**
   * Overrides settings temporarily (e.g. for post pages).
   * @param {Partial<RedditProSettings>} overrides
   */
  function updateActive(overrides) {
    activeSettings = { ...userSettings, ...overrides };
    notifyListeners();
  }

  /**
   * Subscribes to setting changes.
   * @param {(settings: RedditProSettings) => void} callback
   */
  function subscribe(callback) {
    listeners.push(callback);
    if (isLoaded) {
      callback(activeSettings);
    }
  }

  /**
   * Notifies all registered listeners of current settings.
   * @private
   */
  function notifyListeners() {
    listeners.forEach(cb => cb(activeSettings));
  }

  return { load, save, get, updateActive, subscribe };
})();
