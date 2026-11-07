document.addEventListener('DOMContentLoaded', () => {
  const elements = {
    columns: document.getElementById('columnsSlider'),
    columnsDisplay: document.getElementById('columnsValueDisplay'),
    autoFit: document.getElementById('autoFit'),
    autoPlayAudio: document.getElementById('autoPlayAudio'),
    compactCards: document.getElementById('compactCards'),
    hidePromoted: document.getElementById('hidePromoted'),
    hideSidebar: document.getElementById('hideSidebar'),
    hideScrollbar: document.getElementById('hideScrollbar')
  };

  // Default settings — autoFit MUST be false so manual column picks are respected
  const defaultSettings = {
    columns: '3',
    autoFit: false,
    autoPlayAudio: true,
    masonry: true,
    compactCards: false,
    hidePromoted: true,
    hideSidebar: false,
    hideScrollbar: true
  };

  // Load saved settings and populate UI
  chrome.storage.sync.get(defaultSettings, (settings) => {
    // Set slider
    if (elements.columns && settings.columns) {
      elements.columns.value = settings.columns;
      if (elements.columnsDisplay) {
        elements.columnsDisplay.textContent = settings.columns === '1' ? '1 Column' : `${settings.columns} Columns`;
      }
    }

    // Set checkboxes
    elements.autoFit.checked       = settings.autoFit;
    elements.autoPlayAudio.checked = settings.autoPlayAudio;
    elements.compactCards.checked  = settings.compactCards;
    elements.hidePromoted.checked  = settings.hidePromoted;
    elements.hideSidebar.checked   = settings.hideSidebar;
    elements.hideScrollbar.checked = settings.hideScrollbar;
  });

  // Build current settings from UI state
  const getSettings = () => {
    return {
      columns:       elements.columns ? elements.columns.value : '3',
      autoFit:       elements.autoFit.checked,
      autoPlayAudio: elements.autoPlayAudio.checked,
      masonry:       true,
      compactCards:  elements.compactCards.checked,
      hidePromoted:  elements.hidePromoted.checked,
      hideSidebar:   elements.hideSidebar.checked,
      hideScrollbar: elements.hideScrollbar.checked
    };
  };

  // Save to storage AND push to the active Reddit tab
  const saveAndNotify = () => {
    const settings = getSettings();

    chrome.storage.sync.set(settings, () => {
      // Query the active tab
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        if (!tab || !tab.url || !tab.url.includes('reddit.com')) return;

        // Try sending message — if content script is ready it'll apply immediately
        chrome.tabs.sendMessage(tab.id, { type: 'UPDATE_SETTINGS', settings }, (_response) => {
          if (chrome.runtime.lastError) {
            // Content script not ready — inject it programmatically as fallback
            chrome.scripting.executeScript({
              target: { tabId: tab.id },
              func: (s) => {
                const b = document.body;
                if (!b) return;
                b.setAttribute('data-reddit-grid-cols',          s.columns);
                b.setAttribute('data-reddit-grid-autofit',       String(s.autoFit));
                b.setAttribute('data-reddit-grid-masonry',       String(s.masonry));
                b.setAttribute('data-reddit-grid-compact',       String(s.compactCards));
                b.setAttribute('data-reddit-grid-hide-promoted', String(s.hidePromoted));
                b.setAttribute('data-reddit-grid-hide-sidebar',  String(s.hideSidebar));

                if (window.RedditPro?.Settings) {
                  window.RedditPro.Settings.save(s);
                }
              },
              args: [settings]
            });
          }
        });
      });
    });
  };

  // Wire up all controls
  if (elements.columns) {
    elements.columns.addEventListener('input', (e) => {
      if (elements.columnsDisplay) {
        elements.columnsDisplay.textContent = e.target.value === '1' ? '1 Column' : `${e.target.value} Columns`;
      }
      saveAndNotify();
    });
  }
  elements.autoFit.addEventListener('change',       saveAndNotify);
  elements.autoPlayAudio.addEventListener('change', saveAndNotify);
  elements.compactCards.addEventListener('change',  saveAndNotify);
  elements.hidePromoted.addEventListener('change',  saveAndNotify);
  elements.hideSidebar.addEventListener('change',   saveAndNotify);
  elements.hideScrollbar.addEventListener('change', saveAndNotify);
});
