# VNV Maker — Architectural Guidelines & Developer Handbook

This document serves as the master reference for the architecture, technology stack, and coding conventions used in **VNV Maker**. It is designed to preserve context across development sessions and ensure consistency.

---

## 1. Core Concept & Objective
**VNV Maker** is a professional, node-based visual Integrated Development Environment (IDE) that authors use to create visual novels. The defining feature of VNV Maker is that it **compiles directly into native Ren'Py code**. It bridges the gap between visual flowchart authoring (like Twine or articy:draft) and the industry-standard Ren'Py engine.

---

## 2. Technology Stack
*   **Frontend**: React 18, TypeScript, Vite.
*   **Styling**: Pure CSS (no Tailwind). Heavily relies on global CSS variables for theming.
*   **Desktop Container & Backend**: Tauri (Rust) for native file system access, window management, and native performance.
*   **Target Engine**: Ren'Py (Visual Novel Engine).

---

## 3. The "Single Source of Truth" Data Model
The entire application state revolves around the `VNProject` object (defined in `types.ts`).

### `VNProject` Structure
*   **`scenes`**: An array of `VNScene` objects. A scene represents a single visual node on the canvas.
    *   **`events`**: An array of sequential actions inside a scene (e.g., `dialogue`, `bg`, `image`, `jump`, `choice`, `setvar`, `if`). This mimics the linear execution of a Ren'Py label.
*   **`folders`**: Organizational units on the canvas to group scenes.
*   **`characters`**: The cast of the game, including their specific name colors and associated voice directories.
*   **`layout`**: A dictionary mapping scene IDs to their `[X, Y]` coordinates on the infinite canvas.

**Important Rule:** The `VNProject` is fully serializable to a `.vnv` JSON file. *Never store domain state outside of the project object if it needs to be saved.*

---

## 4. Key UI Components & Architecture

### `StoryCanvas.tsx`
*   The heart of the application: an infinite panning/zooming node graph.
*   **Performance Optimization**: High-frequency updates (like panning and zooming) use React `useRef` and `requestAnimationFrame` (RAF) to bypass React's render cycle, updating DOM styles directly to maintain 60 FPS.
*   **Dynamic Visuals**: Edges and connections are rendered as SVG cubic beziers. Their color (green for good, red for bad, pink for choice) is determined dynamically by the `botAnalyzer.ts` reachability engine.

### `Inspector.tsx`
*   A context-sensitive sidebar.
*   If a node is selected, it shows the **Scene Editor** (allowing drag-and-drop reordering of events).
*   If an event is selected, it shows properties specific to that event type (e.g., audio pickers for music events, text areas for dialogue).

### `AssetBrowser.tsx`
*   Interfaces with Tauri APIs to read the user's project directory (`images/`, `audio/`, `gui/`).
*   Provides drag-and-drop functionality to assign assets to events.

### `compiler.ts`
*   The transpiler. It reads the `VNProject` and generates the actual `.rpy` scripts (like `script.rpy`, `options.rpy`, `gui.rpy`) using string manipulation. It handles variable initialization (`default` keyword) and translates visual nodes into Ren'Py `label` and `menu` blocks.

---

## 5. UI/UX & Styling Conventions (The "Magic Palette")
VNV Maker supports extensive theming (Light mode, Dark mode, Solarized, Nord, etc.). 
**Failure to follow these CSS rules will break theme consistency:**

1.  **NO HARDCODED COLORS**: Never use raw hex codes (e.g., `#00d4c8`) or raw RGBA strings in components.
2.  **Semantic Variables**: Always use the CSS variables defined in `index.css`:
    *   `var(--bg0)` to `var(--bg4)`: Background elevations (darkest to lightest).
    *   `var(--text)`, `var(--dim)`, `var(--faint)`: Typography hierarchy.
    *   `var(--teal)`, `var(--acc)`, `var(--acc2)`: Primary brand colors.
    *   `var(--err)`, `var(--warn)`, `var(--ok)`: Status colors.
3.  **Transparencies**: If you need a transparent version of a theme color, **DO NOT** convert it to RGBA. Use the modern CSS `color-mix()` function.
    *   *Correct*: `background: "color-mix(in srgb, var(--teal) 15%, transparent)"`
    *   *Incorrect*: `background: "rgba(0, 212, 200, 0.15)"`

---

## 6. Logic Engines

*   **`botAnalyzer.ts`**: The "Reachability Engine". It performs structural graph traversal (BFS/DFS) to determine which scenes lead to specific Endings (Good, Bad, Stuck). It automatically tags edges so the UI can visually indicate golden paths and dead ends.
*   **`sceneGraphUtils.ts`**: Handles complex layout algorithms (Sugiyama flow, Radial Hub-and-Spoke, Force-Directed) and "State Inheritance" (figuring out what background image and music track should be playing in Scene D based on what happened in Scenes A, B, and C).

---

## 7. Interaction Patterns
*   **The "Next" Methodology**: When pair programming, wait for the user to say "next" before automatically moving to the next uncompleted task in the `task.md` roadmap. 
*   **Artifacts**: Maintain a `task.md` for task tracking and a `walkthrough.md` to document implemented features for user verification.

---
*Created to maintain architectural integrity for VNV Maker v1.0.*
