import { LS_KEYS } from "./constants.js";
import { debounce } from "./utils/dom.js";
import { safeLS } from "./utils/storage.js";
import { createConsoleController } from "./app/console.js";
import { getDomRefs } from "./app/dom-refs.js";
import { createEditorController } from "./app/editor.js";
import { createFileController } from "./app/files.js";
import { setupConsoleInput } from "./app/input.js";
import { createPrintController } from "./app/print.js";
import { createPyodideController } from "./app/pyodide.js";
import { registerServiceWorker } from "./app/pwa.js";
import { loadPrefs, applyPrefs, savePrefs, bindPrefsUI, resetPrefs } from "./app/prefs.js";
import { createShareController } from "./app/share.js";
import { createInitialState } from "./app/state.js";
import { setFilenameStatus, updateClock, updateCursorStatus, updateStatusBar } from "./app/status.js";
import { getRunModeLabel, setRunMode, updateRunModeUI } from "./app/run-mode.js";
import { createRefocusEditor, createUiController } from "./app/ui.js";
import { APP_VERSION, BUILD_TIME, COMMIT_HASH } from "./version.js";
function waitForGlobals(timeoutMs = 9000) {
    return new Promise((resolve, reject) => {
        const start = performance.now();
        const tick = () => {
            const ok = !!(window.CodeMirror && window.loadPyodide);
            if (ok)
                return resolve();
            if (performance.now() - start > timeoutMs) {
                return reject(new Error("Dependencies not loaded: CodeMirror and/or Pyodide missing (CDN blocked / Rocket Loader / network)."));
            }
            requestAnimationFrame(tick);
        };
        tick();
    });
}
let booted = false;
export async function boot() {
    if (booted)
        return;
    booted = true;
    const consoleFallback = document.getElementById("console");
    const runBtnFallback = document.getElementById("runBtn");
    const loadingOverlay = document.getElementById("loadingOverlay");
    function showFatal(msg) {
        console.error(msg);
        if (loadingOverlay)
            loadingOverlay.classList.add("hidden");
        if (runBtnFallback)
            runBtnFallback.disabled = true;
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
        }
        else {
            alert("Editor failed to initialize:\n\n" + msg);
        }
    }
    try {
        await waitForGlobals();
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        showFatal(msg);
        return;
    }
    const dom = getDomRefs();
    const state = createInitialState();
    const prefs = loadPrefs();
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
    let sysToastTimer = null;
    const showSystemToast = (title, desc, icon = "check_circle") => {
        dom.sysToastTitle.textContent = title;
        dom.sysToastDesc.textContent = desc;
        dom.sysToastIcon.textContent = icon;
        dom.sysToast.classList.add("show");
        if (sysToastTimer)
            clearTimeout(sysToastTimer);
        sysToastTimer = setTimeout(() => {
            dom.sysToast.classList.remove("show");
        }, 2400);
    };
    dom.sysToast.addEventListener("click", () => {
        dom.sysToast.classList.remove("show");
    });
    const consoleApi = createConsoleController(dom);
    consoleApi.attachStdoutHandlers();
    const inputCtrl = setupConsoleInput(dom.consoleEl);
    let updatePrintConfirmState = () => { };
    const editorCtrl = createEditorController(dom, prefs, (isDirty) => {
        state.isDirty = !!isDirty;
        updateStatusBar(state, dom);
    }, () => updatePrintConfirmState());
    const refocusEditor = createRefocusEditor(dom, editorCtrl.editor);
    const fileCtrl = createFileController(dom, editorCtrl.editor, (name) => {
        setFilenameStatus(name, dom);
        safeLS.set(LS_KEYS.FILENAME, name);
    }, () => {
        editorCtrl.markSaved();
    }, consoleApi.addLine, refocusEditor);
    let ui;
    let printCtrl;
    let pyodideCtrl;
    const runDefault = () => {
        if (state.isRunning) {
            pyodideCtrl.stopExecution();
            return;
        }
        void pyodideCtrl.runCode(state.runMode);
    };
    const runCell = () => {
        void pyodideCtrl.runCode("cell");
    };
    const openPrintModal = () => printCtrl.openPrintModal();
    const openSettings = () => ui.openSettings();
    ui = createUiController(dom, editorCtrl.editor, refocusEditor, runDefault, runCell, () => fileCtrl.saveFile(), () => fileCtrl.openFile(), openPrintModal, openSettings);
    printCtrl = createPrintController(dom, () => editorCtrl.getValue(), consoleApi.collectOutput, ui.closeMenu, ui.openPrint, ui.closePrint);
    updatePrintConfirmState = printCtrl.updatePrintConfirmState;
    const confirmAsyncioRun = () => new Promise((resolve) => {
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
        const onBackdrop = (e) => {
            if (e.target === dom.asyncWarnOverlay)
                onCancel();
        };
        dom.asyncWarnCancelBtn.addEventListener("click", onCancel);
        dom.asyncWarnConfirmBtn.addEventListener("click", onConfirm);
        dom.asyncWarnOverlay.addEventListener("click", onBackdrop);
    });
    pyodideCtrl = createPyodideController(state, consoleApi.addLine, () => updateStatusBar(state, dom), refocusEditor, editorCtrl.getCodeForMode, getRunModeLabel, dom.runBtn, dom.runModeBtn, dom.runGroup, prefs, consoleApi.resetStdoutBuffer, consoleApi.flushStdoutBuffer, consoleApi.handleStdout, inputCtrl.requestInput, inputCtrl.cancelActiveInput, showIsolationWarning, confirmAsyncioRun, () => showSystemToast("Pyodide ready", "You can run code now."));
    const shareCtrl = createShareController(dom, () => editorCtrl.getValue(), consoleApi.addLine, () => fileCtrl.saveFile(), refocusEditor);
    fileCtrl.setFilename(safeLS.get(LS_KEYS.FILENAME) || "untitled.py");
    dom.aboutVersion.textContent = `v${APP_VERSION}`;
    dom.aboutBuildTime.textContent = BUILD_TIME;
    dom.aboutCommitHash.textContent = COMMIT_HASH;
    const shared = await shareCtrl.readSharedCodeFromUrl();
    const draft = safeLS.get(LS_KEYS.DRAFT);
    if (shared && shared.code.trim().length) {
        editorCtrl.setValue(shared.code);
        fileCtrl.setFilename("shared.py");
        editorCtrl.markSaved();
        safeLS.set(LS_KEYS.DRAFT, editorCtrl.getValue());
        consoleApi.addLine("Loaded shared code from link.", { dim: true, system: true });
        shareCtrl.showToast("Shared code loaded", "This editor opened code from a share link.");
    }
    else if (draft && draft.trim().length) {
        editorCtrl.setValue(draft);
        editorCtrl.markSaved();
        consoleApi.addLine("Restored previous draft.", { dim: true, system: true });
    }
    function toggleWrap() {
        prefs.lineWrap = !prefs.lineWrap;
        savePrefs(prefs);
        applyPrefs(prefs, editorCtrl.editor, dom);
        consoleApi.addLine(`Line wrap: ${prefs.lineWrap ? "on" : "off"}`, {
            dim: true,
            system: true
        });
        refocusEditor();
    }
    dom.runBtn.addEventListener("click", runDefault);
    dom.runModeBtn.addEventListener("click", ui.toggleRunMenu);
    dom.runAllBtn.addEventListener("click", () => {
        setRunMode("all", dom, (next) => {
            state.runMode = next;
        }, consoleApi.addLine);
        ui.closeRunMenu();
        refocusEditor();
    });
    dom.runSelBtn.addEventListener("click", () => {
        setRunMode("selection", dom, (next) => {
            state.runMode = next;
        }, consoleApi.addLine);
        ui.closeRunMenu();
        refocusEditor();
    });
    dom.runCellBtn.addEventListener("click", () => {
        setRunMode("cell", dom, (next) => {
            state.runMode = next;
        }, consoleApi.addLine);
        ui.closeRunMenu();
        refocusEditor();
    });
    dom.openBtn.addEventListener("click", () => fileCtrl.openFile());
    dom.saveBtn.addEventListener("click", () => fileCtrl.saveFile());
    dom.shareBtn.addEventListener("click", () => {
        void shareCtrl.shareCode();
    });
    dom.moreBtn.addEventListener("click", ui.toggleMenu);
    dom.printBtn.addEventListener("click", () => {
        ui.closeMenu();
        openPrintModal();
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
    dom.aboutBtn.addEventListener("click", () => {
        ui.closeMenu();
        ui.openAbout();
    });
    dom.wrapBtn.addEventListener("click", toggleWrap);
    dom.clearConsoleBtn.addEventListener("click", consoleApi.clearWithUndo);
    dom.undoClearBtn.addEventListener("click", consoleApi.undoClear);
    dom.closeAboutBtn.addEventListener("click", () => {
        ui.closeAbout();
        refocusEditor();
    });
    dom.closeSettingsBtn.addEventListener("click", () => {
        ui.closeSettings();
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
        consoleApi.addLine("Settings reset to defaults.", { dim: true, system: true });
    });
    ui.bindModalDismiss();
    ui.bindMenuDismiss();
    ui.bindGlobalShortcuts();
    ui.bindResizer();
    ui.setHints();
    window.addEventListener("beforeunload", (e) => {
        if (!state.isDirty)
            return;
        const msg = "You have unsaved code. Leave without saving?";
        e.preventDefault();
        e.returnValue = msg;
        return msg;
    });
    consoleApi.clear(true);
    updateStatusBar(state, dom);
    updateCursorStatus(editorCtrl.editor, dom);
    updateClock(dom);
    updateRunModeUI(state.runMode, dom);
    registerServiceWorker();
    refocusEditor();
    setTimeout(() => {
        pyodideCtrl.warmStart();
    }, 250);
    setInterval(() => updateClock(dom), 1000);
    if (loadingOverlay) {
        requestAnimationFrame(() => {
            loadingOverlay.classList.add("hidden");
        });
    }
}
