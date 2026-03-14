// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2023-2026 Mark Yu

import { byId } from "../utils/dom.js";
import { DomRefs } from "./dom-refs.js";
import { Prefs, RunMode } from "./types.js";

export type EditorController = {
  editor: CodeMirrorEditor;
  getCodeForMode: (mode: RunMode) => string | null;
  getValue: () => string;
  setValue: (value: string) => void;
  loadDocument: (value: string, savedValue?: string) => void;
  markSaved: () => void;
  focus: () => void;
  refresh: () => void;
};

export function createEditorController(
  dom: DomRefs,
  prefs: Prefs,
  onDirtyChange: (isDirty: boolean) => void,
  onChange?: () => void
): EditorController {
  const editor = CodeMirror.fromTextArea(byId<HTMLTextAreaElement>("editor"), {
    mode: "python",
    theme: "eclipse",
    lineNumbers: true,
    indentUnit: 4,
    matchBrackets: true,
    viewportMargin: Infinity,
    lineWrapping: !!prefs.lineWrap,
    screenReaderLabel: "Python code editor"
  });

  let lastSavedContent = editor.getValue();
  let suppressChange = false;
  let activeLineHandle: CodeMirrorLineHandle | null = null;

  function clearActiveLine() {
    if (!activeLineHandle) return;
    activeLineHandle = editor.removeLineClass(
      activeLineHandle,
      "background",
      "CodeMirror-activeline-background"
    );
    activeLineHandle = null;
  }

  function syncActiveLine() {
    clearActiveLine();
    if (editor.somethingSelected()) return;
    activeLineHandle = editor.addLineClass(
      editor.getCursor().line,
      "background",
      "CodeMirror-activeline-background"
    );
  }

  editor.on("change", () => {
    if (suppressChange) return;
    const curr = editor.getValue();
    onDirtyChange(curr !== lastSavedContent);
    onChange?.();
  });
  editor.on("cursorActivity", syncActiveLine);
  editor.on("focus", syncActiveLine);
  editor.on("blur", clearActiveLine);

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

  function getCodeForMode(mode: RunMode) {
    if (mode === "cell") return getCurrentCellCode();

    if (mode === "selection") {
      if (!editor.somethingSelected()) return null;
      return editor.getSelection();
    }

    return editor.getValue();
  }

  function markSaved() {
    lastSavedContent = editor.getValue();
    onDirtyChange(false);
  }

  function loadDocument(value: string, savedValue = value) {
    suppressChange = true;
    editor.setValue(value);
    suppressChange = false;
    lastSavedContent = savedValue;
    onDirtyChange(value !== savedValue);
    syncActiveLine();
  }

  syncActiveLine();

  return {
    editor,
    getCodeForMode,
    getValue: () => editor.getValue(),
    setValue: (value: string) => editor.setValue(value),
    loadDocument,
    markSaved,
    focus: () => editor.focus(),
    refresh: () => editor.refresh()
  };
}
