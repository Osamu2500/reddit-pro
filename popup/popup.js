/**
 * Reddit Pro popup settings controller.
 * @typedef {Record<string, string | number | boolean>} SettingsMap
 */
document.addEventListener('DOMContentLoaded', () => {
  /** @type {SettingsMap} */
  const defaults = {
    columns: '3', autoFit: false, masonry: true, compactCards: false,
    hidePromoted: true, hideSidebar: false, autoPlayAudio: true,
    hideScrollbar: true, enableFilters: true, theme: 'system',
    minCardWidth: 260, maxColumns: 10, columnGap: 16, rowGap: 16, cardRadius: 14,
  };
  /** @param {string} id @returns {HTMLElement | null} */
  const byId = (id) => document.getElementById(id);
  /** @type {Record<string, HTMLInputElement | HTMLSelectElement | null>} */
  const controls = {
    columns: /** @type {HTMLInputElement | null} */ (byId('columnsSlider')),
    autoFit: /** @type {HTMLInputElement | null} */ (byId('autoFit')),
    masonry: /** @type {HTMLInputElement | null} */ (byId('masonry')),
    compactCards: /** @type {HTMLInputElement | null} */ (byId('compactCards')),
    hidePromoted: /** @type {HTMLInputElement | null} */ (byId('hidePromoted')),
    hideSidebar: /** @type {HTMLInputElement | null} */ (byId('hideSidebar')),
    autoPlayAudio: /** @type {HTMLInputElement | null} */ (byId('autoPlayAudio')),
    hideScrollbar: /** @type {HTMLInputElement | null} */ (byId('hideScrollbar')),
    enableFilters: /** @type {HTMLInputElement | null} */ (byId('enableFilters')),
    theme: /** @type {HTMLSelectElement | null} */ (byId('theme')),
    minCardWidth: /** @type {HTMLInputElement | null} */ (byId('minCardWidth')),
    maxColumns: /** @type {HTMLInputElement | null} */ (byId('maxColumns')),
    columnGap: /** @type {HTMLInputElement | null} */ (byId('columnGap')),
    rowGap: /** @type {HTMLInputElement | null} */ (byId('rowGap')),
    cardRadius: /** @type {HTMLInputElement | null} */ (byId('cardRadius')),
  };
  /** @type {Record<string, (value: string) => string>} */
  const rangeOutputs = {
    columns: (v) => v === '1' ? '1 column' : v + ' columns',
    minCardWidth: (v) => v + ' px', maxColumns: (v) => v,
    columnGap: (v) => v + ' px', rowGap: (v) => v + ' px', cardRadius: (v) => v + ' px',
  };
  /** @type {SettingsMap} */
  let current = { ...defaults };
  let saveTimer = 0;
  let saveSequence = 0;

  /** @param {string} message @param {'idle'|'saving'|'error'} [state] */
  function setStatus(message, state = 'idle') {
    const node = byId('saveStatus');
    if (node) node.textContent = message;
    const statusText = byId('extensionStatusText');
    if (statusText) statusText.textContent = state === 'error' ? 'Issue' : state === 'saving' ? 'Saving' : 'Ready';
    const dot = byId('extensionStatus')?.querySelector('.status-dot');
    if (dot instanceof HTMLElement) {
      dot.style.background = state === 'error' ? '#f16c6c' : state === 'saving' ? '#e5b84b' : '#43c887';
    }
  }

  /** @param {SettingsMap} settings */
  function renderPreview(settings) {
    const preview = byId('previewGrid');
    if (!preview) return;
    const count = settings.autoFit ? Math.min(4, Math.max(1, Number(settings.maxColumns) || 4)) : Math.min(4, Math.max(1, Number(settings.columns) || 3));
    preview.style.setProperty('--preview-columns', String(count));
    preview.style.setProperty('--preview-gap', Math.max(4, Number(settings.columnGap) || 16) + 'px');
    preview.style.setProperty('--preview-radius', Math.max(6, Number(settings.cardRadius) - 2) + 'px');
    const label = byId('previewLabel');
    if (label) label.textContent = settings.autoFit ? 'Auto-fit preview' : count + ' columns';
  }

  /** @type {Record<string, Record<string, string | number | boolean>>} */
  const presets = {
    balanced: { columns: '3', autoFit: false, minCardWidth: 260, maxColumns: 10, columnGap: 16, rowGap: 16 },
    comfortable: { columns: '2', autoFit: false, minCardWidth: 320, maxColumns: 10, columnGap: 20, rowGap: 20 },
    dense: { columns: '4', autoFit: false, minCardWidth: 220, maxColumns: 10, columnGap: 10, rowGap: 12 },
    adaptive: { columns: '3', autoFit: true, minCardWidth: 260, maxColumns: 10, columnGap: 16, rowGap: 16 },
  };

  /** @param {SettingsMap} settings */
  function render(settings) {
    Object.entries(controls).forEach(([key, control]) => {
      if (!control) return;
      if (control instanceof HTMLInputElement && control.type === 'checkbox') {
        control.checked = settings[key] === true;
      } else {
        control.value = String(settings[key] ?? defaults[key]);
      }
    });
    Object.entries(rangeOutputs).forEach(([key, format]) => {
      const outputId = key === 'columns' ? 'columnsValueDisplay' : key + 'Value';
      const output = byId(outputId);
      if (output) output.textContent = format(String(settings[key]));
    });
    const summary = byId('summaryColumns');
    if (summary) summary.textContent = settings.autoFit
      ? 'Auto-fit · up to ' + settings.maxColumns
      : (settings.columns === '1' ? '1 column' : settings.columns + ' columns');
    const radiusOutput = byId('cardRadiusValue');
    if (radiusOutput) radiusOutput.textContent = String(settings.cardRadius) + ' px';
    renderPreview(settings);
    const mode = byId('summaryMode');
    if (mode) mode.textContent = (settings.autoFit ? 'Responsive layout' : 'Manual layout') +
      ' · Masonry ' + (settings.masonry ? 'on' : 'off');
  }

  /** @returns {SettingsMap} */
  function readControls() {
    /** @type {SettingsMap} */
    const next = { ...current };
    Object.entries(controls).forEach(([key, control]) => {
      if (!control) return;
      if (control instanceof HTMLInputElement && control.type === 'checkbox') {
        next[key] = control.checked;
      } else {
        next[key] = ['columns', 'theme'].includes(key) ? control.value : Number(control.value);
      }
    });
    next.maxColumns = Math.min(10, Math.max(1, Number(next.maxColumns) || 10));
    next.columns = String(Math.min(10, Math.max(1, Number(next.columns) || 3)));
    next.minCardWidth = Math.min(420, Math.max(200, Number(next.minCardWidth) || 260));
    next.columnGap = Math.min(32, Math.max(4, Number(next.columnGap) || 16));
    next.rowGap = Math.min(32, Math.max(4, Number(next.rowGap) || 16));
    next.cardRadius = Math.min(24, Math.max(8, Number(next.cardRadius) || 14));
    return next;
  }

  /** @param {SettingsMap} settings */
  function applyFallback(settings) {
    const body = document.body;
    if (!body) return;
    body.setAttribute('data-reddit-grid-cols', String(settings.columns));
    body.setAttribute('data-reddit-grid-autofit', String(settings.autoFit));
    body.setAttribute('data-reddit-grid-masonry', String(settings.masonry));
    body.setAttribute('data-reddit-grid-compact', String(settings.compactCards));
    body.setAttribute('data-reddit-grid-hide-promoted', String(settings.hidePromoted));
    body.setAttribute('data-reddit-grid-hide-sidebar', String(settings.hideSidebar));
    body.style.setProperty('--reddit-col-gap', String(settings.columnGap) + 'px');
    body.style.setProperty('--reddit-row-gap', String(settings.rowGap) + 'px');
    body.style.setProperty('--rg-radius', String(settings.cardRadius) + 'px');
    body.style.setProperty('--rg-radius-inner', String(Math.max(6, Number(settings.cardRadius) - 2)) + 'px');
  }

  /** @param {SettingsMap} settings @param {number} sequence */
  function notifyActiveTab(settings, sequence) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) return;
      const tab = tabs && tabs[0];
      if (!tab || typeof tab.id !== 'number' || !tab.url) return;
      const tabId = tab.id;
      let hostname;
      try { hostname = new URL(tab.url).hostname; } catch { return; }
      if (!/(^|\.)reddit\.com$/i.test(hostname)) return;
      chrome.tabs.sendMessage(tabId, { type: 'UPDATE_SETTINGS', settings }, () => {
        if (!chrome.runtime.lastError || sequence !== saveSequence) return;
        chrome.scripting.executeScript({
          target: { tabId },
          func: applyFallback,
          args: [settings],
        }, () => {
          if (chrome.runtime.lastError) setStatus('Saved; reload Reddit to apply', 'error');
        });
      });
    });
  }

  function saveNow() {
    current = readControls();
    render(current);
    const sequence = ++saveSequence;
    setStatus('Saving settings…', 'saving');
    chrome.storage.sync.set(current, () => {
      if (sequence !== saveSequence) return;
      if (chrome.runtime.lastError) {
        setStatus('Could not save settings', 'error');
        return;
      }
      setStatus('All changes saved');
      notifyActiveTab(current, sequence);
    });
  }

  function scheduleSave() {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(saveNow, 180);
  }

  Object.entries(controls).forEach(([key, control]) => {
    if (!control) return;
    const eventName = control instanceof HTMLSelectElement || (control instanceof HTMLInputElement && control.type === 'checkbox')
      ? 'change' : 'input';
    const handler = ['columns', 'minCardWidth', 'maxColumns', 'columnGap', 'rowGap'].includes(key)
      ? scheduleSave : saveNow;
    control.addEventListener(eventName, handler);
  });

  /** @type {NodeListOf<HTMLButtonElement>} */
  const tabs = document.querySelectorAll('[data-page]');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const page = tab.getAttribute('data-page');
      tabs.forEach((item) => {
        const active = item === tab;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-selected', String(active));
      });
      /** @type {NodeListOf<HTMLElement>} */
      const panels = document.querySelectorAll('[data-panel]');
      panels.forEach((panel) => {
        const active = panel.getAttribute('data-panel') === page;
        panel.classList.toggle('is-active', active);
        panel.hidden = !active;
      });
    });
  });

  document.querySelectorAll('[data-preset]').forEach((button) => {
    button.addEventListener('click', () => {
      const presetName = button.getAttribute('data-preset');
      if (!presetName || !Object.prototype.hasOwnProperty.call(presets, presetName)) return;
      const preset = presets[presetName];
      Object.entries(preset).forEach(([key, value]) => {
        const control = controls[key];
        if (control) control.value = String(value);
      });
      saveNow();
    });
  });

  byId('resetSettings')?.addEventListener('click', () => {
    current = { ...defaults };
    render(current);
    saveNow();
  });

  chrome.storage.sync.get(defaults, (stored) => {
    if (chrome.runtime.lastError) {
      setStatus('Could not load settings', 'error');
      return;
    }
    current = { ...defaults, ...stored };
    render(current);
  });
});