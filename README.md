# Inscribe Editor

Inscribe Editor is a lightweight, in-browser Python editor and executor powered by Pyodide (WebAssembly).  
It’s designed to be minimal, fast, and distraction-free — ideal for learning, experimenting, or running quick Python snippets directly in your browser.

👉 **Try it online:** https://py.mkyu.one  
👉 You can also host it yourself using GitHub Pages or any static host.


## Features

- In-browser Python execution via **Pyodide (WASM)**
- Simple, focused code editor powered by **CodeMirror**
- Run full scripts or selected code (`# %%` cells supported)
- Clear output console with basic error highlighting
- Open and save files using browser File APIs
- Persistent settings and draft recovery via `localStorage`


## What’s New in v3

- Modular TypeScript source under `src/`
- Compiled output emitted to `dist/`
- All external JS, CSS, and fonts vendored locally under `assets/`
- Local-first loading for Pyodide + CodeMirror (no CDN required)

v3 is a structural refactor — behavior and UI remain familiar, but the codebase is cleaner, more maintainable, and ready for future features.


<details>
<summary><strong>Changes in v2</strong></summary>

- Cleaner, more focused UI
- Improved editor and console readability
- Status bar with execution state and cursor info
- Better handling of partial code execution
- Persistent editor preferences via <code>localStorage</code>

</details>


## Why Inscribe?

Inscribe is intentionally not a full IDE.

It’s built to:
- load quickly
- stay out of your way
- run Python safely in the browser
- feel more like a *tool* than an app

Perfect for learning, demos, or environments where installing Python isn’t ideal.



## Background

- [Inscribe Editor v2 overview](https://log.mkyu.one/posts/inscribe/newinscribe/)
- [Original Inscribe Editor write-up](https://log.mkyu.one/posts/inscribe/inscripython/)



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
npm exec --yes --package typescript@5.4.5 tsc -- --project tsconfig.json
```

### Serve locally

Pyodide requires HTTP (not <code>file://</code>):

```sh
python3 -m http.server
```

</details>

<details> <summary><strong>UI Screenshots</strong></summary>
v2.0
<p align="left"> <img src="https://log.mkyu.one/posts/inscribe/inscribe2.png" width="650"> </p>
v1.0
<p align="left"> <img src="https://log.mkyu.one/posts/inscribe/inscribeold.png" width="650"> </p> </details>
