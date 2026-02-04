// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2023-2026 Mark Yu
import { setClass } from "../utils/dom.js";
export function updateStatusBar(state, dom) {
    dom.sbRun.innerHTML = `<span class="sbDot"></span><strong>${state.isRunning ? "Running" : "Ready"}</strong>`;
    setClass(dom.sbRun, state.isRunning ? "warn" : "good");
    dom.sbDirty.innerHTML = `<span class="sbDot"></span><strong>${state.isDirty ? "Unsaved" : "Saved"}</strong>`;
    setClass(dom.sbDirty, state.isDirty ? "warn" : "good");
    dom.sbPy.innerHTML = `<span class="sbDot"></span><strong>${state.pyodideReady ? "Pyodide: ready" : "Pyodide: not loaded"}</strong>`;
    setClass(dom.sbPy, state.pyodideReady ? "good" : "bad");
}
export function setFilenameStatus(name, dom) {
    dom.fileMeta.textContent = name;
    dom.sbFile.textContent = name;
}
export function updateCursorStatus(editor, dom) {
    const c = editor.getCursor();
    dom.sbPos.textContent = `Ln ${c.line + 1}, Col ${c.ch + 1}`;
    const selLen = editor.somethingSelected() ? editor.getSelection().length : 0;
    dom.sbSel.textContent = `Sel ${selLen}`;
}
