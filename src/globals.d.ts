type CodeMirrorCursor = { line: number; ch: number };

type CodeMirrorEditor = {
  getValue(): string;
  setValue(value: string): void;
  getCursor(): CodeMirrorCursor;
  lineCount(): number;
  getLine(line: number): string;
  getRange(from: CodeMirrorCursor, to: CodeMirrorCursor): string;
  somethingSelected(): boolean;
  getSelection(): string;
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
