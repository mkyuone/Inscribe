# Inscribe Editor

Inscribe Editor is a lightweight, in-browser Python editor and executor powered by Pyodide (WebAssembly).  
It’s designed to be minimal, fast, and distraction-free — ideal for learning, experimenting, or running quick Python snippets directly in your browser.

> [!IMPORTANT]
> Inscribe runs fully client-side and supports blocking <code>input()</code> and <code>time.sleep()</code> when cross-origin isolation (COOP/COEP) headers are enabled.

👉 **Try it online:** https://py.mkyu.one  
👉 You can also host it yourself using GitHub Pages or any static host.


## Features

- In-browser Python execution via **Pyodide (WASM)**
- Simple, focused code editor powered by **CodeMirror**
- Run full scripts or selected code (`# %%` cells supported)
- Clear output console with basic error highlighting
- Open and save files using browser File APIs
- Persistent settings and draft recovery via `localStorage`


## Changelog

### v3.2
- Worker-based runtime for blocking input() and time.sleep()
- Cross-origin isolation headers and local COOP/COEP dev server

### v3.1
- Shareable URLs with compressed code payloads

### v3.0
- Modular TypeScript source under `src/`
- Compiled output emitted to `dist/`
- All external JS, CSS, and fonts vendored locally under `assets/`
- Local-first loading for Pyodide + CodeMirror (no CDN required)
- Structural refactor with familiar UI/behavior and a cleaner codebase

### v2.0
- Cleaner, more focused UI
- Improved editor and console readability
- Status bar with execution state and cursor info
- Better handling of partial code execution
- Persistent editor preferences via <code>localStorage</code>


## Why Inscribe?

Inscribe is intentionally not a full IDE.

It’s built to:
- load quickly
- stay out of your way
- run Python safely in the browser
- feel more like a *tool* than an app

Perfect for learning, demos, or environments where installing Python isn’t ideal.


<details>
<summary><strong>Local assets & offline support</strong></summary>

- All external JS, CSS, and fonts are vendored under <code>assets/</code>
- Pyodide is stored locally at <code>assets/vendor/pyodide/</code>
- No CDN is required — the app works fully offline once loaded

</details>



<details>
<summary><strong>Development</strong></summary>

### Build TypeScript
Compile the TypeScript source into <code>dist/</code>:

```sh
./scripts/build.sh
```

### Serve locally

Pyodide requires HTTP (not <code>file://</code>):

```sh
python3 -m http.server
```

For blocking <code>input()</code> and <code>time.sleep()</code> support, you must serve with
COOP/COEP headers (cross-origin isolation). Use the included helper:

```sh
python3 scripts/serve.py
```

</details>
