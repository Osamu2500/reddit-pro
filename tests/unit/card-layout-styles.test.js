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
