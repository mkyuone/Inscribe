// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2023-2026 Mark Yu

import { AppState } from "./types.js";
import { DomRefs } from "./dom-refs.js";

export function updateStatusBar(_state: AppState, _dom: DomRefs) {}

export function setFilenameStatus(_name: string, _dom: DomRefs) {}

export function updateCursorStatus(editor: CodeMirrorEditor, dom: DomRefs) {
  const c = editor.getCursor();
  const selLen = editor.somethingSelected() ? editor.getSelection().length : 0;
  dom.editorStatus.textContent =
    selLen > 0 ? `Ln ${c.line + 1}, Col ${c.ch + 1} · Sel ${selLen}` : `Ln ${c.line + 1}, Col ${c.ch + 1}`;
}
