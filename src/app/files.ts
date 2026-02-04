// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2023-2026 Mark Yu

import { DomRefs } from "./dom-refs.js";

export type FileController = {
  openFile: () => void;
  saveFile: () => void;
  setFilename: (name: string) => void;
  getFilename: () => string;
};

export function createFileController(
  dom: DomRefs,
  editor: CodeMirrorEditor,
  onFilenameChange: (name: string) => void,
  onSaved: () => void,
  onConsoleLine: (text: string, opts?: { dim?: boolean; system?: boolean }) => void,
  refocusEditor: () => void
): FileController {
  let currentFilename = "untitled.py";

  function setFilename(name: string) {
    currentFilename = name || "untitled.py";
    onFilenameChange(currentFilename);
  }

  function openFile() {
    dom.openBtn.blur();
    dom.fileInput.value = "";
    dom.fileInput.click();
  }

  dom.fileInput.addEventListener("change", (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) {
      onConsoleLine("Open cancelled.", { dim: true, system: true });
      refocusEditor();
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      editor.setValue(String((ev.target as FileReader).result ?? ""));
      setFilename(file.name);
      onSaved();
      onConsoleLine(`Loaded: ${file.name}`, { dim: true, system: true });
      refocusEditor();
    };
    reader.readAsText(file);
  });

  function saveFile() {
    dom.saveBtn.blur();

    const code = editor.getValue();
    const blob = new Blob([code], { type: "text/plain" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = currentFilename || "script.py";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    onSaved();
    onConsoleLine(`Saved: ${a.download}`, { dim: true, system: true });

    refocusEditor();
  }

  return {
    openFile,
    saveFile,
    setFilename,
    getFilename: () => currentFilename
  };
}
