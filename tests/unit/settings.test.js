import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

const filePath = path.resolve(process.cwd(), 'content/core/settings.js');
const code = fs.readFileSync(filePath, 'utf8');

describe('Settings Module', () => {
  beforeEach(() => {
    window.RedditPro = {};

    globalThis.chrome = {
      runtime: {
        lastError: null,
        onMessage: {
          addListener: vi.fn(),
        },
      },
      storage: {
        sync: {
          get: vi.fn((defaults, callback) => callback({ ...defaults, columns: '4', masonry: false })),
          set: vi.fn((_data, callback) => {
            if (callback) callback();
          }),
        },
        onChanged: {
          addListener: vi.fn(),
        },
      },
    };

    eval(code);
  });

  it('merges stored settings with defaults', async () => {
    const settings = await window.RedditPro.Settings.load();
    expect(settings.columns).toBe('4');
    expect(settings.masonry).toBe(false);
    expect(settings.autoFit).toBe(false);
  });

  it('saves settings and notifies subscribers', async () => {
    await window.RedditPro.Settings.load();

    const listener = vi.fn();
    window.RedditPro.Settings.subscribe(listener);
    window.RedditPro.Settings.save({ columns: '2' });

    expect(globalThis.chrome.storage.sync.set).toHaveBeenCalled();
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ columns: '2' }));
  });

  it('preserves temporary route overrides when user settings are saved', async () => {
    await window.RedditPro.Settings.load();

    window.RedditPro.Settings.updateActive({ columns: '1' });
    window.RedditPro.Settings.save({ hideSidebar: true });

    expect(window.RedditPro.Settings.get()).toEqual(
      expect.objectContaining({ columns: '1', hideSidebar: true })
    );
  });

  it('restores user settings when temporary overrides are cleared', async () => {
    await window.RedditPro.Settings.load();

    window.RedditPro.Settings.updateActive({ columns: '1' });
    window.RedditPro.Settings.updateActive({});

    expect(window.RedditPro.Settings.get().columns).toBe('4');
  });

  it('falls back to a valid column count for corrupted stored settings', async () => {
    globalThis.chrome.storage.sync.get.mockImplementation((_defaults, callback) =>
      callback({ columns: '999' })
    );

    const settings = await window.RedditPro.Settings.load();
    expect(settings.columns).toBe('3');
  });
});
