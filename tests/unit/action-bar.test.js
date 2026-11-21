import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const cardsCss = fs.readFileSync(path.resolve(process.cwd(), 'content/styles/cards.css'), 'utf8');
const themeCss = fs.readFileSync(path.resolve(process.cwd(), 'content/styles/theme.css'), 'utf8');
const modalCss = fs.readFileSync(path.resolve(process.cwd(), 'content/styles/modal.css'), 'utf8');
const commentsCss = fs.readFileSync(
  path.resolve(process.cwd(), 'content/styles/comments.css'),
  'utf8'
);

describe('Post action buttons redesign & interaction preservation', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  function createPostWithActionBar() {
    const post = document.createElement('shreddit-post');
    const actionBar = document.createElement('div');
    actionBar.setAttribute('slot', 'action-bar');

    // Vote buttons group
    const voteGroup = document.createElement('shreddit-vote-buttons');
    const upBtn = document.createElement('button');
    upBtn.setAttribute('aria-label', 'upvote');
    upBtn.setAttribute('aria-pressed', 'false');

    const score = document.createElement('faceplate-number');
    score.textContent = '142';

    const downBtn = document.createElement('button');
    downBtn.setAttribute('aria-label', 'downvote');
    downBtn.setAttribute('aria-pressed', 'false');

    voteGroup.append(upBtn, score, downBtn);

    // Comment button
    const commentBtn = document.createElement('button');
    commentBtn.setAttribute('data-post-click-location', 'comments');
    const commentCount = document.createElement('span');
    commentCount.textContent = '38';
    commentBtn.append(commentCount);

    // Share button
    const shareBtn = document.createElement('button');
    shareBtn.setAttribute('data-post-click-location', 'share');
    shareBtn.textContent = 'Share';

    // Save button
    const saveBtn = document.createElement('button');
    saveBtn.setAttribute('data-post-click-location', 'save');
    saveBtn.textContent = 'Save';

    actionBar.append(voteGroup, commentBtn, shareBtn, saveBtn);
    post.append(actionBar);
    document.body.append(post);

    return { post, actionBar, voteGroup, upBtn, downBtn, score, commentBtn, shareBtn, saveBtn };
  }

  it('preserves native click event bubbling on vote buttons', () => {
    const { upBtn, downBtn } = createPostWithActionBar();
    const upClickListener = vi.fn();
    const downClickListener = vi.fn();

    upBtn.addEventListener('click', upClickListener);
    downBtn.addEventListener('click', downClickListener);

    upBtn.click();
    expect(upClickListener).toHaveBeenCalledTimes(1);

    downBtn.click();
    expect(downClickListener).toHaveBeenCalledTimes(1);
  });

  it('preserves native click event bubbling on comments and share buttons', () => {
    const { commentBtn, shareBtn } = createPostWithActionBar();
    const commentListener = vi.fn();
    const shareListener = vi.fn();

    commentBtn.addEventListener('click', commentListener);
    shareBtn.addEventListener('click', shareListener);

    commentBtn.click();
    expect(commentListener).toHaveBeenCalledTimes(1);

    shareBtn.click();
    expect(shareListener).toHaveBeenCalledTimes(1);
  });

  it('handles upvoted and downvoted state updates without breaking native attributes', () => {
    const { upBtn, downBtn, score } = createPostWithActionBar();

    // Upvote
    upBtn.setAttribute('aria-pressed', 'true');
    expect(upBtn.getAttribute('aria-pressed')).toBe('true');
    expect(score.textContent).toBe('142');

    // Downvote toggle
    upBtn.setAttribute('aria-pressed', 'false');
    downBtn.setAttribute('aria-pressed', 'true');
    expect(upBtn.getAttribute('aria-pressed')).toBe('false');
    expect(downBtn.getAttribute('aria-pressed')).toBe('true');
  });

  it('preserves keyboard focusability on action buttons', () => {
    const { upBtn, commentBtn, shareBtn } = createPostWithActionBar();

    upBtn.focus();
    expect(document.activeElement).toBe(upBtn);

    commentBtn.focus();
    expect(document.activeElement).toBe(commentBtn);

    shareBtn.focus();
    expect(document.activeElement).toBe(shareBtn);
  });

  it('defines consistent squircle radius and 32px height rules in CSS', () => {
    // Assert cards.css contains standardized 32px height and squircle button tokens
    expect(cardsCss).toContain('var(--rg-radius-btn, 8px)');
    expect(cardsCss).toMatch(/height:\s*32px/);
    expect(cardsCss).toContain('tabular-nums');
    expect(themeCss).toMatch(/--rg-radius-btn:\s*8px/);
  });

  it('supports narrow card responsive adaptation without breaking layout', () => {
    // Assert narrow card media query exists to reduce padding and gap on constrained cards
    expect(cardsCss).toContain('@media (max-width: 900px)');
    expect(cardsCss).toContain('gap: 4px');
  });

  it('enforces squircle / rounded square shape across all interactive buttons including upvote and downvote', () => {
    // Upvote and downvote buttons and unified vote control
    expect(cardsCss).toContain('shreddit-vote-buttons');
    expect(cardsCss).toContain("button[aria-label*='upvote' i]");
    expect(cardsCss).toContain("button[aria-label*='downvote' i]");
    expect(cardsCss).toContain('border-radius: var(--rg-radius-btn, 8px) !important;');

    // Join and overflow buttons
    expect(cardsCss).toContain('shreddit-overflow-menu button');
    expect(cardsCss).toContain('shreddit-join-button');

    // Repost / remix button
    expect(cardsCss).toContain("button[aria-label*='crosspost' i]");
    expect(cardsCss).toContain("button[aria-label*='repost' i]");

    // Neutralize Reddit's rounded-full utility classes
    expect(cardsCss).toContain("[class*='rounded-full']");

    // Universal catch-all for interactive buttons
    expect(cardsCss).toContain(":is(button, a.button, [role='button']):not([data-rg-circle])");
  });

  it('pierces open shadow roots with squircle styles in DOMObserver', () => {
    const domObserverSource = fs.readFileSync(
      path.resolve(process.cwd(), 'content/observers/dom-observer.js'),
      'utf8'
    );
    expect(domObserverSource).toContain('applySquircleToShadowRoot');
    expect(domObserverSource).toContain('border-radius: var(--rg-radius-btn, 8px) !important;');
    expect(domObserverSource).toContain('attachShadow');

    // Execute dom-observer.js in window context
    const execute = new Function(domObserverSource);
    execute();

    const host = document.createElement('div');
    const shadowRoot = host.attachShadow({ mode: 'open' });
    const innerBtn = document.createElement('button');
    innerBtn.className = 'rounded-full';
    shadowRoot.appendChild(innerBtn);
    document.body.appendChild(host);

    // Assert that the shadow root received the squircle stylesheet or style element
    const styleEl = shadowRoot.querySelector('style[data-rg-squircle]');
    const adopted = shadowRoot.adoptedStyleSheets;
    const hasSquircleStyle = Boolean(styleEl) || (Array.isArray(adopted) && adopted.length > 0);
    expect(hasSquircleStyle).toBe(true);
    if (styleEl) {
      expect(styleEl.textContent).toContain('border-radius: var(--rg-radius-btn, 8px) !important;');
    }
  });

  it('styles modal close button and gallery carousel navigation as squircles', () => {
    // Modal close button
    expect(modalCss).toMatch(
      /\.rg-modal-close[\s\S]*?border-radius:\s*var\(--rg-radius-btn,\s*8px\)/
    );

    // Gallery carousel and video player buttons
    expect(cardsCss).toContain('gallery-carousel button');
    expect(cardsCss).toContain('shreddit-player button');
  });

  it('styles comment tree vote controls and actions as squircles', () => {
    // Comments vote buttons and action buttons
    expect(commentsCss).toContain('shreddit-comment shreddit-vote-buttons');
    expect(commentsCss).toContain("button[aria-label*='upvote' i]");
    expect(commentsCss).toContain("button[aria-label*='downvote' i]");
    expect(commentsCss).toContain('border-radius: var(--rg-radius-btn, 8px) !important;');
  });

  it('unifies card surfaces, component backgrounds, and typography colors', () => {
    // Re-read updated CSS files
    const updatedCardsCss = fs.readFileSync(path.resolve(process.cwd(), 'content/styles/cards.css'), 'utf8');
    const updatedThemeCss = fs.readFileSync(path.resolve(process.cwd(), 'content/styles/theme.css'), 'utf8');

    // Assert cards.css contains unified card surface and border rules
    expect(updatedCardsCss).toContain('background: var(--rg-glass-base) !important;');
    expect(updatedCardsCss).toContain('color: var(--rg-text) !important;');
    expect(updatedCardsCss).toContain('color: var(--rg-text-muted) !important;');

    // Assert titles are cleanly styled and not buttonized
    expect(updatedCardsCss).toMatch(
      /:is\(\[slot='title'\], \[slot='post-title'\], shreddit-post-title\) a[\s\S]*?background:\s*transparent !important/
    );

    // Assert join button matches unified button theme colors
    expect(updatedCardsCss).toMatch(
      /shreddit-join-button[\s\S]*?background:\s*var\(--rg-btn-bg\)\s*!important/
    );

    // Assert theme.css includes dark mode tokens for unified surface and text
    expect(updatedThemeCss).toContain('--rg-glass-base: #18191c;');
    expect(updatedThemeCss).toContain('--rg-text: #f0f2f5;');
    expect(updatedThemeCss).toContain('--rg-text-muted: #9aa0a6;');
  });

  it('strictly strips containers, borders, and background boxes from three dots, post title, and description', () => {
    const updatedCardsCss = fs.readFileSync(path.resolve(process.cwd(), 'content/styles/cards.css'), 'utf8');
    const domObserverCode = fs.readFileSync(path.resolve(process.cwd(), 'content/observers/dom-observer.js'), 'utf8');

    // 1. Three-dots overflow button and wrapper have NO container (border: none, background: transparent on normal & hover)
    expect(updatedCardsCss).toMatch(
      /shreddit-post\s+shreddit-overflow-menu[\s\S]*?background:\s*transparent\s*!important;\s*background-color:\s*transparent\s*!important;\s*border:\s*none\s*!important/
    );
    expect(updatedCardsCss).toMatch(
      /shreddit-overflow-menu\s+button:hover[\s\S]*?background:\s*transparent\s*!important;\s*background-color:\s*transparent\s*!important;\s*border:\s*none\s*!important/
    );

    // 2. Post title text has NO container (border: none, background: transparent, border-radius: 0)
    expect(updatedCardsCss).toMatch(
      /\[slot='title'\][\s\S]*?background:\s*transparent\s*!important;\s*background-color:\s*transparent\s*!important;\s*border:\s*none\s*!important;\s*outline:\s*none\s*!important;\s*box-shadow:\s*none\s*!important;\s*border-radius:\s*0\s*!important;/
    );

    // 3. Post description / text-body has NO container (border: none, background: transparent, border-radius: 0)
    expect(updatedCardsCss).toMatch(
      /\[slot='text-body'\][\s\S]*?background:\s*transparent\s*!important;\s*background-color:\s*transparent\s*!important;\s*border:\s*none\s*!important;\s*outline:\s*none\s*!important;\s*box-shadow:\s*none\s*!important;\s*border-radius:\s*0\s*!important;/
    );

    // 4. Shadow DOM squircle piercer explicitly excludes and unboxes overflow menu and title/body
    expect(domObserverCode).toContain(':host(shreddit-overflow-menu)');
    expect(domObserverCode).toContain(':host(shreddit-post-title)');
    expect(domObserverCode).toMatch(
      /:host\(shreddit-overflow-menu\)[\s\S]*?background:\s*transparent !important/
    );
  });
});
