# Inscribe Editor
A lightweight in-browser Python editor and executor using Pyodide.
Try it out at [py.mkyu.one](https://py.mkyu.one/)!  
Feel free to [host this on your own GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site).

## Features
- In-browser Python execution (WebAssembly via Pyodide)
- Simple code editor powered by CodeMirror
- Run full scripts or selected code (`# %%` supported)
- Clear output console with basic error highlighting
- Open and save files using browser file APIs
- Persistent settings and draft recovery

## v2 Changes
- Cleaner, more focused UI
- Improved editor and console readability
- Status bar with execution state and cursor info
- Better handling of partial code execution
- Persistent editor preferences via `localStorage`

## Why Inscribe?
Designed to be minimal, fast, and distraction-free, ideal for learning or quick Python experiments directly in your browser.

[Learn more about V2](https://log.mkyu.one/posts/inscribe/newinscribe/) <br>
[Learn more about Inscribe Editor](https://log.mkyu.one/posts/inscribe/inscripython/)
<br>

## Local assets
- External JS/CSS/fonts are vendored under `assets/` for offline/local use.
- Pyodide files live in `assets/vendor/pyodide/` and are loaded locally.

## Development
Build the TypeScript into `dist/`:
```sh
npm exec --yes --package typescript@5.4.5 tsc -- --project tsconfig.json
```

Serve locally (Pyodide requires HTTP, not `file://`):
```sh
python3 -m http.server
```

## UI Screenshot
### v2
<p align="left">
  <img src="https://log.mkyu.one/posts/inscribe/inscribe2.png" width="650">
</p>

### Old
<p align="left">
  <img src="https://log.mkyu.one/posts/inscribe/inscribeold.png" width="650">
</p>
