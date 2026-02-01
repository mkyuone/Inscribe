# Inscribe Editor

Inscribe Editor is a lightweight, in‑browser Python editor and runner powered by Pyodide (WebAssembly).
It’s designed to be minimal, fast, and distraction‑free—ideal for learning, experimenting, or running quick Python snippets directly in your browser.

> [!IMPORTANT]
> Inscribe runs fully client‑side and supports blocking `input()` and `time.sleep()` when cross‑origin isolation (COOP/COEP) headers are enabled.

👉 Try it online: https://py.mkyu.one  
👉 Self‑host with GitHub Pages or any static host.

## Highlights

- In‑browser Python execution via Pyodide (WASM)
- Focused editor powered by CodeMirror
- Run full scripts or selected code (`# %%` cells supported)
- Console output with basic error highlighting
- Open/save files using the browser File APIs
- Persistent settings and draft recovery via `localStorage`

<details>
<summary><strong>Recent changes</strong></summary>

- v3.2: Worker-based runtime for blocking `input()` and `time.sleep()`. COOP/COEP headers and local dev server.
- v3.1: Shareable URLs with compressed code payloads.
- v3.0: Modular TypeScript source under `src/`, compiled output to `dist/`, and fully vendored assets.

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
