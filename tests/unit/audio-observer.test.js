import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(
  path.resolve(process.cwd(), 'content/observers/audio-observer.js'),
  'utf8'
);

describe('Audio observer', () => {
  let intersectionObserver;
  let settings;
  let settingsListener;

  beforeEach(() => {
    window.RedditPro = {};
    settings = { autoPlayAudio: false };
    settingsListener = null;

    class MockIntersectionObserver {
      constructor(callback) {
        this.callback = callback;
        this.observe = vi.fn();
        this.unobserve = vi.fn();
        this.disconnect = vi.fn();
        intersectionObserver = this;
      }
    }

    globalThis.IntersectionObserver = MockIntersectionObserver;
    window.RedditPro.Settings = {
      get: () => ({ ...settings }),
      subscribe: (callback) => {
        settingsListener = callback;
        return vi.fn();
      },
    };
    window.requestAnimationFrame = (callback) => callback();
    window.innerWidth = 1000;
    window.innerHeight = 800;
    eval(source);
  });

  afterEach(() => {
    window.RedditPro.AudioObserver?.disconnectAll();
    delete globalThis.IntersectionObserver;
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it('keeps intersection state current while audio focus is disabled', () => {
    const player = document.createElement('shreddit-player');
    const video = document.createElement('video');
    player.append(video);
    document.body.append(player);
    player.getBoundingClientRect = () => ({
      left: 400,
      top: 300,
      width: 200,
      height: 200,
      right: 600,
      bottom: 500,
    });

    window.RedditPro.AudioObserver.observe(player);
    expect(intersectionObserver.observe).toHaveBeenCalledWith(player);

    intersectionObserver.callback([{ target: player, isIntersecting: true }]);
    window.RedditPro.AudioObserver.updateFocus();
    expect(video.muted).toBe(true);

    settings.autoPlayAudio = true;
    settingsListener(settings);
    window.RedditPro.AudioObserver.updateFocus();

    expect(video.muted).toBe(false);
    expect(player.hasAttribute('muted')).toBe(false);
  });

  it('mutes and forgets players when disconnected', () => {
    const player = document.createElement('shreddit-player');
    const video = document.createElement('video');
    player.append(video);
    document.body.append(player);
    player.getBoundingClientRect = () => ({
      left: 400,
      top: 300,
      width: 200,
      height: 200,
      right: 600,
      bottom: 500,
    });

    window.RedditPro.AudioObserver.observe(player);
    intersectionObserver.callback([{ target: player, isIntersecting: true }]);
    settings.autoPlayAudio = true;
    window.RedditPro.AudioObserver.updateFocus();
    expect(video.muted).toBe(false);

    player.remove();
    window.RedditPro.AudioObserver.updateFocus();
    expect(video.muted).toBe(true);
    expect(intersectionObserver.unobserve).toHaveBeenCalledWith(player);
  });
});
