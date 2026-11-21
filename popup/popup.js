/**
 * Reddit Pro popup settings controller.
 * Keeps popup controls aligned with the canonical settings supported by core/settings.js.
 */
document.addEventListener('DOMContentLoaded', () => {
  const defaults = {
    columns: '3', autoFit: false, masonry: true, compactCards: false,
    hidePromoted: true, hideSidebar: false, autoPlayAudio: true,
    hideScrollbar: true, enableFilters: true, theme: 'system',
    minCardWidth: 280, maxColumns: 10, columnGap: 12, rowGap: 12,
  };
  const byId = (id) => document.getElementById(id);
  const controls = {
    columns: byId('columnsSlider'), autoFit: byId('autoFit'), masonry: byId('masonry'),
    compactCards: byId('compactCards'), hidePromoted: byId('hidePromoted'),
    hideSidebar: byId('hideSidebar'), autoPlayAudio: byId('autoPlayAudio'),
    hideScrollbar: byId('hideScrollbar'), enableFilters: byId('enableFilters'),
    theme: byId('theme'), minCardWidth: byId('minCardWidth'),
    maxColumns: byId('maxColumns'), columnGap: byId('columnGap'), rowGap: byId('rowGap'),
  };
  const rangeOutputs = {
    columns: (v) => v === '1' ? '1 column' : v + ' columns',
    minCardWidth: (v) => v + ' px', maxColumns: (v) => v,
    columnGap: (v) => v + ' px', rowGap: (v) => v + ' px',
  };
  let current = { ...defaults };
  let saveTimer = 0;
  let saveSequence = 0;

  function setStatus(message, state = 'idle') {
    const node = byId('saveStatus');
    if (node) node.textContent = message;
    const pill = byId('extensionStatus');
    if (pill) {
      pill.lastChild.textContent = state === 'error' ? ' Issue' : state === 'saving' ? ' Saving' : ' Ready';
      const dot = pill.querySelector('.status-dot');
      if (dot) dot.style.background = state === 'error' ? '#f16c6c' : state === 'saving' ? '#e5b84b' : '#43c887';
    }
  }

  function render(settings) {
    Object.entries(controls).forEach(([key, control]) => {
      if (!control) return;
      if (control.type === 'checkbox') control.checked = settings[key] === true;
      else control.value = String(settings[key] ?? defaults[key]);
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
    const mode = byId('summaryMode');
    if (mode) mode.textContent = (settings.autoFit ? 'Responsive layout' : 'Manual layout') +
      ' · Masonry ' + (settings.masonry ? 'on' : 'off');
  }

  function readControls() {
    const next = { ...current };
    Object.entries(controls).forEach(([key, control]) => {
      if (!control) return;
      next[key] = control.type === 'checkbox'
        ? control.checked
        : (['columns', 'theme'].includes(key) ? control.value : Number(control.value));
    });
    next.maxColumns = Math.min(10, Math.max(1, next.maxColumns));
    next.columns = String(Math.min(10, Math.max(1, Number(next.columns) || 3)));
    next.minCardWidth = Math.min(420, Math.max(200, next.minCardWidth));
    next.columnGap = Math.min(32, Math.max(4, next.columnGap));
    next.rowGap = Math.min(32, Math.max(4, next.rowGap));
    return next;
  }

  function applyFallback(settings) {
    const body = document.body;
    if (!body) return;
    body.setAttribute('data-reddit-grid-cols', settings.columns);
    body.setAttribute('data-reddit-grid-autofit', String(settings.autoFit));
    body.setAttribute('data-reddit-grid-masonry', String(settings.masonry));
    body.setAttribute('data-reddit-grid-compact', String(settings.compactCards));
    body.setAttribute('data-reddit-grid-hide-promoted', String(settings.hidePromoted));
    body.setAttribute('data-reddit-grid-hide-sidebar', String(settings.hideSidebar));
    body.style.setProperty('--reddit-col-gap', settings.columnGap + 'px');
    body.style.setProperty('--reddit-row-gap', settings.rowGap + 'px');
  }

  function notifyActiveTab(settings, sequence) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) return;
      const tab = tabs && tabs[0];
      if (!tab || typeof tab.id !== 'number' || !tab.url) return;
      let hostname;
      try { hostname = new URL(tab.url).hostname; } catch { return; }
      if (!/(^|\.)reddit\.com$/i.test(hostname)) return;
      chrome.tabs.sendMessage(tab.id, { type: 'UPDATE_SETTINGS', settings }, () => {
        if (!chrome.runtime.lastError || sequence !== saveSequence) return;
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: applyFallback,
          args: [settings],
        }, () => {
          if (chrome.runtime.lastError) setStatus('Saved; reload Reddit to apply', 'error');
        });
      });
    });
  }

  function applyFallback(settings) {
    const body = document.body;
    if (!body) return;
    body.setAttribute('data-reddit-grid-cols', settings.columns);
    body.setAttribute('data-reddit-grid-autofit', String(settings.autoFit));
    body.setAttribute('data-reddit-grid-masonry', String(settings.masonry));
    body.setAttribute('data-reddit-grid-compact', String(settings.compactCards));
    body.setAttribute('data-reddit-grid-hide-promoted', String(settings.hidePromoted));
    body.setAttribute('data-reddit-grid-hide-sidebar', String(settings.hideSidebar));
    body.style.setProperty('--reddit-col-gap', settings.columnGap + 'px');
    body.style.setProperty('--reddit-row-gap', settings.rowGap + 'px');
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
    control.addEventListener(control.type === 'checkbox' || control.tagName === 'SELECT' ? 'change' : 'input',
      key === 'columns' || key === 'minCardWidth' || key === 'maxColumns' || key === 'columnGap' || key === 'rowGap'
        ? scheduleSave : saveNow);
  });

  document.querySelectorAll('[data-page]').forEach((tab) => {
    tab.addEventListener('click', () => {
      const page = tab.getAttribute('data-page');
      document.querySelectorAll('[data-page]').forEach((item) => {
        const active = item === tab;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-selected', String(active));
      });
      document.querySelectorAll('[data-panel]').forEach((panel) => {
        const active = panel.getAttribute('data-panel') === page;
        panel.classList.toggle('is-active', active);
        panel.hidden = !active;
      });
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