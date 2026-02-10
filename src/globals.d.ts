// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2023-2026 Mark Yu

type CodeMirrorCursor = { line: number; ch: number };
type CodeMirrorTextMarker = { clear(): void };

type CodeMirrorEditor = {
  getValue(): string;
  setValue(value: string): void;
  getCursor(which?: "from" | "to" | "head" | "anchor"): CodeMirrorCursor;
  lineCount(): number;
  getLine(line: number): string;
  getRange(from: CodeMirrorCursor, to: CodeMirrorCursor): string;
  somethingSelected(): boolean;
  getSelection(): string;
  setSelection(from: CodeMirrorCursor, to: CodeMirrorCursor): void;
  replaceRange(
    replacement: string,
    from: CodeMirrorCursor,
    to?: CodeMirrorCursor,
    origin?: string
  ): void;
  posFromIndex(index: number): CodeMirrorCursor;
  indexFromPos(pos: CodeMirrorCursor): number;
  markText(
    from: CodeMirrorCursor,
    to: CodeMirrorCursor,
    options?: Record<string, unknown>
  ): CodeMirrorTextMarker;
  scrollIntoView(
    pos: CodeMirrorCursor | { from: CodeMirrorCursor; to?: CodeMirrorCursor },
    margin?: number
  ): void;
  undo(): void;
  redo(): void;
  on(event: string, handler: (...args: any[]) => void): void;
  setOption(option: string, value: unknown): void;
  refresh(): void;
  focus(): void;
};

declare const CodeMirror: {
  fromTextArea(textarea: HTMLTextAreaElement, options: Record<string, unknown>): CodeMirrorEditor;
};

declare function loadPyodide(options?: Record<string, unknown>): Promise<any>;

interface Window {
  CodeMirror?: typeof CodeMirror;
  loadPyodide?: typeof loadPyodide;
}
