![Build/Release](https://img.shields.io/badge/Build%2FRelease-passing-brightgreen) ![CodeQL](https://img.shields.io/badge/CodeQL-passing-brightgreen) ![version](https://img.shields.io/badge/version-v1.0.0-blue) ![platform](https://img.shields.io/badge/platform-Windows-lightgrey)

# VNV Maker : The Visual Novel Designer

> The IDE that lets you write, design, and export your story without code.

VNV Maker is a lean, standalone desktop IDE for Ren'Py visual novel development. Your story appears as draggable blocks on a visual canvas — jump and branch connections auto-draw as arrows. Three columns let you see your project from every angle: a visual Event List, a real-time Scene Preview, and a detailed Inspector. A full GUI editor, character sprite manager, asset library, and animation track are all built in.

It works alongside the Ren'Py SDK. Your project is saved as a plain JSON `.vnvmaker` file and exports directly to `.rpy`. No lock-in.

[Watch the Full Walkthrough Video @ YouTube →](https://www.youtube.com/)

[Download the latest release (v1.0.0)](https://github.com/max-pickles/Visual-Novel-Visual-Maker-VNVM/releases/latest)

[Download the latest nightly release (bleeding edge, tread carefully!)](https://github.com/max-pickles/Visual-Novel-Visual-Maker-VNVM/releases)

## Why VNV Maker?

Managing a Ren'Py project in a plain text editor means juggling dozens of `.rpy` files with no way to see the whole picture. You lose track of where jumps lead, which characters appear in which scenes, and whether your branching structure even makes sense. VNV Maker solves this by providing a unified, visual approach to game development.

---

## ✨ Features

| Feature | Description |
|---|---|
| **Story Canvas** | Zoomable node graph showing scenes, branches, and endings |
| **Scene Editor** | 3-column event editor — EventList · ScenePreview · Inspector |
| **Live Preview** | One-click "Play from Here" in Ren'Py with inherited scene state |
| **Character Editor** | Sprite pose management, layered images, side-image support |
| **GUI Editor** | Visual drag-and-drop main menu editor with live preview |
| **Achievement Manager** | Define and wire unlockable achievements to story events |
| **Animation Track** | Keyframe-based ATL animator for sprite movements |
| **Ren'Py Importer** | Parse existing `.rpy` projects with ending-type detection |
| **Full Compiler** | Export valid Ren'Py `.rpy` scripts — no manual editing needed |
| **Diagnostics** | Project validator, variable matrix, bot analyser |

---

## 🏗️ Architecture

```
VNV Maker
├── Frontend  (React 18 + TypeScript + Vite)
│   ├── src/StoryCanvas.tsx      — zoomable node graph (main entry UI)
│   ├── src/SceneEditor.tsx      — scene event editor
│   ├── src/Inspector.tsx        — per-event property panels
│   ├── src/GuiEditor.tsx        — Ren'Py main menu WYSIWYG
│   ├── src/compiler.ts          — VNProject → Ren'Py .rpy string
│   ├── src/rpyImporter.ts       — .rpy files → VNProject
│   ├── src/types.ts             — all data types (VNProject, VNScene, VNEvent…)
│   ├── src/graphLayout.ts       — Sugiyama layered layout algorithm
│   └── src/botAnalyzer.ts       — automated ending & variable analysis
│
├── Backend   (Rust + Tauri 2)
│   └── src-tauri/               — file-system, shell (Ren'Py launcher), dialogs
│
└── Data format
    └── <project>.vnvmaker       — plain JSON (VNProject schema, see types.ts)
```

### Data flow

```
Author authors in StoryCanvas / SceneEditor
        ↓  onProjectChange  (React state)
VNProject JSON  ←→  .vnvmaker file on disk  (auto-save via Tauri fs plugin)
        ↓  compileProject()
script.rpy  →  dropped into Ren'Py game/ folder
        ↓  launchRenpyPreview()
Ren'Py SDK runs the live preview
```

---

## 🚀 Getting Started

### Prerequisites

| Tool | Version | Notes |
|---|---|---|
| [Node.js](https://nodejs.org) | 18 or later | LTS recommended |
| [Rust](https://rustup.rs) | stable | Tauri requires Rust |
| [Ren'Py SDK](https://www.renpy.org/latest.html) | 8.x | For "Play" functionality |

### Clone & Install

```bash
git clone https://github.com/<your-org>/vnvmaker.git
cd vnvmaker
npm install
```

### Run in Development

```bash
npm run tauri dev
```

The app opens automatically. Hot-module reload is active for the React frontend.

### Build for Production

```bash
npm run tauri build
```

The installer is placed in `src-tauri/target/release/bundle/`.

---

## 🎮 Ren'Py SDK Setup

VNV Maker needs to know where your Ren'Py SDK lives to launch previews.

1. Open any project.
2. Click the **⚙ gear icon** in the Scene Editor toolbar (or the SDK status badge).
3. The **SDK Setup Wizard** will scan common paths automatically. If it doesn't find your SDK, click **Browse** and navigate to the folder containing `renpy.exe` (Windows) or `renpy.sh` (macOS/Linux).
4. Click **Save** — your path is stored in `localStorage` and remembered across sessions.

---

## 📁 Project Format

Projects are saved as `.vnvmaker` files — plain JSON conforming to the [`VNProject`](src/types.ts) schema. This means:

- They are **human-readable** and can be diffed in Git.
- They are **fully self-contained** — no external database.
- They are **forward-compatible** — `migrateProject()` fills in missing fields on load.

### Key types

```ts
VNProject      // top-level container (scenes, characters, achievements, layout…)
VNScene        // one scene / label block
VNEvent        // single event row (dialogue, bg, jump, choice, music, animation…)
VNCharacter    // character definition with sprites and display properties
VNAchievement  // achievement definition (name, description, hidden flag)
```

---

## 🔧 Compiler Output

The compiler (`src/compiler.ts`) maps each `VNEvent` type to Ren'Py:

| Event type | Ren'Py output |
|---|---|
| `dialogue` | `charVar "text"` |
| `narration` | `"text"` |
| `choice` | `menu:` block |
| `jump` | `with <trans>` + `jump label` |
| `bg` | `scene expression Transform("file", fit="cover", …)` |
| `image` | `show expression "file" at left/center/right` |
| `music` | `play music "file"` |
| `sfx` | `play sound "file"` |
| `effect` | `with Dissolve(n)` / `Fade` / `Pixellate` |
| `setvar` | `$ name = value` |
| `if` | `if condition:` / `else:` |
| `animation` | `show expression "img": linear N xalign … zoom …` (ATL) |
| `achievement` | `$ achievement.grant("name")` |
| `raw` | verbatim passthrough |

---

## 🗺️ Importer

Drop any existing Ren'Py project's `game/` folder into the import dialog. The importer handles:

- `label` → Scene
- `define X = Character(…)` → Character
- `scene`, `show`, `hide`, `play music`, `with`, `pause`, `jump`, `menu:`
- Complex `if/else` blocks are **captured as Raw Code events** (not silently dropped)
- `$ python` lines are **captured as Raw Code events** with a warning
- ATL blocks (`show X at transform:`) are **captured as Raw Code events**
- Ending-type detection (good/bad/stuck) with 4-stage propagation analysis

---

## 🧪 Tests

```bash
npm test
```

Tests live in `src/__tests__/` and cover the graph layout algorithm and project validator.

---

## 🤝 Contributing

1. Fork the repo and create a feature branch.
2. Follow the existing code style — TypeScript strict mode, React functional components.
3. Add JSDoc comments to any new public functions or complex algorithms.
4. Test with an existing Ren'Py project (e.g. [The Question](https://www.renpy.org/latest.html)) to ensure the importer still works.
5. Open a PR with a clear description of what changed and why.

### File naming conventions

| Pattern | Purpose |
|---|---|
| `PascalCase.tsx` | React component |
| `camelCase.ts` | Pure TypeScript module |
| `*.test.ts` | Jest test file |

---

## 📄 License

CC0 1.0 Universal (Public Domain) — see [LICENSE](LICENSE) for details.  
This means you can copy, modify, and distribute VNV Maker for any purpose, even commercially, without asking permission.

---

## 🙏 Acknowledgements

- [Ren'Py](https://www.renpy.org/) — the engine that powers the exported games
- [Tauri](https://tauri.app/) — the Rust-backed framework that makes this a native app
- [React](https://react.dev/) + [Vite](https://vitejs.dev/) — the frontend stack
