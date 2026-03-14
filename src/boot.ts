// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2023-2026 Mark Yu

import { LS_KEYS } from "./constants.js";
import { debounce } from "./utils/dom.js";
import { safeLS } from "./utils/storage.js";
import { createConsoleController } from "./app/console.js";
import { getDomRefs } from "./app/dom-refs.js";
import { createEditorController } from "./app/editor.js";
import { createFileController } from "./app/files.js";
import { createHistoryController } from "./app/history.js";
import { createHistoryUiController } from "./app/history-ui.js";
import { createFindReplaceController } from "./app/find-replace.js";
import { setupConsoleInput } from "./app/input.js";
import { APP_BANNER } from "./app-meta.js";
import { createPrintController, PrintController } from "./app/print.js";
import { createPyodideController, PyodideController } from "./app/pyodide.js";
import { createVariablesController } from "./app/variables.js";
import { registerServiceWorker } from "./app/pwa.js";
import { loadPrefs, applyPrefs, savePrefs, bindPrefsUI, resetPrefs } from "./app/prefs.js";
import { createShareController } from "./app/share.js";
import { createInitialState } from "./app/state.js";
import { setFilenameStatus, updateCursorStatus, updateStatusBar } from "./app/status.js";
import { createTabsController, TabsController } from "./app/tabs.js";
import { createToastVisibility } from "./app/toast.js";
import { getRunModeLabel, setRunMode, updateRunModeUI } from "./app/run-mode.js";
import { createRefocusEditor, createUiController, UiController } from "./app/ui.js";
import { APP_VERSION, BUILD_TIME, COMMIT_HASH } from "./version.js";

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

function applyStartupShellPrefs() {
  const prefs = loadPrefs();

  const splitPane = document.getElementById("splitPane");
  const editorPane = document.getElementById("editorPane") as HTMLDivElement | null;
  const resizer = document.getElementById("dragbar");

  if (splitPane) {
    splitPane.classList.toggle("horizontal", !!prefs.splitHorizontal);
  }
  if (resizer) {
    resizer.setAttribute("aria-orientation", prefs.splitHorizontal ? "vertical" : "horizontal");
  }
  if (editorPane) {
    if (prefs.splitHorizontal) {
      editorPane.style.height = "";
    } else {
      editorPane.style.width = "";
    }
  }

  const themeMedia = window.matchMedia("(prefers-color-scheme: dark)");
  const resolvedTheme =
    prefs.theme === "system" ? (themeMedia.matches ? "dark" : "light") : prefs.theme;
  document.documentElement.dataset.theme = resolvedTheme;

  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) {
    themeColor.setAttribute("content", resolvedTheme === "dark" ? "#0b0f1a" : "#2563eb");
  }

  return prefs;
}

let booted = false;

export async function boot() {
  if (booted) return;
  booted = true;

  window.console.info(APP_BANNER);

  const consoleFallback = document.getElementById("console");
  const runBtnFallback = document.getElementById("runBtn") as HTMLButtonElement | null;
  const loadingOverlay = document.getElementById("loadingOverlay") as HTMLDivElement | null;
  const prefs = applyStartupShellPrefs();

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

  const dom = getDomRefs();
  const state = createInitialState();

  const showIsolationWarning = () => {
    dom.isolationBanner.classList.add("show");
  };
  const hideIsolationWarning = () => {
    dom.isolationBanner.classList.remove("show");
  };
  dom.isolationBannerClose.addEventListener("click", () => {
    hideIsolationWarning();
  });
  if (!window.crossOriginIsolated) {
    showIsolationWarning();
  }

  type SystemToastAction = {
    label: string;
    icon?: string;
    onClick: () => void;
  };
  type SystemToastOptions = {
    action?: SystemToastAction;
    durationMs?: number;
  };

  let sysToastTimer: ReturnType<typeof setTimeout> | null = null;
  let sysToastActionHandler: (() => void) | null = null;
  const sysToastVisibility = createToastVisibility(dom.sysToast);

  const clearSystemToastAction = () => {
    sysToastActionHandler = null;
    dom.sysToastActionBtn.innerHTML = "";
    dom.sysToastActionBtn.hidden = true;
    dom.sysToastActions.hidden = true;
  };
  const hideSystemToast = () => {
    if (sysToastTimer) {
      clearTimeout(sysToastTimer);
      sysToastTimer = null;
    }
    sysToastVisibility.hide();
    clearSystemToastAction();
  };

  const showSystemToast = (
    title: string,
    desc: string,
    icon = "check_circle",
    opts?: SystemToastOptions
  ) => {
    dom.sysToastTitle.textContent = title;
    dom.sysToastDesc.textContent = desc;
    dom.sysToastIcon.textContent = icon;

    if (opts?.action) {
      dom.sysToastActionBtn.innerHTML = "";
      if (opts.action.icon) {
        const iconEl = document.createElement("span");
        iconEl.className = "material-icons";
        iconEl.setAttribute("aria-hidden", "true");
        iconEl.textContent = opts.action.icon;
        dom.sysToastActionBtn.appendChild(iconEl);
      }
      const labelEl = document.createElement("span");
      labelEl.textContent = opts.action.label;
      dom.sysToastActionBtn.appendChild(labelEl);
      dom.sysToastActionBtn.hidden = false;
      dom.sysToastActions.hidden = false;
      sysToastActionHandler = opts.action.onClick;
    } else {
      clearSystemToastAction();
    }

    sysToastVisibility.show();
    if (sysToastTimer) clearTimeout(sysToastTimer);
    const timeoutMs = opts?.durationMs ?? (opts?.action ? 3200 : 2400);
    sysToastTimer = setTimeout(() => {
      hideSystemToast();
    }, timeoutMs);
  };
  dom.sysToastActionBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const action = sysToastActionHandler;
    if (!action) return;
    action();
    hideSystemToast();
  });
  dom.sysToast.addEventListener("click", () => {
    hideSystemToast();
  });

  const notifySystem = (
    title: string,
    desc: string,
    icon = "info",
    opts?: SystemToastOptions
  ) => {
    showSystemToast(title, desc, icon, opts);
  };

  const consoleApi = createConsoleController(dom, showSystemToast);
  consoleApi.attachStdoutHandlers();

  const inputCtrl = setupConsoleInput(dom.consoleEl);
  const varsCtrl = createVariablesController(dom);

  let updatePrintConfirmState = () => {};

  const historyCtrl = createHistoryController();
  let lastHistoryCode = "";
  let lastHistoryTs = 0;
  let recordAutoSnapshot = () => {};
  let tabsCtrl: TabsController | null = null;
  const legacyFilename = safeLS.get(LS_KEYS.FILENAME) || "untitled.py";
  const legacyDraft = safeLS.get(LS_KEYS.DRAFT);
  const hasStoredTabs = !!safeLS.get(LS_KEYS.TABS);

  const editorCtrl = createEditorController(
    dom,
    prefs,
    (isDirty) => {
      if (tabsCtrl) {
        tabsCtrl.setActiveDirty(!!isDirty);
      }
      state.isDirty = tabsCtrl ? tabsCtrl.hasDirtyTabs() : !!isDirty;
      updateStatusBar(state, dom);
    },
    () => {
      if (tabsCtrl) {
        tabsCtrl.updateActiveContent(editorCtrl.getValue());
      }
      if (dom.printOverlay.classList.contains("active")) updatePrintConfirmState();
      recordAutoSnapshot();
    }
  );

  recordAutoSnapshot = debounce(() => {
    const code = editorCtrl.getValue();
    if (!code.trim()) return;
    if (code === lastHistoryCode) return;
    const now = Date.now();
    if (now - lastHistoryTs < 15000) return;
    lastHistoryCode = code;
    lastHistoryTs = now;
    void historyCtrl.addEdit({ ts: now, kind: "auto", code });
  }, 15000);

  const refocusEditor = createRefocusEditor(dom, editorCtrl.editor);
  createFindReplaceController(dom, editorCtrl.editor, refocusEditor);

  tabsCtrl = createTabsController({
    dom,
    initialContent: editorCtrl.getValue(),
    legacyFilename,
    legacyDraft,
    setEditorDocument: (content, savedContent) => {
      editorCtrl.loadDocument(content, savedContent);
    },
    refocusEditor,
    onActiveFilenameChange: (name) => {
      setFilenameStatus(name, dom);
    },
    onAnyDirtyChange: (dirty) => {
      state.isDirty = dirty;
      updateStatusBar(state, dom);
    },
    onNotify: notifySystem
  });

  const fileCtrl = createFileController(
    dom,
    {
      onOpenFileText: (filename, content) => {
        tabsCtrl?.openFileAsTab(filename, content);
      },
      getActiveFilename: () => tabsCtrl?.getActiveFilename() || "untitled.py",
      getActiveContent: () => tabsCtrl?.getActiveContent() || editorCtrl.getValue(),
      onSaved: (name) => {
        tabsCtrl?.markActiveSaved();
        setFilenameStatus(name, dom);
        editorCtrl.markSaved();
      },
      onNotify: notifySystem,
      refocusEditor
    }
  );

  const saveWithHistory = () => {
    const code = editorCtrl.getValue();
    if (code.trim()) {
      const now = Date.now();
      lastHistoryCode = code;
      lastHistoryTs = now;
      void historyCtrl.addEdit({ ts: now, kind: "manual", code });
    }
    fileCtrl.saveFile();
  };

  let ui: UiController;
  let printCtrl: PrintController;
  let pyodideCtrl: PyodideController;

  const historyUi = createHistoryUiController(dom, historyCtrl, editorCtrl.editor, refocusEditor);

  const runDefault = () => {
    if (state.isRunning) {
      pyodideCtrl.stopExecution();
      return;
    }
    const code = editorCtrl.getValue();
    if (code.trim()) {
      const now = Date.now();
      lastHistoryCode = code;
      lastHistoryTs = now;
      void historyCtrl.addEdit({ ts: now, kind: "run", code });
    }
    void pyodideCtrl.runCode(state.runMode);
  };
  const runCell = () => {
    const code = editorCtrl.getValue();
    if (code.trim()) {
      const now = Date.now();
      lastHistoryCode = code;
      lastHistoryTs = now;
      void historyCtrl.addEdit({ ts: now, kind: "run", code });
    }
    void pyodideCtrl.runCode("cell");
  };
  const openPrintModal = () => printCtrl.openPrintModal();
  const openSettings = () => ui.openSettings();
  const createNewTab = () => {
    tabsCtrl?.createNewTab();
  };
  const renameActiveTab = () => {
    tabsCtrl?.renameActiveTab();
  };
  const activateNextTab = () => {
    tabsCtrl?.activateNextTab();
  };
  const activatePreviousTab = () => {
    tabsCtrl?.activatePreviousTab();
  };

  ui = createUiController(
    dom,
    editorCtrl.editor,
    refocusEditor,
    runDefault,
    runCell,
    saveWithHistory,
    () => fileCtrl.openFile(),
    openPrintModal,
    openSettings,
    createNewTab,
    renameActiveTab,
    activateNextTab,
    activatePreviousTab
  );

  printCtrl = createPrintController(
    dom,
    () => editorCtrl.getValue(),
    consoleApi.collectOutput,
    ui.closeMenu,
    ui.openPrint,
    ui.closePrint
  );

  updatePrintConfirmState = printCtrl.updatePrintConfirmState;

  const confirmAsyncioRun = () =>
    new Promise<boolean>((resolve) => {
      dom.asyncWarnOverlay.classList.add("active");

      const cleanup = () => {
        dom.asyncWarnCancelBtn.removeEventListener("click", onCancel);
        dom.asyncWarnConfirmBtn.removeEventListener("click", onConfirm);
        dom.asyncWarnOverlay.removeEventListener("click", onBackdrop);
      };
      const onCancel = () => {
        dom.asyncWarnOverlay.classList.remove("active");
        cleanup();
        resolve(false);
      };
      const onConfirm = () => {
        dom.asyncWarnOverlay.classList.remove("active");
        cleanup();
        resolve(true);
      };
      const onBackdrop = (e: MouseEvent) => {
        if (e.target === dom.asyncWarnOverlay) onCancel();
      };

      dom.asyncWarnCancelBtn.addEventListener("click", onCancel);
      dom.asyncWarnConfirmBtn.addEventListener("click", onConfirm);
      dom.asyncWarnOverlay.addEventListener("click", onBackdrop);
    });

  pyodideCtrl = createPyodideController(
    state,
    consoleApi.addLine,
    () => updateStatusBar(state, dom),
    refocusEditor,
    editorCtrl.getCodeForMode,
    getRunModeLabel,
    dom.runBtn,
    dom.runModeBtn,
    dom.runGroup,
    prefs,
    consoleApi.resetStdoutBuffer,
    consoleApi.beginRunCapture,
    consoleApi.flushStdoutBuffer,
    consoleApi.getRunStdout,
    consoleApi.handleStdout,
    inputCtrl.requestInput,
    inputCtrl.cancelActiveInput,
    showIsolationWarning,
    confirmAsyncioRun,
    () => showSystemToast("Pyodide ready", "You can run code now."),
    ({ items, truncated }) => {
      varsCtrl.setVariables(items, truncated);
    },
    ({ stdout, interrupted }) => {
      if (!stdout || !stdout.trim()) return;
      const now = Date.now();
      void historyCtrl.addOutput({
        ts: now,
        kind: interrupted ? "interrupt" : "run",
        stdout
      });
    }
  );

  const shareCtrl = createShareController(
    dom,
    () => editorCtrl.getValue(),
    consoleApi.addLine,
    () => fileCtrl.saveFile(),
    refocusEditor
  );

  dom.aboutVersion.textContent = `v${APP_VERSION}`;
  dom.aboutBuildTime.textContent = BUILD_TIME;
  dom.aboutCommitHash.textContent = COMMIT_HASH;

  const shared = await shareCtrl.readSharedCodeFromUrl();
  if (shared && shared.code.trim().length) {
    tabsCtrl?.replaceActiveTab("shared.py", shared.code);
    lastHistoryCode = shared.code;
    lastHistoryTs = Date.now();
    void historyCtrl.addEdit({ ts: lastHistoryTs, kind: "shared", code: shared.code });
    shareCtrl.showToast("Shared code loaded", "This editor opened code from a share link.");
  } else if (!hasStoredTabs && legacyDraft && legacyDraft.trim().length) {
    lastHistoryCode = legacyDraft;
    lastHistoryTs = Date.now();
    notifySystem("Draft restored", "Recovered your previous unsaved draft.", "restore");
  }

  function toggleWrap() {
    prefs.lineWrap = !prefs.lineWrap;
    savePrefs(prefs);
    applyPrefs(prefs, editorCtrl.editor, dom);
    notifySystem("Line wrap", prefs.lineWrap ? "Enabled." : "Disabled.", "wrap_text");
    refocusEditor();
  }

  dom.runBtn.addEventListener("click", runDefault);
  dom.runModeBtn.addEventListener("click", ui.toggleRunMenu);
  dom.editorActionsBtn.addEventListener("click", ui.toggleEditorActions);

  dom.runAllBtn.addEventListener("click", () => {
    setRunMode("all", dom, (next) => {
      state.runMode = next;
    }, (_text) => notifySystem("Run mode", "Set to All.", "play_arrow"));
    ui.closeRunMenu();
    refocusEditor();
  });
  dom.runSelBtn.addEventListener("click", () => {
    setRunMode("selection", dom, (next) => {
      state.runMode = next;
    }, (_text) => notifySystem("Run mode", "Set to Selection.", "select_all"));
    ui.closeRunMenu();
    refocusEditor();
  });
  dom.runCellBtn.addEventListener("click", () => {
    setRunMode("cell", dom, (next) => {
      state.runMode = next;
    }, (_text) => notifySystem("Run mode", "Set to Cell.", "view_agenda"));
    ui.closeRunMenu();
    refocusEditor();
  });

  dom.openBtn.addEventListener("click", () => fileCtrl.openFile());
  dom.saveBtn.addEventListener("click", saveWithHistory);
  dom.shareBtn.addEventListener("click", () => {
    void shareCtrl.shareCode();
  });

  dom.moreBtn.addEventListener("click", ui.toggleMenu);

  dom.printBtn.addEventListener("click", () => {
    ui.closeMenu();
    openPrintModal();
  });
  dom.historyBtn.addEventListener("click", () => {
    ui.closeMenu();
    historyUi.openHistory();
  });
  dom.shareMenuBtn.addEventListener("click", () => {
    ui.closeMenu();
    void shareCtrl.shareCode();
  });
  dom.resetBtn.addEventListener("click", () => {
    ui.closeMenu();
    pyodideCtrl.resetEnvironment();
  });
  dom.settingsBtn.addEventListener("click", () => {
    ui.closeMenu();
    ui.openSettings();
  });
  dom.shortcutsBtn.addEventListener("click", () => {
    ui.closeMenu();
    ui.openShortcuts();
  });
  dom.aboutBtn.addEventListener("click", () => {
    ui.closeMenu();
    ui.openAbout();
  });
  dom.closeLicenseBtn.addEventListener("click", () => {
    ui.closeLicense();
    refocusEditor();
  });
  dom.undoBtn.addEventListener("click", () => {
    ui.closeEditorActions();
    editorCtrl.editor.undo();
    refocusEditor();
  });
  dom.redoBtn.addEventListener("click", () => {
    ui.closeEditorActions();
    editorCtrl.editor.redo();
    refocusEditor();
  });
  dom.renameTabBtn.addEventListener("click", () => {
    ui.closeEditorActions();
    tabsCtrl?.renameActiveTab();
  });
  dom.closeTabBtn.addEventListener("click", () => {
    ui.closeEditorActions();
    tabsCtrl?.closeActiveTab();
    refocusEditor();
  });

  dom.wrapBtn.addEventListener("click", () => {
    ui.closeEditorActions();
    toggleWrap();
  });

  dom.clearConsoleBtn.addEventListener("click", consoleApi.clearWithUndo);
  dom.varsToggleBtn.addEventListener("click", () => {
    varsCtrl.toggle();
    refocusEditor();
  });

  dom.closeAboutBtn.addEventListener("click", () => {
    ui.closeAbout();
    refocusEditor();
  });
  dom.closeSettingsBtn.addEventListener("click", () => {
    ui.closeSettings();
    refocusEditor();
  });
  dom.openShortcutsBtn.addEventListener("click", () => {
    ui.openShortcuts();
  });
  dom.closeShortcutsBtn.addEventListener("click", () => {
    ui.closeShortcuts();
    refocusEditor();
  });
  dom.printCancelBtn.addEventListener("click", () => {
    ui.closePrint();
    refocusEditor();
  });
  dom.printConfirmBtn.addEventListener("click", printCtrl.handlePrintConfirm);

  [
    dom.printIncludeCode,
    dom.printIncludeOutput,
    dom.printLineNumbers,
    dom.printWrapLines,
    dom.printBranding,
    dom.printTimestamp
  ].forEach((input) => {
    input.addEventListener("change", () => {
      printCtrl.updatePrintConfirmState();
    });
  });

  const updateCursorDebounced = debounce(() => updateCursorStatus(editorCtrl.editor, dom), 40);
  editorCtrl.editor.on("cursorActivity", updateCursorDebounced);

  bindPrefsUI(prefs, editorCtrl.editor, dom);
  applyPrefs(prefs, editorCtrl.editor, dom);
  dom.resetPrefsBtn.addEventListener("click", () => {
    resetPrefs(prefs, editorCtrl.editor, dom);
    notifySystem("Settings reset", "Preferences restored to defaults.", "settings_backup_restore");
  });

  ui.bindModalDismiss();
  ui.bindMenuDismiss();
  ui.bindGlobalShortcuts();
  ui.bindResizer();
  ui.setHints();

  window.addEventListener("beforeunload", (e) => {
    if (!state.isDirty) return;
    const msg = "You have unsaved code. Leave without saving?";
    e.preventDefault();
    e.returnValue = msg;
    return msg;
  });

  consoleApi.clear(true);
  updateStatusBar(state, dom);
  updateCursorStatus(editorCtrl.editor, dom);
  updateRunModeUI(state.runMode, dom);
  registerServiceWorker();
  refocusEditor();

  setTimeout(() => {
    pyodideCtrl.warmStart();
  }, 250);


  if (loadingOverlay) {
    requestAnimationFrame(() => {
      loadingOverlay.classList.add("hidden");
    });
  }
}
