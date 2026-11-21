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
});
