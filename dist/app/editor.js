// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2023-2026 Mark Yu
import { LS_KEYS } from "../constants.js";
import { byId, debounce } from "../utils/dom.js";
import { safeLS } from "../utils/storage.js";
export function createEditorController(dom, prefs, onDirtyChange, onChange) {
    const editor = CodeMirror.fromTextArea(byId("editor"), {
        mode: "python",
        theme: "eclipse",
        lineNumbers: true,
        indentUnit: 4,
        matchBrackets: true,
        viewportMargin: Infinity,
        lineWrapping: !!prefs.lineWrap
    });
    let lastSavedContent = editor.getValue();
    const saveDraftDebounced = debounce(() => {
        safeLS.set(LS_KEYS.DRAFT, editor.getValue());
    }, 200);
    editor.on("change", () => {
        const curr = editor.getValue();
        onDirtyChange(curr !== lastSavedContent);
        saveDraftDebounced();
        onChange === null || onChange === void 0 ? void 0 : onChange();
    });
    function getCurrentCellCode() {
        const cursor = editor.getCursor();
        const total = editor.lineCount();
        let startLine = 0;
        for (let i = cursor.line; i >= 0; i -= 1) {
            if (editor.getLine(i).trim().startsWith("# %%")) {
                startLine = i + 1;
                break;
            }
        }
        let endLine = total;
        for (let i = cursor.line + 1; i < total; i += 1) {
            if (editor.getLine(i).trim().startsWith("# %%")) {
                endLine = i;
                break;
            }
        }
        return editor.getRange({ line: startLine, ch: 0 }, { line: endLine, ch: 0 });
    }
    function getCodeForMode(mode) {
        if (mode === "cell")
            return getCurrentCellCode();
        if (mode === "selection") {
            if (!editor.somethingSelected())
                return null;
            return editor.getSelection();
        }
        return editor.getValue();
    }
    function markSaved() {
        lastSavedContent = editor.getValue();
        onDirtyChange(false);
    }
    return {
        editor,
        getCodeForMode,
        getValue: () => editor.getValue(),
        setValue: (value) => editor.setValue(value),
        markSaved,
        focus: () => editor.focus(),
        refresh: () => editor.refresh()
    };
}
