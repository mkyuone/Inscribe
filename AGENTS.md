# Repository Guidelines

## Project Structure & Module Organization
`src/` contains the TypeScript source for the app. UI and app logic live in `src/app/`, shared helpers live in `src/utils/`, and the Pyodide worker lives in `src/worker/pyodide-worker.ts`. Static assets such as CSS, fonts, CodeMirror, and Pyodide bundles are under `assets/`. End-to-end coverage lives in `tests/smoke.spec.js`. `dist/` is generated output and should be refreshed by the build script whenever source files change.

## Build, Test, and Development Commands
Use `./scripts/build.sh` or `npm run build` to rebuild `dist/` and refresh version metadata. Use `npx playwright test` or `npm run test:e2e` to run the full browser smoke suite. For focused debugging, run a single test, for example: `npx playwright test tests/smoke.spec.js -g "share link copies a working URL"`. Local preview and test runs rely on `scripts/serve.py`, which Playwright starts automatically.

## Coding Style & Naming Conventions
Use 2-space indentation and keep files ASCII unless the file already requires Unicode. Follow the existing TypeScript style: `camelCase` for functions and variables, `PascalCase` for exported types, and short, descriptive filenames such as `tabs.ts` or `workspace-files.ts`. Preserve the SPDX/copyright header format already used in source files. Make changes in `src/` and `assets/`; do not hand-edit `dist/` without rebuilding.

## Testing Guidelines
Playwright is the primary test framework. Add or update smoke coverage when touching workspace flows, modals, Pyodide execution, or share/import/export behavior. Prefer user-facing test names such as `test("workspace removal uses a custom warning modal", ...)`. Run the full suite before shipping behavior changes.

## Commit & Pull Request Guidelines
Recent history favors short imperative subjects, often with prefixes like `chore:` or release-oriented summaries, for example `chore: capture latest work` or `Harden local session recovery`. Keep commits focused. PRs should include a brief behavior summary, testing performed, and screenshots or short clips for visible UI changes.

## Security & Configuration Tips
This app is local-first and depends on bundled Pyodide assets. Be careful when changing file import/export, share links, or session recovery logic. If you update browser tooling, keep Playwright at `1.55.1` or newer to satisfy the current security baseline.
