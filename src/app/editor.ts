import { LS_KEYS } from "../constants.js";
import { byId, debounce } from "../utils/dom.js";
import { safeLS } from "../utils/storage.js";
import { DomRefs } from "./dom-refs.js";
import { Prefs, RunMode } from "./types.js";

export type EditorController = {
  editor: CodeMirrorEditor;
  getCodeForMode: (mode: RunMode) => string | null;
  getValue: () => string;
  setValue: (value: string) => void;
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
    onChange?.();
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

  return {
    editor,
    getCodeForMode,
    getValue: () => editor.getValue(),
    setValue: (value: string) => editor.setValue(value),
    markSaved,
    focus: () => editor.focus(),
    refresh: () => editor.refresh()
  };
}
