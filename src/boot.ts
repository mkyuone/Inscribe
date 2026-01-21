import { DEFAULT_PREFS, LS_KEYS } from "./constants.js";
import { byId, debounce, escapeHtml, setClass } from "./utils/dom.js";
import { isMac } from "./utils/platform.js";
import { safeLS } from "./utils/storage.js";
import { formatDuration } from "./utils/time.js";

type RunMode = "all" | "selection" | "cell";
type Prefs = typeof DEFAULT_PREFS;

type AppState = {
  isRunning: boolean;
  isDirty: boolean;
  pyodideReady: boolean;
  pyodideInstance: any;
  runMode: RunMode;
};

function waitForGlobals(timeoutMs = 9000) {
  return new Promise<void>((resolve, reject) => {
    const start = performance.now();
    const tick = () => {
      const ok = !!(window.CodeMirror && window.loadPyodide);
      if (ok) return resolve();
      if (performance.now() - start > timeoutMs) {
        return reject(
          new Error(
            "Dependencies not loaded: CodeMirror and/or Pyodide missing (CDN blocked / Rocket Loader / network)."
          )
        );
      }
      requestAnimationFrame(tick);
    };
    tick();
  });
}

let booted = false;

export async function boot() {
  if (booted) return;
  booted = true;

  const consoleFallback = document.getElementById("console");
  const runBtnFallback = document.getElementById("runBtn") as HTMLButtonElement | null;
  const loadingOverlay = document.getElementById("loadingOverlay") as HTMLDivElement | null;

  function showFatal(msg: string) {
    console.error(msg);
    if (loadingOverlay) loadingOverlay.classList.add("hidden");
    if (runBtnFallback) runBtnFallback.disabled = true;
    if (consoleFallback) {
      consoleFallback.innerHTML = "";
      const div = document.createElement("div");
      div.className = "consoleLine err";
      div.style.whiteSpace = "pre-wrap";
      div.textContent =
        "Editor failed to initialize.\n\n" +
        msg +
        "\n\nOpen DevTools → Console/Network for details.";
      consoleFallback.appendChild(div);
    } else {
      alert("Editor failed to initialize:\n\n" + msg);
    }
  }

  try {
    await waitForGlobals();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    showFatal(msg);
    return;
  }

  const runBtn = byId<HTMLButtonElement>("runBtn");
  const runModeBtn = byId<HTMLButtonElement>("runModeBtn");
  const runMenu = byId<HTMLDivElement>("runMenu");
  const runAllBtn = byId<HTMLButtonElement>("runAllBtn");
  const runSelBtn = byId<HTMLButtonElement>("runSelBtn");
  const runCellBtn = byId<HTMLButtonElement>("runCellBtn");
  const runLabel = byId<HTMLSpanElement>("runLabel");

  const openBtn = byId<HTMLButtonElement>("openBtn");
  const saveBtn = byId<HTMLButtonElement>("saveBtn");
  const shareBtn = byId<HTMLButtonElement>("shareBtn");
  const fileInput = byId<HTMLInputElement>("fileInput");

  const moreBtn = byId<HTMLButtonElement>("moreBtn");
  const moreMenu = byId<HTMLDivElement>("moreMenu");

  const shareMenuBtn = byId<HTMLButtonElement>("shareMenuBtn");
  const resetBtn = byId<HTMLButtonElement>("resetBtn");
  const settingsBtn = byId<HTMLButtonElement>("settingsBtn");
  const aboutBtn = byId<HTMLButtonElement>("aboutBtn");

  const wrapBtn = byId<HTMLButtonElement>("wrapBtn");
  const editorPane = byId<HTMLDivElement>("editorPane");
  const resizer = byId<HTMLDivElement>("dragbar");
  const consoleEl = byId<HTMLDivElement>("console");

  const clearConsoleBtn = byId<HTMLButtonElement>("clearConsoleBtn");
  const undoClearBtn = byId<HTMLButtonElement>("undoClearBtn");

  const aboutOverlay = byId<HTMLDivElement>("aboutOverlay");
  const closeAboutBtn = byId<HTMLButtonElement>("closeAboutBtn");
  const settingsOverlay = byId<HTMLDivElement>("settingsOverlay");
  const closeSettingsBtn = byId<HTMLButtonElement>("closeSettingsBtn");
  const printOverlay = byId<HTMLDivElement>("printOverlay");
  const printBtn = byId<HTMLButtonElement>("printBtn");
  const printCancelBtn = byId<HTMLButtonElement>("printCancelBtn");
  const printConfirmBtn = byId<HTMLButtonElement>("printConfirmBtn");
  const printIncludeCode = byId<HTMLInputElement>("printIncludeCode");
  const printIncludeOutput = byId<HTMLInputElement>("printIncludeOutput");
  const printLineNumbers = byId<HTMLInputElement>("printLineNumbers");
  const printWrapLines = byId<HTMLInputElement>("printWrapLines");
  const printBranding = byId<HTMLInputElement>("printBranding");
  const printTimestamp = byId<HTMLInputElement>("printTimestamp");
  const printContentNote = byId<HTMLDivElement>("printContentNote");
  const exportRoot = byId<HTMLDivElement>("exportRoot");
  const shareWarnOverlay = byId<HTMLDivElement>("shareWarnOverlay");
  const shareWarnText = byId<HTMLDivElement>("shareWarnText");
  const shareWarnCancelBtn = byId<HTMLButtonElement>("shareWarnCancelBtn");
  const shareWarnDownloadBtn = byId<HTMLButtonElement>("shareWarnDownloadBtn");
  const shareWarnConfirmBtn = byId<HTMLButtonElement>("shareWarnConfirmBtn");
  const shareToast = byId<HTMLDivElement>("shareToast");
  const shareToastTitle = byId<HTMLDivElement>("shareToastTitle");
  const shareToastDesc = byId<HTMLDivElement>("shareToastDesc");
  const shareToastIcon = byId<HTMLSpanElement>("shareToastIcon");

  const fileMeta = byId<HTMLSpanElement>("fileMeta");
  const sbRun = byId<HTMLSpanElement>("sbRun");
  const sbDirty = byId<HTMLSpanElement>("sbDirty");
  const sbPy = byId<HTMLSpanElement>("sbPy");
  const sbFile = byId<HTMLSpanElement>("sbFile");
  const sbPos = byId<HTMLSpanElement>("sbPos");
  const sbSel = byId<HTMLSpanElement>("sbSel");
  const sbClock = byId<HTMLSpanElement>("sbClock");

  const hintRun = byId<HTMLSpanElement>("hintRun");
  const hintOpen = byId<HTMLSpanElement>("hintOpen");
  const hintSave = byId<HTMLSpanElement>("hintSave");
  const hintSettings = byId<HTMLSpanElement>("hintSettings");
  const hintPrint = byId<HTMLSpanElement>("hintPrint");

  const editorSizeRange = byId<HTMLInputElement>("editorSizeRange");
  const consoleSizeRange = byId<HTMLInputElement>("consoleSizeRange");
  const editorSizeLabel = byId<HTMLSpanElement>("editorSizeLabel");
  const consoleSizeLabel = byId<HTMLSpanElement>("consoleSizeLabel");
  const wrapToggle = byId<HTMLInputElement>("wrapToggle");
  const execTimeToggle = byId<HTMLInputElement>("execTimeToggle");
  const shortcutBody = byId<HTMLTableSectionElement>("shortcutBody");

  const dynamicStyles = byId<HTMLStyleElement>("dynamicStyles");

  const state: AppState = {
    isRunning: false,
    isDirty: false,
    pyodideReady: false,
    pyodideInstance: null,
    runMode: (safeLS.get(LS_KEYS.RUNMODE) as RunMode) || "all"
  };

  function updateStatusBar() {
    sbRun.innerHTML = `<span class="sbDot"></span><strong>${
      state.isRunning ? "Running" : "Ready"
    }</strong>`;
    setClass(sbRun, state.isRunning ? "warn" : "good");

    sbDirty.innerHTML = `<span class="sbDot"></span><strong>${
      state.isDirty ? "Unsaved" : "Saved"
    }</strong>`;
    setClass(sbDirty, state.isDirty ? "warn" : "good");

    sbPy.innerHTML = `<span class="sbDot"></span><strong>${
      state.pyodideReady ? "Pyodide: ready" : "Pyodide: not loaded"
    }</strong>`;
    setClass(sbPy, state.pyodideReady ? "good" : "bad");
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.warn("[PWA] Service worker registration failed:", err);
      });
    });
  }

  function loadPrefs(): Prefs {
    try {
      const raw = safeLS.get(LS_KEYS.PREFS);
      if (!raw) return { ...DEFAULT_PREFS };
      return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) };
    } catch {
      return { ...DEFAULT_PREFS };
    }
  }

  function savePrefs(p: Prefs) {
    try {
      safeLS.set(LS_KEYS.PREFS, JSON.stringify(p));
    } catch {
      // ignore
    }
  }

  let prefs = loadPrefs();

  const editor = CodeMirror.fromTextArea(byId<HTMLTextAreaElement>("editor"), {
    mode: "python",
    theme: "eclipse",
    lineNumbers: true,
    indentUnit: 4,
    matchBrackets: true,
    viewportMargin: Infinity,
    lineWrapping: !!prefs.lineWrap
  });

  function refocusEditor() {
    [openBtn, saveBtn, shareBtn, moreBtn, runModeBtn].forEach((b) => b && b.blur());
    requestAnimationFrame(() => editor.focus());
  }

  function getRunModeLabel(mode: RunMode) {
    if (mode === "selection") return "Selection";
    if (mode === "cell") return "Cell";
    return "All";
  }

  function updateRunModeUI() {
    const label = getRunModeLabel(state.runMode);
    runLabel.textContent = `Run ${label}`;

    [runAllBtn, runSelBtn, runCellBtn].forEach((b) => b.classList.remove("activeMode"));
    const map: Record<RunMode, HTMLButtonElement> = {
      all: runAllBtn,
      selection: runSelBtn,
      cell: runCellBtn
    };
    const active = map[state.runMode];
    if (active) active.classList.add("activeMode");

    runBtn.title = `Run ${label} (Cmd/Ctrl + Enter)`;
  }

  function setRunMode(mode: RunMode) {
    const allowed: RunMode[] = ["all", "selection", "cell"];
    state.runMode = allowed.includes(mode) ? mode : "all";
    safeLS.set(LS_KEYS.RUNMODE, state.runMode);
    updateRunModeUI();
    addConsoleLine(`Run mode set to: ${getRunModeLabel(state.runMode)}`, {
      dim: true,
      system: true
    });
  }

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

  let currentFilename = safeLS.get(LS_KEYS.FILENAME) || "untitled.py";
  fileMeta.textContent = currentFilename;
  sbFile.textContent = currentFilename;

  function setFilename(name: string) {
    currentFilename = name || "untitled.py";
    fileMeta.textContent = currentFilename;
    sbFile.textContent = currentFilename;
    safeLS.set(LS_KEYS.FILENAME, currentFilename);
  }

  let lastSavedContent = editor.getValue();

  function setDirty(next: boolean) {
    state.isDirty = !!next;
    updateStatusBar();
  }

  const saveDraftDebounced = debounce(() => {
    safeLS.set(LS_KEYS.DRAFT, editor.getValue());
  }, 200);

  editor.on("change", () => {
    const curr = editor.getValue();
    setDirty(curr !== lastSavedContent);
    saveDraftDebounced();
    if (printOverlay.classList.contains("active")) {
      updatePrintConfirmState();
    }
  });

  window.addEventListener("beforeunload", (e) => {
    if (!state.isDirty) return;
    const msg = "You have unsaved code. Leave without saving?";
    e.preventDefault();
    e.returnValue = msg;
    return msg;
  });

  let consoleBackup: string | null = null;
  let undoTimer: ReturnType<typeof setTimeout> | null = null;

  function addConsoleLine(
    text: string,
    opts: { error?: boolean; dim?: boolean; system?: boolean } = {}
  ) {
    const line = document.createElement("div");
    line.className = "consoleLine";
    if (opts.error) line.classList.add("err");
    if (opts.dim) line.classList.add("dim");
    if (opts.system) line.classList.add("system");
    const prefix = opts.system ? "*" : ">";
    line.innerHTML = `<span class="prefix">${prefix}</span>${escapeHtml(text)}`;
    consoleEl.appendChild(line);
    consoleEl.scrollTop = consoleEl.scrollHeight;
  }

  let stdoutBuffer = "";

  function flushStdoutBuffer() {
    if (!stdoutBuffer.length) return;
    addConsoleLine(stdoutBuffer);
    stdoutBuffer = "";
  }

  function handleStdout(text: string) {
    const normalized = String(text ?? "").replace(/\r/g, "");
    stdoutBuffer += normalized;
    const lines = stdoutBuffer.split("\n");
    stdoutBuffer = lines.pop() ?? "";
    lines.forEach((line) => addConsoleLine(line));
  }

  (window as any).inscribeStdout = (text?: string) => {
    handleStdout(text ?? "");
  };
  (window as any).inscribeStdoutFlush = () => {
    flushStdoutBuffer();
  };

  const SHARE_PREFIX = "v1:";
  let toastTimer: ReturnType<typeof setTimeout> | null = null;

  function showToast(title: string, desc: string, icon = "check_circle") {
    shareToastTitle.textContent = title;
    shareToastDesc.textContent = desc;
    shareToastIcon.textContent = icon;
    shareToast.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      shareToast.classList.remove("show");
    }, 2800);
  }

  shareToast.addEventListener("click", () => {
    shareToast.classList.remove("show");
  });

  function bytesToBase64Url(bytes: Uint8Array) {
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function base64UrlToBytes(data: string) {
    let base64 = data.replace(/-/g, "+").replace(/_/g, "/");
    const pad = base64.length % 4;
    if (pad) base64 += "=".repeat(4 - pad);
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  async function compressText(text: string) {
    const CompressionStreamCtor = (window as any).CompressionStream;
    if (!CompressionStreamCtor) throw new Error("CompressionStream not supported");
    const data = new TextEncoder().encode(text);
    const stream = new Blob([data]).stream().pipeThrough(new CompressionStreamCtor("gzip"));
    const buffer = await new Response(stream).arrayBuffer();
    return new Uint8Array(buffer);
  }

  async function decompressText(bytes: Uint8Array) {
    const DecompressionStreamCtor = (window as any).DecompressionStream;
    if (!DecompressionStreamCtor) throw new Error("DecompressionStream not supported");
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStreamCtor("gzip"));
    const buffer = await new Response(stream).arrayBuffer();
    return new TextDecoder().decode(buffer);
  }

  function encodePlain(text: string) {
    return bytesToBase64Url(new TextEncoder().encode(text));
  }

  function decodePlain(encoded: string) {
    return new TextDecoder().decode(base64UrlToBytes(encoded));
  }

  async function buildShareUrl(code: string) {
    const url = new URL(window.location.href);
    const payload = `${SHARE_PREFIX}${code}`;
    try {
      const compressed = await compressText(payload);
      url.hash = `c=${bytesToBase64Url(compressed)}`;
      return { url: url.toString(), usedCompression: true };
    } catch {
      url.hash = `code=${encodePlain(payload)}`;
      return { url: url.toString(), usedCompression: false };
    }
  }

  async function readSharedCodeFromUrl() {
    const hash = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : window.location.hash;
    if (!hash) return null;
    const params = new URLSearchParams(hash);
    const compressed = params.get("c");
    const plain = params.get("code");
    if (!compressed && !plain) return null;

    try {
      const decoded = compressed
        ? await decompressText(base64UrlToBytes(compressed))
        : decodePlain(plain ?? "");
      const code = decoded.startsWith(SHARE_PREFIX)
        ? decoded.slice(SHARE_PREFIX.length)
        : decoded;
      return { code, compressed: !!compressed };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addConsoleLine(`Share link failed to decode: ${msg}`, { error: true });
      showToast("Share link invalid", "This link could not be decoded.", "error_outline");
      return null;
    }
  }

  const shared = await readSharedCodeFromUrl();
  const draft = safeLS.get(LS_KEYS.DRAFT);
  if (shared && shared.code.trim().length) {
    editor.setValue(shared.code);
    setFilename("shared.py");
    lastSavedContent = editor.getValue();
    safeLS.set(LS_KEYS.DRAFT, editor.getValue());
    setDirty(false);
    addConsoleLine("Loaded shared code from link.", { dim: true, system: true });
    showToast("Shared code loaded", "This editor opened code from a share link.");
  } else if (draft && draft.trim().length) {
    editor.setValue(draft);
    lastSavedContent = editor.getValue();
    setDirty(false);
    addConsoleLine("Restored previous draft.", { dim: true, system: true });
  }

  type InputRequest = {
    prompt: string;
    resolve: (value: string) => void;
  };

  const inputQueue: InputRequest[] = [];
  let activeInput: InputRequest | null = null;

  function showNextInput() {
    const next = inputQueue.shift();
    if (!next) {
      activeInput = null;
      return;
    }
    activeInput = next;

    const line = document.createElement("div");
    line.className = "consoleLine input";

    const prefix = document.createElement("span");
    prefix.className = "prefix";
    prefix.textContent = "?";
    line.appendChild(prefix);

    const promptText = (next.prompt ?? "").toString();
    if (promptText) {
      const promptSpan = document.createElement("span");
      promptSpan.className = "consolePrompt";
      promptSpan.textContent = promptText;
      line.appendChild(promptSpan);
    }

    const input = document.createElement("input");
    input.className = "consoleInput";
    input.type = "text";
    input.autocomplete = "off";
    input.spellcheck = false;
    line.appendChild(input);

    consoleEl.appendChild(line);
    consoleEl.scrollTop = consoleEl.scrollHeight;
    input.focus();

    const commit = (value: string) => {
      const echo = document.createElement("span");
      echo.className = "consoleEcho";
      echo.textContent = value;
      line.removeChild(input);
      line.appendChild(echo);
      next.resolve(value);
      activeInput = null;
      showNextInput();
    };

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commit(input.value ?? "");
      }
      if (e.key === "Escape") {
        e.preventDefault();
        commit("");
      }
    });
  }

  function requestConsoleInput(prompt = ""): Promise<string> {
    return new Promise((resolve) => {
      inputQueue.push({ prompt, resolve });
      if (!activeInput) showNextInput();
    });
  }

  (window as any).__inscribeReadline = (prompt?: string) =>
    requestConsoleInput(prompt ? String(prompt) : "");

  function rewriteInputCalls(source: string) {
    const isIdentChar = (ch: string) => /[A-Za-z0-9_]/.test(ch);
    const isSpace = (ch: string) => /\s/.test(ch);
    const readPrevToken = (idx: number) => {
      let j = idx - 1;
      while (j >= 0 && isSpace(source[j])) j--;
      if (j < 0) return "";
      let end = j;
      while (j >= 0 && isIdentChar(source[j])) j--;
      return source.slice(j + 1, end + 1);
    };

    let i = 0;
    let out = "";
    let changed = false;
    let state: "normal" | "single" | "double" | "triple_single" | "triple_double" | "comment" =
      "normal";

    const startsWithAt = (str: string) => source.startsWith(str, i);

    while (i < source.length) {
      const ch = source[i];

      if (state === "comment") {
        out += ch;
        if (ch === "\n") state = "normal";
        i += 1;
        continue;
      }

      if (state === "single") {
        out += ch;
        if (ch === "\\" && i + 1 < source.length) {
          out += source[i + 1];
          i += 2;
          continue;
        }
        if (ch === "'") state = "normal";
        i += 1;
        continue;
      }

      if (state === "double") {
        out += ch;
        if (ch === "\\" && i + 1 < source.length) {
          out += source[i + 1];
          i += 2;
          continue;
        }
        if (ch === '"') state = "normal";
        i += 1;
        continue;
      }

      if (state === "triple_single") {
        if (startsWithAt("'''")) {
          out += "'''";
          i += 3;
          state = "normal";
          continue;
        }
        out += ch;
        i += 1;
        continue;
      }

      if (state === "triple_double") {
        if (startsWithAt('"""')) {
          out += '"""';
          i += 3;
          state = "normal";
          continue;
        }
        out += ch;
        i += 1;
        continue;
      }

      if (ch === "#") {
        out += ch;
        state = "comment";
        i += 1;
        continue;
      }
      if (startsWithAt("'''")) {
        out += "'''";
        i += 3;
        state = "triple_single";
        continue;
      }
      if (startsWithAt('"""')) {
        out += '"""';
        i += 3;
        state = "triple_double";
        continue;
      }
      if (ch === "'") {
        out += ch;
        state = "single";
        i += 1;
        continue;
      }
      if (ch === '"') {
        out += ch;
        state = "double";
        i += 1;
        continue;
      }

      if (startsWithAt("input")) {
        const prev = i > 0 ? source[i - 1] : "";
        if (prev && (isIdentChar(prev) || prev === ".")) {
          out += ch;
          i += 1;
          continue;
        }

        let j = i + 5;
        while (j < source.length && isSpace(source[j])) j++;
        if (source[j] !== "(") {
          out += ch;
          i += 1;
          continue;
        }

        const prevToken = readPrevToken(i);
        const needsAwait = prevToken !== "await";
        out += `${needsAwait ? "await " : ""}__import__("js").__inscribeReadline(`;
        i = j + 1;
        changed = true;
        continue;
      }

      out += ch;
      i += 1;
    }

    return { code: out, changed };
  }

  function clearConsole(keepBanner = true) {
    consoleEl.innerHTML = "";
    if (keepBanner) addConsoleLine("Ready. Run to load Pyodide.", { dim: true, system: true });
  }

  function clearConsoleWithUndo() {
    if (undoTimer) clearTimeout(undoTimer);
    consoleBackup = consoleEl.innerHTML;

    consoleEl.innerHTML = "";
    addConsoleLine("Console cleared. Undo available for 3 seconds.", { dim: true, system: true });

    undoClearBtn.style.display = "inline-flex";
    undoTimer = setTimeout(() => {
      consoleBackup = null;
      undoClearBtn.style.display = "none";
    }, 3000);
  }

  function undoClearConsole() {
    if (!consoleBackup) return;
    if (undoTimer) clearTimeout(undoTimer);

    consoleEl.innerHTML = consoleBackup;
    consoleBackup = null;
    undoClearBtn.style.display = "none";
  }

  async function initializePyodide() {
    if (state.pyodideInstance) return;

    addConsoleLine("Loading Pyodide… This may take a moment on first run.", {
      dim: true,
      system: true
    });
    state.pyodideReady = false;
    updateStatusBar();

    state.pyodideInstance = await loadPyodide();

    state.pyodideInstance.runPython(`
import sys
import js

class JSConsole:
    def write(self, s):
        js.inscribeStdout(s)
    def flush(self):
        js.inscribeStdoutFlush()

sys.stdout = JSConsole()
sys.stderr = JSConsole()
    `);

    await state.pyodideInstance.runPythonAsync(`
import builtins
def custom_input(prompt=""):
    raise RuntimeError("input() is handled by the console UI. If you see this, the editor could not rewrite input() calls.")
builtins.input = custom_input
    `);

    state.pyodideReady = true;
    updateStatusBar();

    addConsoleLine("Inscribe Editor & Execution with Pyodide", { dim: true, system: true });
    addConsoleLine("Inscribe v3.1 / (c) Mark Yu, py.mkyu.one", { dim: true, system: true });
    addConsoleLine("------------------------------------------", { dim: true, system: true });
  }

  function resetEnvironment() {
    state.pyodideInstance = null;
    state.pyodideReady = false;
    stdoutBuffer = "";
    addConsoleLine("Environment reset. Next run will reload Pyodide.", {
      dim: true,
      system: true
    });
    updateStatusBar();
    refocusEditor();
  }

  async function runCode(mode: RunMode = "all") {
    if (state.isRunning) return;
    state.isRunning = true;
    updateStatusBar();

    runBtn.disabled = true;
    runModeBtn.disabled = true;
    stdoutBuffer = "";

    try {
      if (!state.pyodideInstance) await initializePyodide();

      const code = getCodeForMode(mode);
      if (!code || !code.trim()) {
        addConsoleLine(mode === "selection" ? "No selection to run." : "Nothing to run.", {
          dim: true,
          system: true
        });
        return;
      }

      addConsoleLine(`Executing (${getRunModeLabel(mode)})…`, { dim: true, system: true });

      const t0 = performance.now();
      const rewritten = rewriteInputCalls(code);
      const codeToRun = rewritten.changed ? rewritten.code : code;
      await state.pyodideInstance.runPythonAsync(codeToRun);

      flushStdoutBuffer();

      const dt = performance.now() - t0;
      if (prefs.showExecTime) {
        addConsoleLine(`Finished in ${formatDuration(dt)}.`, { dim: true, system: true });
      }
    } catch (err) {
      const msg = err?.toString?.() ?? String(err);
      msg.split("\n").forEach((l: string) => {
        if (l.trim()) addConsoleLine(l, { error: true });
      });
      addConsoleLine("Finished with errors.", { dim: true, system: true });
    } finally {
      state.isRunning = false;
      updateStatusBar();
      runBtn.disabled = false;
      runModeBtn.disabled = false;
      refocusEditor();
    }
  }

  function runDefault() {
    return runCode(state.runMode);
  }

  function openFile() {
    openBtn.blur();
    fileInput.value = "";
    fileInput.click();
  }

  fileInput.addEventListener("change", (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) {
      addConsoleLine("Open cancelled.", { dim: true, system: true });
      refocusEditor();
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      editor.setValue(String((ev.target as FileReader).result ?? ""));
      setFilename(file.name);
      lastSavedContent = editor.getValue();
      setDirty(false);
      addConsoleLine(`Loaded: ${file.name}`, { dim: true, system: true });
      refocusEditor();
    };
    reader.readAsText(file);
  });

  function saveFile() {
    saveBtn.blur();

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

    lastSavedContent = code;
    setDirty(false);
    addConsoleLine(`Saved: ${a.download}`, { dim: true, system: true });

    refocusEditor();
  }

  async function copyToClipboard(text: string) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.top = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand("copy");
    } finally {
      document.body.removeChild(textarea);
    }
  }

  async function shareCode() {
    shareBtn.blur();
    const code = editor.getValue();
    if (!code.trim()) {
      showToast("Nothing to share", "Write some code first, then share a link.", "error_outline");
      return;
    }

    try {
      const { url, usedCompression } = await buildShareUrl(code);
      const warnThreshold = 1600;
      if (url.length > warnThreshold) {
        const proceed = await confirmLongUrl(url.length);
        if (!proceed) {
          addConsoleLine("Share cancelled due to long URL.", { dim: true, system: true });
          showToast("Share cancelled", "Use Save to download a .py file.");
          return;
        }
      }
      await copyToClipboard(url);
      const note = usedCompression ? "Compressed and copied to clipboard." : "Copied to clipboard.";
      addConsoleLine(`Share link created. ${note}`, { dim: true, system: true });
      showToast("Share link copied", "Anyone with this link can open the code.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addConsoleLine(`Share failed: ${msg}`, { error: true });
      showToast("Share failed", "Your browser blocked link sharing.", "error_outline");
    } finally {
      refocusEditor();
    }
  }

  function confirmLongUrl(length: number) {
    return new Promise<boolean>((resolve) => {
      shareWarnText.textContent = `This share link is very long (${length} characters). Continue anyway?`;
      openShareWarn();

      const cleanup = () => {
        shareWarnCancelBtn.removeEventListener("click", onCancel);
        shareWarnDownloadBtn.removeEventListener("click", onDownload);
        shareWarnConfirmBtn.removeEventListener("click", onConfirm);
      };
      const onCancel = () => {
        closeShareWarn();
        cleanup();
        resolve(false);
      };
      const onDownload = () => {
        closeShareWarn();
        saveFile();
        cleanup();
        resolve(false);
      };
      const onConfirm = () => {
        closeShareWarn();
        cleanup();
        resolve(true);
      };

      shareWarnCancelBtn.addEventListener("click", onCancel);
      shareWarnDownloadBtn.addEventListener("click", onDownload);
      shareWarnConfirmBtn.addEventListener("click", onConfirm);
    });
  }

  function toggleWrap() {
    prefs.lineWrap = !prefs.lineWrap;
    savePrefs(prefs);
    applyPrefs();
    addConsoleLine(`Line wrap: ${prefs.lineWrap ? "on" : "off"}`, {
      dim: true,
      system: true
    });
    refocusEditor();
  }

  function openAbout() {
    aboutOverlay.classList.add("active");
  }
  function closeAbout() {
    aboutOverlay.classList.remove("active");
  }
  function openSettings() {
    settingsOverlay.classList.add("active");
  }
  function closeSettings() {
    settingsOverlay.classList.remove("active");
  }
  function openPrint() {
    printOverlay.classList.add("active");
  }
  function closePrint() {
    printOverlay.classList.remove("active");
  }
  function openShareWarn() {
    shareWarnOverlay.classList.add("active");
  }
  function closeShareWarn() {
    shareWarnOverlay.classList.remove("active");
  }

  function closeAnyModal() {
    closeAbout();
    closeSettings();
    closePrint();
    closeShareWarn();
  }

  aboutOverlay.addEventListener("click", (e) => {
    if (e.target === aboutOverlay) closeAbout();
  });
  settingsOverlay.addEventListener("click", (e) => {
    if (e.target === settingsOverlay) closeSettings();
  });
  printOverlay.addEventListener("click", (e) => {
    if (e.target === printOverlay) closePrint();
  });
  shareWarnOverlay.addEventListener("click", (e) => {
    if (e.target === shareWarnOverlay) closeShareWarn();
  });

  function updateCursorStatus() {
    const c = editor.getCursor();
    sbPos.textContent = `Ln ${c.line + 1}, Col ${c.ch + 1}`;
    const selLen = editor.somethingSelected() ? editor.getSelection().length : 0;
    sbSel.textContent = `Sel ${selLen}`;
  }
  const updateCursorDebounced = debounce(updateCursorStatus, 40);
  editor.on("cursorActivity", updateCursorDebounced);

  function updateClock() {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    sbClock.textContent = `${hh}:${mm}:${ss}`;
  }
  setInterval(updateClock, 1000);

  function setHints() {
    const mac = isMac();
    const mod = mac ? "⌘" : "Ctrl";
    const enterKey = mac ? "Return" : "Enter";

    hintRun.textContent = `${mod} ${enterKey}`;
    hintOpen.textContent = `${mod} O`;
    hintSave.textContent = `${mod} S`;
    hintSettings.textContent = `${mod} ,`;
    hintPrint.textContent = `${mod} P`;

    const shortcuts = [
      { keys: [mod, enterKey], desc: "Run (uses Run Mode config)" },
      { keys: [mod, "Shift", enterKey], desc: "Run current cell (# %%)" },
      { keys: [mod, "S"], desc: "Save file" },
      { keys: [mod, "O"], desc: "Open file" },
      { keys: [mod, "P"], desc: "Print / Export" },
      { keys: [mod, ","], desc: "Open Settings" },
      { keys: ["Esc"], desc: "Close modals / menus" }
    ];

    shortcutBody.innerHTML = shortcuts
      .map((s) => {
        const keyHtml = s.keys.map((k) => `<kbd>${escapeHtml(k)}</kbd>`).join("");
        return `<tr><td class="sKeys">${keyHtml}</td><td class="sDesc">${escapeHtml(
          s.desc
        )}</td></tr>`;
      })
      .join("");
  }

  function isModKey(e: KeyboardEvent) {
    return e.metaKey || e.ctrlKey;
  }

  function getTimestamp() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${y}-${m}-${day} ${hh}:${mm}`;
  }

  function collectConsoleOutput() {
    const lines = Array.from(consoleEl.querySelectorAll(".consoleLine"))
      .filter((line) => !line.classList.contains("system"))
      .map((line) => (line.textContent || "").replace(/\s+$/g, ""));
    return lines
      .map((line) => {
        if (line.startsWith(">")) return line.slice(1).trimStart();
        if (line.startsWith("*")) return line.slice(1).trimStart();
        if (line.startsWith("?")) return line.slice(1).trimStart();
        return line;
      })
      .join("\n")
      .trim();
  }

  function buildExportLayout(opts: {
    includeCode: boolean;
    includeOutput: boolean;
    lineNumbers: boolean;
    wrap: boolean;
    includeBranding: boolean;
    includeTimestamp: boolean;
  }) {
    exportRoot.innerHTML = "";

    const header = document.createElement("div");
    header.className = "exportHeader";
    const headerLines: string[] = [];
    if (opts.includeBranding) {
      headerLines.push("Inscribe Editor");
      headerLines.push("");
    }
    if (opts.includeTimestamp) {
      headerLines.push(`Printed / Exported: ${getTimestamp()}`);
    }
    headerLines.forEach((line, idx) => {
      const row = document.createElement("div");
      const cls =
        opts.includeBranding && idx === 0
          ? "exportBrand"
          : opts.includeBranding && idx === 1
            ? "exportSite"
            : "";
      row.className = cls;
      row.innerHTML = line ? `<strong>${escapeHtml(line)}</strong>` : "&nbsp;";
      header.appendChild(row);
    });
    if (headerLines.length) exportRoot.appendChild(header);

    const code = editor.getValue();
    const output = collectConsoleOutput();

    if (opts.includeCode && code.trim().length) {
      const section = document.createElement("section");
      section.className = "exportSection";
      section.innerHTML = `<div class="exportTitle">Code</div>`;
      const pre = document.createElement("pre");
      pre.className = `exportBlock${opts.wrap ? " wrap" : ""}`;

      if (opts.lineNumbers) {
        const lines = code.replace(/\r\n/g, "\n").split("\n");
        const pad = String(lines.length).length;
        pre.textContent = lines
          .map((line, idx) => `${String(idx + 1).padStart(pad, " ")} | ${line}`)
          .join("\n");
      } else {
        pre.textContent = code;
      }
      section.appendChild(pre);
      exportRoot.appendChild(section);
    }

    if (opts.includeOutput && output.trim().length) {
      const section = document.createElement("section");
      section.className = "exportSection";
      section.innerHTML = `<div class="exportTitle">Output</div>`;
      const pre = document.createElement("pre");
      pre.className = `exportBlock${opts.wrap ? " wrap" : ""}`;
      pre.textContent = output;
      section.appendChild(pre);
      exportRoot.appendChild(section);
    }

  }

  function updatePrintConfirmState() {
    const codeSelected = printIncludeCode.checked;
    const outputSelected = printIncludeOutput.checked;
    const codeExists = editor.getValue().trim().length > 0;
    const ok = (codeSelected || outputSelected) && codeExists;
    printConfirmBtn.disabled = !ok;
    if (!codeSelected && !outputSelected) {
      printContentNote.textContent = "Select at least one item to print.";
    } else if (!codeExists) {
      printContentNote.textContent = "No code detected. Add code to enable export.";
    } else {
      printContentNote.textContent = "Ready to print or export.";
    }
  }

  function openPrintModal() {
    closeMenu();
    closeRunMenu();
    printIncludeCode.checked = true;
    printIncludeOutput.checked = true;
    printLineNumbers.checked = false;
    printWrapLines.checked = true;
    printBranding.checked = true;
    printTimestamp.checked = true;
    printConfirmBtn.textContent = "Print / Export";
    updatePrintConfirmState();
    openPrint();
  }

  function handlePrintConfirm() {
    const includeCode = printIncludeCode.checked;
    const includeOutput = printIncludeOutput.checked;
    const lineNumbers = printLineNumbers.checked;
    const wrap = printWrapLines.checked;
    const includeBranding = printBranding.checked;
    const includeTimestamp = printTimestamp.checked;

    buildExportLayout({
      includeCode,
      includeOutput,
      lineNumbers,
      wrap,
      includeBranding,
      includeTimestamp
    });

    document.body.classList.add("exporting");
    closePrint();

    const cleanup = () => {
      document.body.classList.remove("exporting");
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);

    setTimeout(() => {
      window.print();
    }, 0);
  }


  function openMenu() {
    closeRunMenu();
    moreMenu.classList.add("active");
    moreBtn.setAttribute("aria-expanded", "true");
  }
  function closeMenu() {
    moreMenu.classList.remove("active");
    moreBtn.setAttribute("aria-expanded", "false");
    moreBtn.blur();
  }
  function toggleMenu() {
    if (moreMenu.classList.contains("active")) closeMenu();
    else openMenu();
  }

  function openRunMenu() {
    closeMenu();
    runMenu.classList.add("active");
    runModeBtn.setAttribute("aria-expanded", "true");
  }
  function closeRunMenu() {
    runMenu.classList.remove("active");
    runModeBtn.setAttribute("aria-expanded", "false");
    runModeBtn.blur();
  }
  function toggleRunMenu() {
    if (runMenu.classList.contains("active")) closeRunMenu();
    else openRunMenu();
  }

  document.addEventListener("click", (e) => {
    const target = e.target as Node;
    const withinMore = moreMenu.contains(target) || moreBtn.contains(target);
    if (!withinMore) closeMenu();

    const withinRun = runMenu.contains(target) || runModeBtn.contains(target);
    if (!withinRun) closeRunMenu();
  });

  window.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape") {
        closeAnyModal();
        closeMenu();
        closeRunMenu();
        refocusEditor();
        return;
      }

      if (!isModKey(e)) return;

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        runDefault();
        return;
      }
      if (e.key === "Enter" && e.shiftKey) {
        e.preventDefault();
        runCode("cell");
        return;
      }
      if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveFile();
        return;
      }
      if (e.key.toLowerCase() === "o") {
        e.preventDefault();
        openFile();
        return;
      }
      if (e.key.toLowerCase() === "p") {
        e.preventDefault();
        openPrintModal();
        return;
      }
      if (e.key === ",") {
        e.preventDefault();
        openSettings();
        return;
      }
    },
    { passive: false }
  );

  function applyPrefs() {
    dynamicStyles.textContent = `
      .CodeMirror{ font-size:${prefs.editorFontSize}px; }
      #console{ font-size:${prefs.consoleFontSize}px; }
    `;

    editor.setOption("lineWrapping", !!prefs.lineWrap);
    editor.refresh();

    editorSizeRange.value = String(prefs.editorFontSize);
    consoleSizeRange.value = String(prefs.consoleFontSize);
    editorSizeLabel.textContent = `${prefs.editorFontSize.toFixed(2)}px`;
    consoleSizeLabel.textContent = `${prefs.consoleFontSize.toFixed(2)}px`;
    wrapToggle.checked = !!prefs.lineWrap;
    execTimeToggle.checked = !!prefs.showExecTime;
  }

  let dragging = false;
  let startY = 0;
  let startHeight = 0;

  resizer.addEventListener("mousedown", (e) => {
    dragging = true;
    startY = e.clientY;
    startHeight = editorPane.offsetHeight;
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;

    const dy = e.clientY - startY;
    const split = document.querySelector(".split") as HTMLElement | null;
    if (!split) return;
    const total = split.clientHeight;
    const min = 150;
    const max = total - 150;

    let next = startHeight + dy;
    if (next < min) next = min;
    if (next > max) next = max;

    editorPane.style.height = `${next}px`;
    editor.refresh();
  });

  document.addEventListener("mouseup", () => {
    dragging = false;
  });

  runBtn.addEventListener("click", runDefault);
  runModeBtn.addEventListener("click", toggleRunMenu);

  runAllBtn.addEventListener("click", () => {
    setRunMode("all");
    closeRunMenu();
    refocusEditor();
  });
  runSelBtn.addEventListener("click", () => {
    setRunMode("selection");
    closeRunMenu();
    refocusEditor();
  });
  runCellBtn.addEventListener("click", () => {
    setRunMode("cell");
    closeRunMenu();
    refocusEditor();
  });

  openBtn.addEventListener("click", openFile);
  saveBtn.addEventListener("click", saveFile);
  shareBtn.addEventListener("click", () => {
    void shareCode();
  });

  moreBtn.addEventListener("click", toggleMenu);

  printBtn.addEventListener("click", () => {
    closeMenu();
    openPrintModal();
  });
  shareMenuBtn.addEventListener("click", () => {
    closeMenu();
    void shareCode();
  });
  resetBtn.addEventListener("click", () => {
    closeMenu();
    resetEnvironment();
  });
  settingsBtn.addEventListener("click", () => {
    closeMenu();
    openSettings();
  });
  aboutBtn.addEventListener("click", () => {
    closeMenu();
    openAbout();
  });

  wrapBtn.addEventListener("click", toggleWrap);

  clearConsoleBtn.addEventListener("click", clearConsoleWithUndo);
  undoClearBtn.addEventListener("click", undoClearConsole);

  closeAboutBtn.addEventListener("click", () => {
    closeAbout();
    refocusEditor();
  });
  closeSettingsBtn.addEventListener("click", () => {
    closeSettings();
    refocusEditor();
  });
  printCancelBtn.addEventListener("click", () => {
    closePrint();
    refocusEditor();
  });
  printConfirmBtn.addEventListener("click", handlePrintConfirm);

  [
    printIncludeCode,
    printIncludeOutput,
    printLineNumbers,
    printWrapLines,
    printBranding,
    printTimestamp
  ].forEach((input) => {
    input.addEventListener("change", () => {
      updatePrintConfirmState();
    });
  });

  editorSizeRange.addEventListener("input", () => {
    prefs.editorFontSize = parseFloat(editorSizeRange.value);
    savePrefs(prefs);
    applyPrefs();
  });
  consoleSizeRange.addEventListener("input", () => {
    prefs.consoleFontSize = parseFloat(consoleSizeRange.value);
    savePrefs(prefs);
    applyPrefs();
  });
  wrapToggle.addEventListener("change", () => {
    prefs.lineWrap = !!wrapToggle.checked;
    savePrefs(prefs);
    applyPrefs();
  });
  execTimeToggle.addEventListener("change", () => {
    prefs.showExecTime = !!execTimeToggle.checked;
    savePrefs(prefs);
    applyPrefs();
  });

  clearConsole(true);
  setHints();
  applyPrefs();
  updateStatusBar();
  updateCursorStatus();
  updateClock();
  updateRunModeUI();
  registerServiceWorker();
  refocusEditor();
  if (loadingOverlay) {
    requestAnimationFrame(() => {
      loadingOverlay.classList.add("hidden");
    });
  }
}
