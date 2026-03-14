// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2023-2026 Mark Yu
export function updateStatusBar(_state, _dom) { }
export function setFilenameStatus(_name, _dom) { }
export function updateCursorStatus(editor, dom) {
    const c = editor.getCursor();
    const selLen = editor.somethingSelected() ? editor.getSelection().length : 0;
    dom.editorStatus.textContent =
        selLen > 0 ? `Ln ${c.line + 1}, Col ${c.ch + 1} · Sel ${selLen}` : `Ln ${c.line + 1}, Col ${c.ch + 1}`;
}
