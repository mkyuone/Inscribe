# Inscribe Editor
A single-file lightweight in-browser Python editor and executor using Pyodide.
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

## Modular TypeScript refactor (in progress)
A new Vite + TypeScript scaffold lives at the repo root to break the app into
modules and support local vendor assets. Start the dev server with:

```bash
npm install
npm run dev
```

Vendor assets should be placed under `public/vendor` (see
`public/vendor/README.md` for the suggested layout).

## Why Inscribe?
Designed to be minimal, fast, and distraction-free, ideal for learning or quick Python experiments directly in your browser.

[Learn more about V2](https://log.mkyu.one/posts/inscribe/newinscribe/) <br>
[Learn more about Inscribe Editor](https://log.mkyu.one/posts/inscribe/inscripython/)
<br>

## UI Screenshot
### v2
<p align="left">
  <img src="https://log.mkyu.one/posts/inscribe/inscribe2.png" width="650">
</p>

### Old
<p align="left">
  <img src="https://log.mkyu.one/posts/inscribe/inscribeold.png" width="650">
</p>
