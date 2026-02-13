// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2023-2026 Mark Yu

import { DomRefs } from "./dom-refs.js";

type NotifyFn = (title: string, desc: string, icon?: string) => void;

export type FileController = {
  openFile: () => void;
  saveFile: () => void;
};

type CreateFileControllerOptions = {
  onOpenFileText: (filename: string, content: string) => void;
  getActiveFilename: () => string;
  getActiveContent: () => string;
  onSaved: (filename: string) => void;
  onNotify: NotifyFn;
  refocusEditor: () => void;
};

export function createFileController(
  dom: DomRefs,
  opts: CreateFileControllerOptions
): FileController {
  const { onOpenFileText, getActiveFilename, getActiveContent, onSaved, onNotify, refocusEditor } =
    opts;

  function openFile() {
    dom.openBtn.blur();
    dom.fileInput.value = "";
    dom.fileInput.click();
  }

  dom.fileInput.addEventListener("change", (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) {
      onNotify("Open cancelled", "No file selected.", "info");
      refocusEditor();
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      onOpenFileText(file.name, String((ev.target as FileReader).result ?? ""));
      onNotify("File opened", file.name, "folder_open");
      refocusEditor();
    };
    reader.readAsText(file);
  });

  function saveFile() {
    dom.saveBtn.blur();

    const filename = getActiveFilename() || "script.py";
    const code = getActiveContent();
    const blob = new Blob([code], { type: "text/plain" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    onSaved(filename);
    onNotify("File saved", a.download, "save");

    refocusEditor();
  }

  return {
    openFile,
    saveFile
  };
}
