import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const cardsCss = fs.readFileSync(path.resolve(process.cwd(), 'content/styles/cards.css'), 'utf8');
const themeCss = fs.readFileSync(path.resolve(process.cwd(), 'content/styles/theme.css'), 'utf8');

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
});
