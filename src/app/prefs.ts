import { DEFAULT_PREFS, LS_KEYS } from "../constants.js";
import { safeLS } from "../utils/storage.js";
import { Prefs } from "./types.js";
import { DomRefs } from "./dom-refs.js";

export function loadPrefs(): Prefs {
  try {
    const raw = safeLS.get(LS_KEYS.PREFS);
    if (!raw) return { ...DEFAULT_PREFS };
    return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(prefs: Prefs) {
  try {
    safeLS.set(LS_KEYS.PREFS, JSON.stringify(prefs));
  } catch {
    // ignore
  }
}

export function applyPrefs(prefs: Prefs, editor: CodeMirrorEditor, dom: DomRefs) {
  dom.dynamicStyles.textContent = `
    .CodeMirror{ font-size:${prefs.editorFontSize}px; }
    #console{ font-size:${prefs.consoleFontSize}px; }
  `;

  editor.setOption("lineWrapping", !!prefs.lineWrap);
  editor.refresh();

  dom.splitPane.classList.toggle("horizontal", !!prefs.splitHorizontal);
  if (prefs.splitHorizontal) {
    dom.editorPane.style.height = "";
  } else {
    dom.editorPane.style.width = "";
  }

  dom.editorSizeRange.value = String(prefs.editorFontSize);
  dom.consoleSizeRange.value = String(prefs.consoleFontSize);
  dom.editorSizeLabel.textContent = `${prefs.editorFontSize.toFixed(2)}px`;
  dom.consoleSizeLabel.textContent = `${prefs.consoleFontSize.toFixed(2)}px`;
  dom.wrapToggle.checked = !!prefs.lineWrap;
  dom.splitToggle.checked = !!prefs.splitHorizontal;
  dom.execTimeToggle.checked = !!prefs.showExecTime;
}

export function bindPrefsUI(
  prefs: Prefs,
  editor: CodeMirrorEditor,
  dom: DomRefs,
  onChange?: () => void
) {
  dom.editorSizeRange.addEventListener("input", () => {
    prefs.editorFontSize = parseFloat(dom.editorSizeRange.value);
    savePrefs(prefs);
    applyPrefs(prefs, editor, dom);
    onChange?.();
  });
  dom.consoleSizeRange.addEventListener("input", () => {
    prefs.consoleFontSize = parseFloat(dom.consoleSizeRange.value);
    savePrefs(prefs);
    applyPrefs(prefs, editor, dom);
    onChange?.();
  });
  dom.wrapToggle.addEventListener("change", () => {
    prefs.lineWrap = !!dom.wrapToggle.checked;
    savePrefs(prefs);
    applyPrefs(prefs, editor, dom);
    onChange?.();
  });
  dom.splitToggle.addEventListener("change", () => {
    prefs.splitHorizontal = !!dom.splitToggle.checked;
    savePrefs(prefs);
    applyPrefs(prefs, editor, dom);
    onChange?.();
  });
  dom.execTimeToggle.addEventListener("change", () => {
    prefs.showExecTime = !!dom.execTimeToggle.checked;
    savePrefs(prefs);
    applyPrefs(prefs, editor, dom);
    onChange?.();
  });
}

export function resetPrefs(prefs: Prefs, editor: CodeMirrorEditor, dom: DomRefs) {
  Object.assign(prefs, DEFAULT_PREFS);
  savePrefs(prefs);
  applyPrefs(prefs, editor, dom);
}
