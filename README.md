# Reddit Pro — Chrome Extension

A premium Chrome extension that transforms Reddit's linear feed into a beautiful, fully customizable **masonry grid layout** with glassmorphic card design, smart audio focus, and clean browsing features.

---

## ✨ Features

- **Masonry Grid Layout** — 2–6 configurable columns with natural card heights
- **Glassmorphic Cards** — Frosted glass aesthetic with hover lift animations
- **Smart Auto-Play Audio** — Mutes all videos except the one closest to your viewport center
- **Infinite Scroll Compatible** — No scroll-to-top jumps; Reddit's virtual scroller is fully preserved
- **Post Open/Close Stable** — Opening a post thread reverts to linear; closing restores your grid
- **Hide Ads / Promoted Posts** — Completely removes sponsored content
- **Hide Left Sidebar** — Full-width feed mode
- **Compact Mode** — Tighter cards with hidden text body
- **Auto Fit (Ultrawide)** — Automatically scales columns at 1400px / 1800px / 2200px
- **Scrollbar Hide** — Clean, distraction-free browsing
- **Keyboard Shortcuts** — `Alt+1` through `Alt+6` to switch column count instantly

---

## 🚀 Installation

1. Clone or download this repository
2. Open Chrome and go to `chrome://extensions`
3. Enable **Developer mode** (top right toggle)
4. Click **Load unpacked**
5. Select the `reddit-grid-extension` folder
6. Navigate to [reddit.com](https://reddit.com) — the grid applies automatically!

---

## 🛠 Project Structure

```
reddit-grid-extension/
├── manifest.json          # Extension manifest (MV3)
├── content/
│   ├── content.js         # Core logic: masonry, routing, observers, audio
│   └── grid.css           # Static stylesheet injected at document_start
├── popup/
│   ├── popup.html         # Extension popup UI
│   ├── popup.css          # Popup styling
│   └── popup.js           # Popup settings logic
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## 🧠 Architecture

- **Static CSS injection** at `document_start` eliminates flash of unstyled content (FOUC)
- **CSS custom properties** (`--reddit-cols`, `--reddit-gap`) drive all layout changes — no style tag re-injection
- **LifecycleManager** coordinates all observers as a single unit — halted on post threads, resumed on feeds
- **MasonryManager** uses a `ResizeObserver` with rAF-batching to compute `grid-row-end` spans without layout thrash
- **SPA Navigation** intercepted via `pushState`/`replaceState` patching + `popstate` + title observer + interval fallback
- **faceplate-batch** elements remain as sub-grid containers (NOT `display:contents`) to preserve Reddit's IntersectionObserver bounding boxes for infinite scroll

---

## 📝 Changelog

### v2.0
- Fixed: Cards stuck at top after hard refresh (multi-sweep masonry boot)
- Fixed: Page jumping to top during infinite scroll (faceplate-batch bounding box preserved)
- Fixed: UI reverting to default after opening/closing a post (routing logic rebuilt from userSettings)
- Fixed: Extension settings not persisting as the true default view
- Fixed: Sidebar label corrected to "Left Sidebar"
- Added: `pushState`/`replaceState` interception for reliable SPA navigation detection
- Renamed: Extension rebranded to **Reddit Pro**

### v1.1
- Initial release with grid layout, masonry, glassmorphic design

---

## 📄 License

MIT
