document.addEventListener('DOMContentLoaded', () => {
  const elements = {
    columns: document.querySelectorAll('input[name="columns"]'),
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
    // Set radio buttons
    elements.columns.forEach(radio => {
      radio.checked = (radio.value === settings.columns);
    });

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
    let selectedColumns = '3';
    elements.columns.forEach(radio => {
      if (radio.checked) selectedColumns = radio.value;
    });

    return {
      columns:       selectedColumns,
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
        chrome.tabs.sendMessage(tab.id, { type: 'UPDATE_SETTINGS', settings }, (response) => {
          if (chrome.runtime.lastError) {
            // Content script not ready — inject it programmatically as fallback
            chrome.scripting.executeScript({
              target: { tabId: tab.id },
              func: (s) => {
                // 1. Apply grid attributes
                const b = document.body;
                if (!b) return;
                b.setAttribute('data-reddit-grid-cols',          s.columns);
                b.setAttribute('data-reddit-grid-autofit',       s.autoFit);
                b.setAttribute('data-reddit-grid-masonry',       s.masonry);
                b.setAttribute('data-reddit-grid-compact',       s.compactCards);
                b.setAttribute('data-reddit-grid-hide-promoted', s.hidePromoted);
                b.setAttribute('data-reddit-grid-hide-sidebar',  s.hideSidebar);

                // 2. Inject forced CSS
                let tag = document.getElementById('rg-force-styles');
                if (!tag) {
                  tag = document.createElement('style');
                  tag.id = 'rg-force-styles';
                  (document.head || document.documentElement).appendChild(tag);
                }
                if (s.columns !== '1') {
                  tag.textContent = `
                    shreddit-post, shreddit-feed article, shreddit-feed shreddit-post-placeholder, faceplate-batch > shreddit-post, faceplate-batch > article, .Post {
                      margin: 0 !important; padding: 0 !important; flex-shrink: 0 !important; width: 100% !important; min-width: 0 !important; max-width: 100% !important; box-sizing: border-box !important;
                    }
                    shreddit-post, .Post {
                      background: linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.01) 100%) !important; backdrop-filter: blur(24px) saturate(180%) !important; -webkit-backdrop-filter: blur(24px) saturate(180%) !important;
                    }
                    shreddit-feed, .feed-container { gap: 4px !important; padding: 0 !important; margin: 0 !important; }
                    shreddit-feed > faceplate-batch, shreddit-feed > div, .feed-container > faceplate-batch, .feed-container > div { display: contents !important; margin: 0 !important; padding: 0 !important; }
                    faceplate-batch { margin: 0 !important; padding: 0 !important; }
                    .subgrid-container, [class*="subgrid-container"] { max-width: 100% !important; width: 100% !important; padding: 0 10px !important; margin: 0 !important; box-sizing: border-box !important; }
                    .main-container, [class*="main-container"] { display: block !important; max-width: 100% !important; width: 100% !important; padding: 0 !important; margin: 0 !important; box-sizing: border-box !important; }
                  `;
                } else {
                  tag.textContent = '';
                }

                // 3. Strip margins immediately
                if (s.columns !== '1') {
                  document.querySelectorAll('shreddit-post, shreddit-ad-post, shreddit-feed article, faceplate-batch > shreddit-post, .Post').forEach(el => {
                    const st = el.style;
                    st.setProperty('margin-top', '0', 'important'); st.setProperty('margin-left', '0', 'important'); st.setProperty('margin-right', '0', 'important');
                    st.setProperty('margin-bottom', s.masonry ? '6px' : '0', 'important');
                    st.setProperty('padding', '0', 'important'); st.setProperty('width', '100%', 'important'); st.setProperty('box-sizing', 'border-box', 'important');
                  });
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
  elements.columns.forEach(radio => radio.addEventListener('change', saveAndNotify));
  elements.autoFit.addEventListener('change',       saveAndNotify);
  elements.autoPlayAudio.addEventListener('change', saveAndNotify);
  elements.compactCards.addEventListener('change',  saveAndNotify);
  elements.hidePromoted.addEventListener('change',  saveAndNotify);
  elements.hideSidebar.addEventListener('change',   saveAndNotify);
  elements.hideScrollbar.addEventListener('change', saveAndNotify);
});
