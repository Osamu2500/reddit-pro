/**
 * @file settings.js
 * @description Core settings manager for Reddit Pro.
 * Handles loading, saving, temporary route overrides, and broadcasting settings changes.
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
 * @property {string} theme
 */

window.RedditPro.Settings = (function () {
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
    theme: 'system',
  };

  let userSettings = { ...DEFAULT_SETTINGS };
  let activeSettings = { ...DEFAULT_SETTINGS };
  let activeOverrides = {};
  let isLoaded = false;
  const listeners = new Set();

  function normalizeSettings(settings) {
    const merged = { ...DEFAULT_SETTINGS, ...(settings || {}) };
    const columns = String(merged.columns);
    const themes = ['dark', 'light', 'system'];

    return {
      ...merged,
      columns: /^(?:[1-9]|10)$/.test(columns) ? columns : DEFAULT_SETTINGS.columns,
      autoFit: merged.autoFit === true,
      masonry: merged.masonry === true,
      compactCards: merged.compactCards === true,
      hidePromoted: merged.hidePromoted === true,
      hideSidebar: merged.hideSidebar === true,
      autoPlayAudio: merged.autoPlayAudio === true,
      hideScrollbar: merged.hideScrollbar === true,
      enableFilters: merged.enableFilters === true,
      theme: themes.includes(merged.theme) ? merged.theme : DEFAULT_SETTINGS.theme,
    };
  }

  function applyActiveSettings() {
    activeSettings = { ...userSettings, ...activeOverrides };
  }

  function load() {
    return new Promise((resolve) => {
      try {
        if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
          chrome.storage.sync.get(DEFAULT_SETTINGS, (result) => {
            if (chrome.runtime?.lastError) {
              console.warn('Storage warning:', chrome.runtime.lastError);
            }
            userSettings = normalizeSettings(result);
            applyActiveSettings();
            isLoaded = true;
            notifyListeners();
            resolve({ ...userSettings });
          });
        } else {
          userSettings = normalizeSettings(userSettings);
          applyActiveSettings();
          isLoaded = true;
          notifyListeners();
          resolve({ ...userSettings });
        }
      } catch (error) {
        console.warn('Storage API unavailable', error);
        isLoaded = true;
        notifyListeners();
        resolve({ ...userSettings });
      }
    });
  }

  function save(newSettings) {
    userSettings = normalizeSettings({ ...userSettings, ...(newSettings || {}) });
    applyActiveSettings();

    const notify = () => notifyListeners();

    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
        chrome.storage.sync.set(userSettings, () => {
          if (chrome.runtime?.lastError) {
            console.warn('Storage warning:', chrome.runtime.lastError);
          }
          notify();
        });
      } else {
        notify();
      }
    } catch (error) {
      console.warn('Storage API unavailable', error);
      notify();
    }
  }

  function get() {
    return { ...activeSettings };
  }

  function updateActive(overrides) {
    activeOverrides = { ...(overrides || {}) };
    applyActiveSettings();
    notifyListeners();
  }

  function subscribe(callback) {
    if (typeof callback !== 'function') return () => {};
    listeners.add(callback);
    if (isLoaded) callback(get());
    return () => listeners.delete(callback);
  }

  function notifyListeners() {
    listeners.forEach((callback) => {
      try {
        callback(get());
      } catch (error) {
        console.error('[Reddit Pro] Settings listener failed:', error);
      }
    });
  }

  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === 'UPDATE_SETTINGS' && message.settings) {
        save(message.settings);
        if (typeof sendResponse === 'function') sendResponse({ ok: true });
      }
    });
  }

  if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((_changes, areaName) => {
      if (areaName === 'sync') load();
    });
  }

  return { load, save, get, updateActive, subscribe };
})();
