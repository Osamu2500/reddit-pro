import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const themeCss = fs.readFileSync(path.resolve(process.cwd(), 'content/styles/theme.css'), 'utf8');
const layoutCss = fs.readFileSync(path.resolve(process.cwd(), 'content/styles/layout.css'), 'utf8');

describe('Feed card presentation and positioning styles', () => {
  it('defines a distinct card surface with hover and keyboard focus feedback', () => {
    expect(themeCss).toContain('CARD PRESENTATION V2');
    expect(themeCss).toContain('border-radius: 16px !important');
    expect(themeCss).toContain('transform: translateY(-2px) !important');
    expect(themeCss).toContain(':focus-within');
  });

  it('uses consistent feed spacing and top-aligned stretched grid items', () => {
    expect(layoutCss).toContain('--reddit-col-gap: 16px');
    expect(layoutCss).toContain('--reddit-row-gap: 16px');
    expect(layoutCss).toContain('align-content: start !important');
    expect(layoutCss).toContain('justify-items: stretch !important');
  });
});


describe('Post card content polish', () => {
  it('improves title/body hierarchy without fading away post text', () => {
    const cardsCss = fs.readFileSync(path.resolve(process.cwd(), 'content/styles/cards.css'), 'utf8');
    expect(cardsCss).toContain('CARD CONTENT POLISH');
    expect(cardsCss).toContain('font-weight: 650 !important');
    expect(cardsCss).toContain('line-height: 1.55 !important');
    expect(cardsCss).toContain('-webkit-mask-image: none !important');
  });

  it('keeps media inset and action controls usable at narrow widths', () => {
    const cardsCss = fs.readFileSync(path.resolve(process.cwd(), 'content/styles/cards.css'), 'utf8');
    expect(cardsCss).toContain('width: calc(100% - 20px) !important');
    expect(cardsCss).toContain('min-height: 48px !important');
    expect(cardsCss).toContain('outline-offset: 2px !important');
  });

  it('removes container boxes, pill backgrounds, and borders from card title and text', () => {
    const cardsCss = fs.readFileSync(path.resolve(process.cwd(), 'content/styles/cards.css'), 'utf8');
    expect(cardsCss).toContain('background: transparent !important');
    expect(cardsCss).toContain('border: none !important');
    expect(cardsCss).toContain('box-shadow: none !important');
    expect(cardsCss).toContain('border-radius: 0 !important');
    expect(themeCss).toContain('background: transparent !important');
  });

  it('styles the three-dots overflow button cleanly in the credit bar', () => {
    const cardsCss = fs.readFileSync(path.resolve(process.cwd(), 'content/styles/cards.css'), 'utf8');
    expect(cardsCss).toContain('THREE-DOTS OVERFLOW BUTTON');
    expect(cardsCss).toContain('shreddit-overflow-menu');
    expect(cardsCss).toContain('border-radius: var(--rg-radius-btn, 8px) !important');
  });

  it('prevents huge top gaps by not forcing shreddit-app into a grid or inflating partials', () => {
    expect(layoutCss).toContain('--reddit-sidebar-width: 0px');
    expect(layoutCss).toContain('):not(shreddit-app)');
    expect(layoutCss).not.toContain('faceplate-partial:not(:has(shreddit-post');
    expect(layoutCss).toContain('community-recommendations');
    expect(layoutCss).toContain('div:has(> faceplate-tab-group)');
  });

  it('positions feed tabs and content below the fixed topbar without clipping', () => {
    expect(layoutCss).toContain('--reddit-topbar-height: var(--shreddit-header-height, 56px)');
    expect(layoutCss).toContain('padding-top: var(--reddit-topbar-height, 56px) !important');
    expect(layoutCss).toMatch(/main\s*\{[\s\S]*?padding-top:\s*var\(--reddit-topbar-height,\s*56px\)\s*!important/);
    expect(layoutCss).toMatch(/faceplate-tab-group[\s\S]*?margin-bottom:\s*12px\s*!important/);
    expect(layoutCss).toMatch(/sticky[\s\S]*?top:\s*var\(--reddit-topbar-height,\s*56px\)\s*!important/);
  });
});
