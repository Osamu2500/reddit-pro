import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const cardsCss = fs.readFileSync(path.resolve(process.cwd(), 'content/styles/cards.css'), 'utf8');
const themeCss = fs.readFileSync(path.resolve(process.cwd(), 'content/styles/theme.css'), 'utf8');
const masonrySource = fs.readFileSync(
  path.resolve(process.cwd(), 'content/layout/masonry.js'),
  'utf8'
);
const domObserverSource = fs.readFileSync(
  path.resolve(process.cwd(), 'content/observers/dom-observer.js'),
  'utf8'
);

describe('Media Full Ratio/Sizing & Enhanced Post Description Formatting', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    window.RedditPro = {
      Settings: {
        get: () => ({
          columns: '3',
          masonry: true,
          autoFit: false,
          minCardWidth: 280,
          columnGap: 12,
          rowGap: 12,
        }),
      },
    };
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  describe('CSS: Image & Video Natural Ratio and Unconstrained Sizing', () => {
    it('removes height and aspect-ratio caps from media containers', () => {
      // Containers must not be clamped by fixed heights or forced aspect ratio
      expect(cardsCss).toMatch(
        /\[slot='post-media-container'\][\s\S]*?height:\s*auto\s*!important;\s*max-height:\s*none\s*!important;\s*min-height:\s*0\s*!important;\s*padding-bottom:\s*0\s*!important;\s*aspect-ratio:\s*auto\s*!important;/
      );
    });

    it('neutralizes Reddit --max-height CSS variables on post cards', () => {
      expect(cardsCss).toMatch(/--max-height:\s*none\s*!important;/);
      expect(cardsCss).toMatch(/--gallery-carousel-item-height:\s*auto\s*!important;/);
    });

    it('applies object-fit: contain and unconstrained dimensions to images and videos', () => {
      expect(cardsCss).toMatch(
        /img:not\(\.post-background-image-filter\)[\s\S]*?object-fit:\s*contain\s*!important;/
      );
      expect(cardsCss).toMatch(
        /img:not\(\.post-background-image-filter\)[\s\S]*?height:\s*auto\s*!important;/
      );
      expect(cardsCss).toMatch(
        /img:not\(\.post-background-image-filter\)[\s\S]*?max-height:\s*none\s*!important;/
      );
    });

    it('supports modern shreddit-player and shreddit-player-2 video components', () => {
      expect(cardsCss).toContain('shreddit-player-2');
      expect(cardsCss).toMatch(
        /:is\(shreddit-player,\s*shreddit-player-2\)::part\(video\)[\s\S]*?object-fit:\s*contain\s*!important;/
      );
      expect(themeCss).toContain('shreddit-player-2');
    });

    it('allows gallery carousels to scale naturally to full image ratios', () => {
      expect(cardsCss).toMatch(
        /gallery-carousel[\s\S]*?img:not\(\.post-background-image-filter\)[\s\S]*?object-fit:\s*contain\s*!important;/
      );
      expect(cardsCss).toMatch(
        /gallery-carousel[\s\S]*?img:not\(\.post-background-image-filter\)[\s\S]*?max-height:\s*none\s*!important;/
      );
    });
  });

  describe('CSS: Text Body & Post Description Formatting', () => {
    it('completely removes blurry optical fade masks from descriptions', () => {
      // Must set mask-image: none !important
      expect(cardsCss).toMatch(
        /\[slot='text-body'\][\s\S]*?-webkit-mask-image:\s*none\s*!important;/
      );
      expect(cardsCss).toMatch(/\[slot='text-body'\][\s\S]*?mask-image:\s*none\s*!important;/);
    });

    it('provides generous line clamping for pure text posts and clean 5 lines for media posts', () => {
      // Text posts without media: 10 lines
      expect(cardsCss).toMatch(
        /:not\(:has\(\[slot='post-media-container'\]\)\)[\s\S]*?:is\(\[slot='text-body'\],[\s\S]*?\)\s*\{[\s\S]*?-webkit-line-clamp:\s*10\s*!important;/
      );
      // Media posts with text: 5 lines
      expect(cardsCss).toMatch(
        /:has\(\[slot='post-media-container'\]\)[\s\S]*?:is\(\[slot='text-body'\],[\s\S]*?\)\s*\{[\s\S]*?-webkit-line-clamp:\s*5\s*!important;/
      );
    });

    it('preserves rich text typography: links, bold, code, blockquotes, and lists', () => {
      // Links with accent color
      expect(cardsCss).toMatch(
        /\[slot='text-body'\][\s\S]*?a\s*\{[\s\S]*?color:\s*var\(--rg-accent\)\s*!important;/
      );
      // Code background
      expect(cardsCss).toMatch(/\[slot='text-body'\][\s\S]*?code\s*\{[\s\S]*?border-radius:\s*4px/);
      // Blockquotes with accent border
      expect(cardsCss).toMatch(
        /\[slot='text-body'\][\s\S]*?blockquote\s*\{[\s\S]*?border-left:\s*3px\s+solid/
      );
    });

    it('styles media post captions cleanly', () => {
      expect(cardsCss).toMatch(
        /:is\(\[slot='caption'\],\s*faceplate-caption,\s*figcaption\)[\s\S]*?font-size:\s*0\.8125rem\s*!important;/
      );
    });
  });

  describe('JS: Media Event Handling and Height Detection', () => {
    it('listens to video loadedmetadata, loadeddata, and canplay in Masonry', () => {
      expect(masonrySource).toContain('loadedmetadata');
      expect(masonrySource).toContain('loadeddata');
      expect(masonrySource).toContain('canplay');
    });

    it('preserves explicit iframe dimensions without a universal 16:9 ratio', () => {
      expect(domObserverSource).toContain("node.tagName === 'IFRAME'");
      expect(domObserverSource).toContain("node.getAttribute('width')");
      expect(domObserverSource).toContain("node.getAttribute('height')");
      expect(domObserverSource).toContain('data-rg-embed-ratio');
      expect(cardsCss).toContain('iframe[data-rg-embed-ratio]');
      expect(cardsCss).not.toContain('aspect-ratio: 16 / 9 !important');
    });

    it('detects shreddit-player-2 and video elements in DOMObserver', () => {
      expect(domObserverSource).toContain('shreddit-player-2');
      expect(domObserverSource).toContain("node.tagName === 'VIDEO'");
    });

    it('calculates un-clamped natural ratio from img width and height attributes in DOMObserver', () => {
      expect(domObserverSource).toMatch(
        /Number\(imgWithDims\.getAttribute\('width'\)\)\s*\/\s*Number\(imgWithDims\.getAttribute\('height'\)\)/
      );
    });
  });
});
