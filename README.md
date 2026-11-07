# Reddit Pro — Chrome Extension

Reddit Pro is a Manifest V3 Chrome extension that adds a configurable grid and browsing enhancements to Reddit.

## Features

- **Responsive grid layout** — choose 1–10 columns; narrow viewports automatically cap the effective column count.
- **Masonry cards** — uses card measurements to size grid rows as post content and media load.
- **Glass-style cards** — visual card styling and hover effects.
- **Smart audio focus** — gives audio focus to the visible Reddit player nearest the viewport center when enabled.
- **Promoted-post hiding** — hides Reddit ad and promoted-post elements.
- **Left-sidebar control** — optionally hide the left navigation/sidebar to widen the feed.
- **Compact cards** — reduce post-body and metadata space.
- **Auto Fit** — scale the column count on wide displays.
- **Scrollbar control** — hide the page scrollbar without disabling scrolling.
- **Post modal** — open eligible post links in a modal while preserving the feed's scroll position.
- **Post statistics** — batch-load Reddit post metadata and display the upvote ratio and OC marker where the post layout exposes a credit bar.
- **Theme support** — system, light, and dark theme settings are supported by the settings layer.

The filtering module supports keyword, flair, and media-type rules and persists them in extension storage. It currently exposes a content-script API; a dedicated popup editor for those rules is not yet included.

## Installation

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode**.
4. Select **Load unpacked**.
5. Choose the repository folder containing `manifest.json`.
6. Open Reddit and configure the extension from its toolbar popup.

## Project structure

```text
.
├── manifest.json
├── content/
│   ├── core/
│   │   ├── error-boundary.js
│   │   ├── lifecycle.js
│   │   └── settings.js
│   ├── features/
│   │   ├── filters.js
│   │   ├── post-modal.js
│   │   └── stats-injector.js
│   ├── layout/
│   │   ├── css-vars.js
│   │   ├── masonry.js
│   │   └── virtualizer.js
│   ├── observers/
│   │   ├── audio-observer.js
│   │   └── dom-observer.js
│   └── styles/
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── tests/
│   └── unit/
└── types/
    └── global.d.ts
```

## Architecture notes

- **Manifest V3 injection:** Reddit styles and content scripts are declared in `manifest.json` and injected at `document_start`.
- **Settings:** `Settings` merges stored preferences with defaults and supports temporary route overrides (for example, switching to one column on a post thread).
- **SPA lifecycle:** `Lifecycle` watches History API changes, `popstate`, `hashchange`, and document-title mutations to switch between feed and thread behavior.
- **DOM discovery:** `DOMObserver` watches the document root with a `MutationObserver`, scans already-present posts when it starts, and batches mutation work with animation frames.
- **Masonry:** `Masonry` uses `ResizeObserver` and animation-frame batching to calculate grid row spans as post content changes.
- **Feed batches:** selected Reddit batch wrappers are currently flattened with `display: contents` so cards can participate in one continuous grid. This is a compatibility-sensitive area because Reddit also uses these wrappers for feed loading and intersection observation; it needs regression testing against live Reddit pages.
- **Virtualizer:** `virtualizer.js` is currently a deprecated compatibility stub, not an active virtualization engine.

## Development

Requires Node.js 20 or newer.

```bash
npm ci
npm run lint
npm run typecheck
npm test
```

GitHub Actions runs the same quality checks on pushes and pull requests to `master`. Dependency advisories are also reported in CI; the security-maintenance workflow can regenerate the lockfile, apply compatible fixes, and commit them only after lint, type checks, and tests pass.

## License

MIT
