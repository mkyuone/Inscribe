# Inscribe Editor

[![Version](https://img.shields.io/github/v/tag/mkyuone/Inscribe?style=for-the-badge)](VERSION)
[![Website](https://img.shields.io/website?style=for-the-badge&url=https%3A%2F%2Fpy.mkyu.one)](https://py.mkyu.one)
[![TypeScript](https://img.shields.io/github/languages/top/mkyuone/Inscribe?style=for-the-badge)](https://www.typescriptlang.org/)

Inscribe Editor is a lightweight, in‑browser Python editor and runner powered by Pyodide (WebAssembly).
It’s designed to be minimal, fast, and distraction‑free—ideal for learning, experimenting, or running quick Python snippets directly in your browser.

> [!TIP]
> Inscribe runs fully client‑side and supports blocking `input()` and `time.sleep()` when cross‑origin isolation (COOP/COEP) headers are enabled. For local dev, use `python3 scripts/serve.py`.

👉 Try it online: https://py.mkyu.one  
👉 Self‑host with GitHub Pages or any static host.

## Highlights

- In‑browser Python execution via Pyodide (WASM)
- Blocking `input()` and `time.sleep()` with COOP/COEP enabled
- Focused editor powered by CodeMirror
- Run full scripts, selections, or `# %%` cells
- Console output with basic error highlighting
- Shareable URLs with compressed code payloads
- Print/export with layout controls
- Open/save files using the browser File APIs
- Editor preferences (font sizes, wrap, execution time, layout, theme)
- Resizable editor/console split (vertical or horizontal)
- Persistent settings and draft recovery via `localStorage`
- Light/dark/automatic themes with editor + UI styling

<details>
<summary><strong>Recent changes</strong></summary>

- v3.4: Local version history (diff preview/restore), share link enhancements, and UI polish.
- v3.3: Runtime UX and settings polish.
- v3.2: Worker-based runtime for blocking `input()` and `time.sleep()`. COOP/COEP headers and local dev server.
- v3.1: Shareable URLs with compressed code payloads.
- v3.0: Modular TypeScript source under `src/`, compiled output to `dist/`, and fully vendored assets.

</details>

<details>
<summary><strong>Version history (local) implementation details</strong></summary>

- Stored locally in your browser via IndexedDB (no server sync).
- Autosaves roughly every 15 seconds while you edit (only if content changed).
- Captures on Run, Save, and when loading shared code.
- Retention is count-based: keeps up to ~200 edit snapshots and ~120 output entries, then prunes oldest.

</details>

## Why Inscribe?

Inscribe is intentionally not a full IDE. It’s built to:

- load quickly
- stay out of your way
- run Python safely in the browser
- feel more like a tool than an app

Perfect for learning, demos, or environments where installing Python isn’t ideal.

## Local assets & offline support

- All external JS, CSS, and fonts are vendored under `assets/`
- Pyodide is stored locally at `assets/vendor/pyodide/`
- No CDN required — the app works fully offline once loaded

## Development

Build TypeScript (emits `dist/`):

```sh
./scripts/build.sh
```

Serve locally (Pyodide requires HTTP, not `file://`):

```sh
python3 -m http.server
```

For blocking `input()` and `time.sleep()` support, serve with COOP/COEP headers:

```sh
python3 scripts/serve.py
```
