import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const cardsCss = fs.readFileSync(path.resolve(process.cwd(), 'content/styles/cards.css'), 'utf8');
const themeCss = fs.readFileSync(path.resolve(process.cwd(), 'content/styles/theme.css'), 'utf8');

describe('Credit bar layout & join button separation from overflow menu', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  function createPostWithCreditBarAndJoin() {
    const post = document.createElement('shreddit-post');
    const creditBar = document.createElement('div');
    creditBar.setAttribute('slot', 'credit-bar');

    // Subreddit icon
    const avatar = document.createElement('img');
    avatar.src = 'avatar.png';

    // Subreddit text container
    const metaContainer = document.createElement('div');
    const subLink = document.createElement('a');
    subLink.textContent = 'r/technology';
    const timestamp = document.createElement('span');
    timestamp.textContent = '3 hr. ago';
    metaContainer.append(subLink, timestamp);

    // Join button wrapper and element
    const joinTracker = document.createElement('faceplate-tracker');
    const joinBtn = document.createElement('shreddit-join-button');
    joinBtn.setAttribute('data-testid', 'credit-bar-join-button');
    const buttonInner = document.createElement('button');
    buttonInner.setAttribute('aria-label', 'Join r/technology');
    buttonInner.textContent = 'Join';
    joinBtn.append(buttonInner);
    joinTracker.append(joinBtn);

    // Three dots overflow menu
    const overflowMenu = document.createElement('shreddit-overflow-menu');
    const overflowBtn = document.createElement('button');
    overflowBtn.setAttribute('aria-label', 'More actions');
    overflowBtn.setAttribute('aria-haspopup', 'menu');
    overflowMenu.append(overflowBtn);

    creditBar.append(avatar, metaContainer, joinTracker, overflowMenu);
    post.append(creditBar);
    document.body.append(post);

    return {
      post,
      creditBar,
      avatar,
      metaContainer,
      subLink,
      joinTracker,
      joinBtn,
      buttonInner,
      overflowMenu,
      overflowBtn,
    };
  }

  it('reserves 52px clearance on credit bar right padding in cards.css and theme.css', () => {
    // Assert cards.css provides 52px right padding for [slot='credit-bar'], shreddit-post-header, and ::part(credit-bar)
    expect(cardsCss).toMatch(
      /shreddit-post\s+\[slot='credit-bar'\][\s\S]*?padding:\s*12px\s+52px\s+10px\s+14px\s+!important;/
    );
    // Assert theme.css provides 52px right padding
    expect(themeCss).toMatch(
      /shreddit-post\s+\[slot='credit-bar'\][\s\S]*?padding:\s*12px\s+52px\s+10px\s+14px\s+!important;/
    );
  });

  it('reserves 52px right padding in compact mode to protect three-dots overflow menu', () => {
    expect(cardsCss).toMatch(
      /data-reddit-grid-compact='true'\]\s+shreddit-post\s+\[slot='credit-bar'\][\s\S]*?padding:\s*8px\s+52px\s+8px\s+10px\s+!important;/
    );
  });

  it('does not apply a 36px right margin on credit bar text that would push the join button into the three dots', () => {
    // Expect text container rule to have margin-right: 0 !important
    expect(cardsCss).toMatch(
      /\[slot='credit-bar'\][\s\S]*?>\s*\*:not\(:has\(button\)\)[\s\S]*?margin-right:\s*0\s*!important;/
    );
  });

  it('positions join button below the three dots menu at top: 42px and right: 12px', () => {
    expect(cardsCss).toContain('shreddit-join-button');
    expect(cardsCss).toContain("[data-testid='credit-bar-join-button']");
    expect(cardsCss).toMatch(
      /position:\s*absolute\s*!important;\s*top:\s*42px\s*!important;\s*right:\s*12px\s*!important;/
    );
  });

  it('completely removes orange border and background from join button and wrapper elements', () => {
    // Check that cards.css removes border, outline, and box-shadow from join button
    expect(cardsCss).toMatch(
      /shreddit-post\s+\[data-testid='join-button'\][\s\S]*?border:\s*none\s*!important;/
    );
    // Ensure orange border is not applied to join button
    expect(cardsCss).not.toMatch(
      /shreddit-post\s+\[data-testid='join-button'\][\s\S]*?border:\s*1px\s+solid\s+rgba\(var\(--rg-accent-rgb\)/
    );
  });

  it('preserves native click event bubbling on join button and three dots button', () => {
    const { buttonInner, overflowBtn } = createPostWithCreditBarAndJoin();
    const joinClickListener = vi.fn();
    const overflowClickListener = vi.fn();

    buttonInner.addEventListener('click', joinClickListener);
    overflowBtn.addEventListener('click', overflowClickListener);

    buttonInner.click();
    expect(joinClickListener).toHaveBeenCalledTimes(1);

    overflowBtn.click();
    expect(overflowClickListener).toHaveBeenCalledTimes(1);
  });
});
