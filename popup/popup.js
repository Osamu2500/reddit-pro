/**
 * @file popup.js
 * @description Loads, validates, and applies Reddit Pro popup settings.
 */
document.addEventListener('DOMContentLoaded', () => {
  const elements = {
    columns: /** @type {HTMLInputElement | null} */ (document.getElementById('columnsSlider')),
    columnsDisplay: document.getElementById('columnsValueDisplay'),
    autoFit: /** @type {HTMLInputElement | null} */ (document.getElementById('autoFit')),
    autoPlayAudio: /** @type {HTMLInputElement | null} */ (document.getElementById('autoPlayAudio')),
    compactCards: /** @type {HTMLInputElement | null} */ (document.getElementById('compactCards')),
    hidePromoted: /** @type {HTMLInputElement | null} */ (document.getElementById('hidePromoted')),
    hideSidebar: /** @type {HTMLInputElement | null} */ (document.getElementById('hideSidebar')),
    hideScrollbar: /** @type {HTMLInputElement | null} */ (document.getElementById('hideScrollbar')),
  };

  const defaultSettings = {
    columns: '3',
    autoFit: false,
    autoPlayAudio: true,
    masonry: true,
    compactCards: false,
    hidePromoted: true,
    hideSidebar: false,
    hideScrollbar: true,
  };

  chrome.storage.sync.get(defaultSettings, (settings) => {
    if (elements.columns) {
      elements.columns.value = String(settings.columns);
      if (elements.columnsDisplay) {
        elements.columnsDisplay.textContent =
          settings.columns === '1' ? '1 Column' : `${settings.columns} Columns`;
      }
    }

    if (elements.autoFit) elements.autoFit.checked = settings.autoFit;
    if (elements.autoPlayAudio) elements.autoPlayAudio.checked = settings.autoPlayAudio;
    if (elements.compactCards) elements.compactCards.checked = settings.compactCards;
    if (elements.hidePromoted) elements.hidePromoted.checked = settings.hidePromoted;
    if (elements.hideSidebar) elements.hideSidebar.checked = settings.hideSidebar;
    if (elements.hideScrollbar) elements.hideScrollbar.checked = settings.hideScrollbar;
  });

  function getSettings() {
    return {
      columns: elements.columns?.value || '3',
      autoFit: elements.autoFit?.checked ?? false,
      autoPlayAudio: elements.autoPlayAudio?.checked ?? true,
      masonry: true,
      compactCards: elements.compactCards?.checked ?? false,
      hidePromoted: elements.hidePromoted?.checked ?? true,
      hideSidebar: elements.hideSidebar?.checked ?? false,
      hideScrollbar: elements.hideScrollbar?.checked ?? true,
    };
  }

  /** @param {typeof defaultSettings} settings */
  function applySettingsFallback(settings) {
    const body = document.body;
    if (!body) return;

    body.setAttribute('data-reddit-grid-cols', settings.columns);
    body.setAttribute('data-reddit-grid-autofit', String(settings.autoFit));
    body.setAttribute('data-reddit-grid-masonry', String(settings.masonry));
    body.setAttribute('data-reddit-grid-compact', String(settings.compactCards));
    body.setAttribute('data-reddit-grid-hide-promoted', String(settings.hidePromoted));
    body.setAttribute('data-reddit-grid-hide-sidebar', String(settings.hideSidebar));

    if (window.RedditPro?.Settings) window.RedditPro.Settings.save(settings);
  }

  function saveAndNotify() {
    const settings = getSettings();

    chrome.storage.sync.set(settings, () => {
      if (chrome.runtime.lastError) {
        console.warn('RedditPro: Could not save settings', chrome.runtime.lastError);
        return;
      }

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        if (!tab || typeof tab.id !== 'number' || !tab.url) return;
        const tabId = tab.id;

        let hostname;
        try {
          hostname = new URL(tab.url).hostname;
        } catch {
          return;
        }
        if (!/(^|\.)reddit\.com$/i.test(hostname)) return;

        chrome.tabs.sendMessage(
          tabId,
          { type: 'UPDATE_SETTINGS', settings },
          () => {
            if (!chrome.runtime.lastError) return;

            chrome.scripting.executeScript({
              target: { tabId },
              func: applySettingsFallback,
              args: [settings],
            });
          }
        );
      });
    });
  }

  elements.columns?.addEventListener('input', (event) => {
    const value = /** @type {HTMLInputElement} */ (event.currentTarget).value;
    if (elements.columnsDisplay) {
      elements.columnsDisplay.textContent = value === '1' ? '1 Column' : `${value} Columns`;
    }
    saveAndNotify();
  });

  elements.autoFit?.addEventListener('change', saveAndNotify);
  elements.autoPlayAudio?.addEventListener('change', saveAndNotify);
  elements.compactCards?.addEventListener('change', saveAndNotify);
  elements.hidePromoted?.addEventListener('change', saveAndNotify);
  elements.hideSidebar?.addEventListener('change', saveAndNotify);
  elements.hideScrollbar?.addEventListener('change', saveAndNotify);
});
