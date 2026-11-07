import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

const code = fs.readFileSync(
  path.resolve(process.cwd(), 'content/features/filters.js'),
  'utf8'
);

describe('Filters Module', () => {
  let settings;

  beforeEach(() => {
    document.body.innerHTML = '';
    settings = { enableFilters: true };
    window.RedditPro = {
      Settings: {
        get: () => ({ ...settings }),
        subscribe: vi.fn(),
      },
      Masonry: {
        sweepAll: vi.fn(),
      },
    };

    globalThis.chrome = {
      runtime: { lastError: null },
      storage: {
        local: {
          get: vi.fn((_defaults, callback) => callback({ redditProFilters: {
            keywords: [],
            flairs: [],
            mediaType: 'all',
          } })),
          set: vi.fn((_value, callback) => callback?.()),
        },
      },
    };

    eval(code);
  });

  it('hides cards whose title matches an active keyword', () => {
    const card = document.createElement('shreddit-post');
    card.setAttribute('post-title', 'A keyboard review');
    document.body.appendChild(card);

    window.RedditPro.Filters.setFilters({ keywords: ['keyboard'] });

    expect(card.style.display).toBe('none');
    expect(card.classList.contains('rg-filtered-out')).toBe(true);
  });

  it('restores cards it previously hid when filtering is disabled', () => {
    const card = document.createElement('shreddit-post');
    card.setAttribute('post-title', 'A keyboard review');
    document.body.appendChild(card);

    window.RedditPro.Filters.setFilters({ keywords: ['keyboard'] });
    settings.enableFilters = false;
    window.RedditPro.Filters.applyToCard(card);

    expect(card.style.display).toBe('');
    expect(card.classList.contains('rg-filtered-out')).toBe(false);
  });

  it('persists normalized filter rules in extension storage', () => {
    window.RedditPro.Filters.setFilters({
      keywords: ['  keyboard ', 'keyboard', ''],
      mediaType: 'video',
    });

    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      redditProFilters: {
        keywords: ['keyboard'],
        flairs: [],
        mediaType: 'video',
      },
    }, expect.any(Function));
  });


  it('restores an existing inline display value and its priority', () => {
    const card = document.createElement('shreddit-post');
    card.setAttribute('post-title', 'A keyboard review');
    card.style.setProperty('display', 'flex', 'important');
    document.body.appendChild(card);

    window.RedditPro.Filters.setFilters({ keywords: ['keyboard'] });
    expect(card.style.getPropertyValue('display')).toBe('none');

    window.RedditPro.Filters.setFilters({ keywords: [] });
    expect(card.style.getPropertyValue('display')).toBe('flex');
    expect(card.style.getPropertyPriority('display')).toBe('important');
    expect(card.classList.contains('rg-filtered-out')).toBe(false);
  });

});
