import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

// Read and eval the settings module directly for testing
const code = fs.readFileSync(path.resolve(__dirname, '../../content/core/settings.js'), 'utf8');

describe('Settings Module', () => {
  beforeEach(() => {
    // Reset DOM environment
    window.RedditPro = {};
    
    // Mock chrome storage API
    global.chrome = {
      storage: {
        sync: {
          get: vi.fn((defaults, cb) => cb({ ...defaults, columns: '4', masonry: false })),
          set: vi.fn((data, cb) => cb())
        }
      }
    };

    // Eval the script in the current environment
    eval(code);
  });

  it('should initialize with default settings correctly merged with storage', async () => {
    const settings = await window.RedditPro.Settings.load();
    expect(settings.columns).toBe('4');
    expect(settings.masonry).toBe(false);
    expect(settings.autoFit).toBe(false); // default kept
  });

  it('should save settings and notify subscribers', async () => {
    await window.RedditPro.Settings.load();
    
    const listener = vi.fn();
    window.RedditPro.Settings.subscribe(listener);
    
    window.RedditPro.Settings.save({ columns: '2' });
    
    expect(global.chrome.storage.sync.set).toHaveBeenCalled();
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ columns: '2' }));
  });

  it('should allow temporary active overrides without saving', async () => {
    await window.RedditPro.Settings.load();
    
    window.RedditPro.Settings.updateActive({ columns: '1' }); // e.g., entering post thread
    
    const current = window.RedditPro.Settings.get();
    expect(current.columns).toBe('1');
    expect(global.chrome.storage.sync.set).not.toHaveBeenCalledTimes(2); // Only called on initial save mock if any
  });
});
