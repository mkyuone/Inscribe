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
  const fileInput = byId<HTMLInputElement>("fileInput");

  const moreBtn = byId<HTMLButtonElement>("moreBtn");
  const moreMenu = byId<HTMLDivElement>("moreMenu");

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
    [openBtn, saveBtn, moreBtn, runModeBtn].forEach((b) => b && b.blur());
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
    addConsoleLine(`Run mode set to: ${getRunModeLabel(state.runMode)}`, { dim: true });
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

  const draft = safeLS.get(LS_KEYS.DRAFT);
  if (draft && draft.trim().length) {
    editor.setValue(draft);
    lastSavedContent = editor.getValue();
    setDirty(false);
    addConsoleLine("Restored previous draft.", { dim: true });
  }

  editor.on("change", () => {
    const curr = editor.getValue();
    setDirty(curr !== lastSavedContent);
    saveDraftDebounced();
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

  function addConsoleLine(text: string, opts: { error?: boolean; dim?: boolean } = {}) {
    const line = document.createElement("div");
    line.className = "consoleLine";
    if (opts.error) line.classList.add("err");
    if (opts.dim) line.classList.add("dim");
    line.innerHTML = `<span class="prefix">&gt;</span>${escapeHtml(text)}`;
    consoleEl.appendChild(line);
    consoleEl.scrollTop = consoleEl.scrollHeight;
  }

  function clearConsole(keepBanner = true) {
    consoleEl.innerHTML = "";
    if (keepBanner) addConsoleLine("Ready. Run to load Pyodide.", { dim: true });
  }

  function clearConsoleWithUndo() {
    if (undoTimer) clearTimeout(undoTimer);
    consoleBackup = consoleEl.innerHTML;

    consoleEl.innerHTML = "";
    addConsoleLine("Console cleared. Undo available for 3 seconds.", { dim: true });

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

    addConsoleLine("Loading Pyodide… This may take a moment on first run.", { dim: true });
    state.pyodideReady = false;
    updateStatusBar();

    state.pyodideInstance = await loadPyodide();

    state.pyodideInstance.runPython(`
import sys
from io import StringIO
sys.stdout = StringIO()
sys.stderr = sys.stdout
    `);

    await state.pyodideInstance.runPythonAsync(`
import builtins
def custom_input(prompt=""):
    from js import window
    return window.prompt(prompt)
builtins.input = custom_input
    `);

    state.pyodideReady = true;
    updateStatusBar();

    addConsoleLine("Inscribe Editor & Execution with Pyodide", { dim: true });
    addConsoleLine("Inscribe v2.1 / (c) Mark Yu, py.mkyu.one", { dim: true });
    addConsoleLine("------------------------------------------", { dim: true });
  }

  function resetEnvironment() {
    state.pyodideInstance = null;
    state.pyodideReady = false;
    addConsoleLine("Environment reset. Next run will reload Pyodide.", { dim: true });
    updateStatusBar();
    refocusEditor();
  }

  async function runCode(mode: RunMode = "all") {
    if (state.isRunning) return;
    state.isRunning = true;
    updateStatusBar();

    runBtn.disabled = true;
    runModeBtn.disabled = true;

    try {
      if (!state.pyodideInstance) await initializePyodide();

      const code = getCodeForMode(mode);
      if (!code || !code.trim()) {
        addConsoleLine(mode === "selection" ? "No selection to run." : "Nothing to run.", {
          dim: true
        });
        return;
      }

      addConsoleLine(`Executing (${getRunModeLabel(mode)})…`, { dim: true });

      const t0 = performance.now();
      await state.pyodideInstance.runPythonAsync(code);

      const output = state.pyodideInstance.runPython("sys.stdout.getvalue()");
      if (output && output.trim().length) {
        output.split("\n").forEach((line: string) => {
          if (line.trim()) addConsoleLine(line);
        });
      }

      state.pyodideInstance.runPython("sys.stdout.truncate(0); sys.stdout.seek(0)");

      const dt = performance.now() - t0;
      if (prefs.showExecTime) {
        addConsoleLine(`Finished in ${formatDuration(dt)}.`, { dim: true });
      }
    } catch (err) {
      const msg = err?.toString?.() ?? String(err);
      msg.split("\n").forEach((l: string) => {
        if (l.trim()) addConsoleLine(l, { error: true });
      });
      addConsoleLine("Finished with errors.", { dim: true });
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
      addConsoleLine("Open cancelled.", { dim: true });
      refocusEditor();
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      editor.setValue(String((ev.target as FileReader).result ?? ""));
      setFilename(file.name);
      lastSavedContent = editor.getValue();
      setDirty(false);
      addConsoleLine(`Loaded: ${file.name}`, { dim: true });
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
    addConsoleLine(`Saved: ${a.download}`, { dim: true });

    refocusEditor();
  }

  function toggleWrap() {
    prefs.lineWrap = !prefs.lineWrap;
    savePrefs(prefs);
    applyPrefs();
    addConsoleLine(`Line wrap: ${prefs.lineWrap ? "on" : "off"}`, { dim: true });
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

  function closeAnyModal() {
    closeAbout();
    closeSettings();
  }

  aboutOverlay.addEventListener("click", (e) => {
    if (e.target === aboutOverlay) closeAbout();
  });
  settingsOverlay.addEventListener("click", (e) => {
    if (e.target === settingsOverlay) closeSettings();
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

    hintRun.textContent = `${mod} Enter`;
    hintOpen.textContent = `${mod} O`;
    hintSave.textContent = `${mod} S`;
    hintSettings.textContent = `${mod} ,`;

    const shortcuts = [
      { keys: [mod, "Enter"], desc: "Run (uses Run Mode config)" },
      { keys: [mod, "Shift", "Enter"], desc: "Run current cell (# %%)" },
      { keys: [mod, "S"], desc: "Save file" },
      { keys: [mod, "O"], desc: "Open file" },
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

  moreBtn.addEventListener("click", toggleMenu);

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
  refocusEditor();
  if (loadingOverlay) {
    requestAnimationFrame(() => {
      loadingOverlay.classList.add("hidden");
    });
  }
}
