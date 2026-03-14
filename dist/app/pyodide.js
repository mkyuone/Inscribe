// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2023-2026 Mark Yu
import { formatDuration } from "../utils/time.js";
import { APP_BANNER } from "../app-meta.js";
import { BUILD_TIME } from "../version.js";
function normalizeWorkspacePath(path) {
    const parts = String(path || "")
        .replaceAll("\\", "/")
        .split("/");
    const sanitized = [];
    for (const rawPart of parts) {
        const part = rawPart.trim();
        if (!part || part === ".")
            continue;
        if (part === ".." || part.includes("\0"))
            return "";
        sanitized.push(part);
    }
    return sanitized.join("/");
}
function base64ToBytes(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}
function bytesToBase64(bytes) {
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
}
function toWorkerWorkspaceSnapshot(activePath, files) {
    const sanitizedFiles = [];
    for (const file of files) {
        const path = normalizeWorkspacePath(file.path);
        if (!path)
            continue;
        if (file.encoding === "base64") {
            sanitizedFiles.push({
                path,
                mime: file.mime || "",
                kind: "binary",
                bytes: base64ToBytes(file.content)
            });
            continue;
        }
        sanitizedFiles.push({
            path,
            mime: file.mime || "",
            kind: "text",
            text: file.content
        });
    }
    return {
        activePath: normalizeWorkspacePath(activePath),
        files: sanitizedFiles
    };
}
function fromWorkerWorkspaceFiles(files) {
    const nextFiles = [];
    for (const file of files || []) {
        const path = normalizeWorkspacePath(file.path);
        if (!path)
            continue;
        if (file.kind === "binary") {
            nextFiles.push({
                path,
                mime: file.mime || "",
                encoding: "base64",
                content: bytesToBase64(file.bytes)
            });
            continue;
        }
        nextFiles.push({
            path,
            mime: file.mime || "",
            encoding: "utf8",
            content: file.text
        });
    }
    return nextFiles;
}
export function createPyodideController(state, addConsoleLine, updateStatusBar, refocusEditor, getCodeForMode, getWorkspaceFiles, getActiveFilename, getRunModeLabel, runBtn, runModeBtn, runGroup, prefs, resetStdoutBuffer, beginRunCapture, flushStdoutBuffer, getRunStdout, handleStdout, requestInput, cancelActiveInput, showIsolationWarning, confirmAsyncioRun, onReadyToast, onVariables, onWorkspaceFiles, onRunFinished) {
    const inputMaxBytes = 64 * 1024;
    const supportsBlockingInput = typeof SharedArrayBuffer !== "undefined" && window.crossOriginIsolated === true;
    let worker = null;
    let stdinSab = null;
    let stdinI32 = null;
    let stdinU8 = null;
    let interruptSab = null;
    let interruptI32 = null;
    let runResolve = null;
    let runCompletionPromise = null;
    let runStart = 0;
    let lastRunDurationMs = null;
    let warnedIsolation = false;
    let warnedAsyncioRun = false;
    let readyNotified = false;
    let interruptedRun = false;
    const RUN_STOP_SWITCH_DELAY_MS = 600;
    let runStopStateTimer = null;
    let activeRunToken = 0;
    let pendingFatalMemory = false;
    const runIcon = runBtn.querySelector(".material-icons");
    const runLabelEl = runBtn.querySelector("#runLabel");
    const hintRunEl = runBtn.querySelector("#hintRun");
    function setRunButtonState(running) {
        if (running) {
            runGroup.classList.add("running");
            runBtn.classList.remove("primary");
            runBtn.classList.add("danger");
            if (runIcon)
                runIcon.textContent = "stop_circle";
            if (runLabelEl)
                runLabelEl.textContent = "Stop";
            if (hintRunEl)
                hintRunEl.style.display = "none";
            runBtn.title = "Stop execution";
            runBtn.setAttribute("aria-label", "Stop execution");
        }
        else {
            runGroup.classList.remove("running");
            runBtn.classList.add("primary");
            runBtn.classList.remove("danger");
            if (runIcon)
                runIcon.textContent = "play_arrow";
            if (runLabelEl)
                runLabelEl.textContent = `Run ${getRunModeLabel(state.runMode)}`;
            if (hintRunEl)
                hintRunEl.style.display = "";
            runBtn.title = `Run ${getRunModeLabel(state.runMode)} (Cmd/Ctrl + Enter)`;
            runBtn.setAttribute("aria-label", "Run code");
        }
    }
    function clearRunStopStateTimer() {
        if (runStopStateTimer !== null) {
            window.clearTimeout(runStopStateTimer);
            runStopStateTimer = null;
        }
    }
    function scheduleRunStopState(runToken) {
        clearRunStopStateTimer();
        runStopStateTimer = window.setTimeout(() => {
            runStopStateTimer = null;
            if (!state.isRunning || activeRunToken !== runToken)
                return;
            setRunButtonState(true);
        }, RUN_STOP_SWITCH_DELAY_MS);
    }
    function setReady(ready) {
        state.pyodideReady = ready;
        updateStatusBar();
    }
    function disposeWorker(opts = {}) {
        const workerToDispose = worker;
        worker = null;
        if (workerToDispose) {
            try {
                if (opts.notifyWorker !== false) {
                    workerToDispose.postMessage({ type: "reset" });
                }
            }
            catch {
                // ignore worker teardown errors
            }
            workerToDispose.terminate();
        }
        stdinSab = null;
        stdinI32 = null;
        stdinU8 = null;
        interruptSab = null;
        interruptI32 = null;
    }
    function handleFatalMemoryExhaustion() {
        disposeWorker({ notifyWorker: false });
        resetStdoutBuffer();
        setReady(false);
        pendingFatalMemory = false;
        onVariables({ items: [], truncated: false });
        addConsoleLine("Pyodide ran out of memory and was restarted. Run again to continue.", {
            dim: true,
            system: true
        });
        updateStatusBar();
    }
    function postToWorker(message) {
        if (!worker)
            return;
        worker.postMessage(message);
    }
    function ensureWorker(opts = {}) {
        if (worker)
            return true;
        if (!supportsBlockingInput) {
            if (!warnedIsolation) {
                addConsoleLine("Blocking input requires cross-origin isolation (COOP/COEP headers).", { error: true });
                addConsoleLine("Enable COOP/COEP on your host to use input() and time.sleep().", { dim: true, system: true });
                addConsoleLine("Tip: check `self.crossOriginIsolated` in DevTools.", {
                    dim: true,
                    system: true
                });
                warnedIsolation = true;
            }
            showIsolationWarning();
            return false;
        }
        if (!opts.silent) {
            addConsoleLine("Loading Pyodide… This may take a moment on first run.", {
                dim: true,
                system: true
            });
        }
        setReady(false);
        stdinSab = new SharedArrayBuffer(8 + inputMaxBytes);
        stdinI32 = new Int32Array(stdinSab, 0, 2);
        stdinU8 = new Uint8Array(stdinSab, 8);
        interruptSab = new SharedArrayBuffer(4);
        interruptI32 = new Int32Array(interruptSab);
        const workerUrl = `dist/worker/pyodide-worker.js?v=${encodeURIComponent(BUILD_TIME)}`;
        const nextWorker = new Worker(workerUrl);
        worker = nextWorker;
        nextWorker.onmessage = (event) => {
            if (worker !== nextWorker)
                return;
            handleWorkerMessage(event.data);
        };
        nextWorker.onerror = (event) => {
            if (worker !== nextWorker)
                return;
            addConsoleLine(`Worker error: ${event.message || "unknown"}`, { error: true });
            disposeWorker({ notifyWorker: false });
            setReady(false);
            onVariables({ items: [], truncated: false });
            if (runResolve) {
                runResolve(false);
                runResolve = null;
            }
            runCompletionPromise = null;
            updateStatusBar();
        };
        const initMessage = {
            type: "init",
            stdinSab,
            stdinMaxBytes: inputMaxBytes,
            interruptSab
        };
        postToWorker(initMessage);
        return true;
    }
    async function handleInputRequest(prompt) {
        if (!stdinI32 || !stdinU8) {
            addConsoleLine("Input bridge unavailable. Check cross-origin isolation.", {
                error: true
            });
            return;
        }
        const value = await requestInput(prompt);
        const encoder = new TextEncoder();
        const bytes = encoder.encode(value);
        const length = Math.min(bytes.length, stdinU8.length);
        stdinU8.set(bytes.subarray(0, length));
        stdinI32[1] = length;
        Atomics.store(stdinI32, 0, 2);
        Atomics.notify(stdinI32, 0, 1);
    }
    function handleWorkerMessage(message) {
        switch (message.type) {
            case "ready":
                setReady(true);
                if (!readyNotified) {
                    onReadyToast();
                    readyNotified = true;
                }
                addConsoleLine("Inscribe Editor & Execution with Pyodide", {
                    dim: true,
                    system: true
                });
                addConsoleLine(APP_BANNER, {
                    dim: true,
                    system: true
                });
                addConsoleLine("------------------------------------------", { dim: true, system: true });
                break;
            case "status":
                setReady(!!message.ready);
                break;
            case "stdout":
                handleStdout(message.text);
                break;
            case "stdout-flush":
                flushStdoutBuffer();
                break;
            case "error-line":
                if (message.text.includes("MemoryError") ||
                    /out of memory|allocation failed|cannot allocate memory|oom|memory access out of bounds/i.test(message.text)) {
                    pendingFatalMemory = true;
                }
                if (message.text.trim())
                    addConsoleLine(message.text, { error: true });
                break;
            case "interrupted":
                addConsoleLine("Execution interrupted.", { dim: true, system: true });
                interruptedRun = true;
                break;
            case "input":
                void handleInputRequest(message.prompt);
                break;
            case "run-complete":
                lastRunDurationMs =
                    typeof message.durationMs === "number" ? message.durationMs : null;
                if (message.fatal === "memory" || pendingFatalMemory) {
                    handleFatalMemoryExhaustion();
                }
                pendingFatalMemory = false;
                if (runResolve) {
                    runResolve(message.ok);
                    runResolve = null;
                }
                runCompletionPromise = null;
                break;
            case "vars":
                onVariables({ items: message.items || [], truncated: message.truncated });
                break;
            case "workspace-sync":
                onWorkspaceFiles(fromWorkerWorkspaceFiles(message.sync.files || []), {
                    activePath: normalizeWorkspacePath(message.sync.activePath),
                    deletedPaths: (message.sync.deletedPaths || []).map((path) => normalizeWorkspacePath(path))
                });
                break;
            case "workspace-files":
                onWorkspaceFiles(message.files || []);
                break;
            default:
                break;
        }
    }
    function resetEnvironment() {
        disposeWorker();
        resetStdoutBuffer();
        setReady(false);
        onVariables({ items: [], truncated: false });
        addConsoleLine("Environment reset. Next run will reload Pyodide.", {
            dim: true,
            system: true
        });
        updateStatusBar();
        refocusEditor();
    }
    async function runCode(mode = "all") {
        var _a, _b;
        if (state.isRunning)
            return;
        state.isRunning = true;
        activeRunToken += 1;
        const runToken = activeRunToken;
        updateStatusBar();
        runBtn.disabled = false;
        runModeBtn.disabled = true;
        setRunButtonState(false);
        scheduleRunStopState(runToken);
        resetStdoutBuffer();
        beginRunCapture();
        lastRunDurationMs = null;
        pendingFatalMemory = false;
        let didRun = false;
        let runOk = false;
        let durationMs = 0;
        try {
            const code = getCodeForMode(mode);
            if (!code || !code.trim()) {
                addConsoleLine(mode === "selection" ? "No selection to run." : "Nothing to run.", {
                    dim: true,
                    system: true
                });
                return;
            }
            const asyncioRunPattern = /\basyncio\.run\s*\(/;
            const loopRunPattern = /\brun_until_complete\s*\(/;
            if (!warnedAsyncioRun && (asyncioRunPattern.test(code) || loopRunPattern.test(code))) {
                const proceed = await confirmAsyncioRun();
                if (!proceed)
                    return;
                warnedAsyncioRun = true;
            }
            if (!ensureWorker())
                return;
            addConsoleLine(`Executing (${getRunModeLabel(mode)})…`, {
                dim: true,
                system: true
            });
            runStart = performance.now();
            if (interruptI32) {
                Atomics.store(interruptI32, 0, 0);
            }
            runCompletionPromise = new Promise((resolve) => {
                runResolve = resolve;
            });
            const runMessage = {
                type: "run",
                code,
                mode,
                workspace: toWorkerWorkspaceSnapshot(getActiveFilename(), getWorkspaceFiles())
            };
            postToWorker(runMessage);
            didRun = true;
            const ok = await runCompletionPromise;
            runOk = ok;
            flushStdoutBuffer();
            const dt = typeof lastRunDurationMs === "number"
                ? lastRunDurationMs
                : performance.now() - runStart;
            durationMs = dt;
            if (prefs.showExecTime) {
                addConsoleLine(`Finished in ${formatDuration(dt)}.`, { dim: true, system: true });
            }
            if (!ok && !interruptedRun) {
                addConsoleLine("Finished with errors.", { dim: true, system: true });
            }
        }
        catch (err) {
            runOk = false;
            const msg = (_b = (_a = err === null || err === void 0 ? void 0 : err.toString) === null || _a === void 0 ? void 0 : _a.call(err)) !== null && _b !== void 0 ? _b : String(err);
            msg.split("\n").forEach((l) => {
                if (l.trim())
                    addConsoleLine(l, { error: true });
            });
            if (msg.includes("MemoryError") ||
                /out of memory|allocation failed|cannot allocate memory|oom|memory access out of bounds/i.test(msg)) {
                pendingFatalMemory = true;
                handleFatalMemoryExhaustion();
            }
            addConsoleLine("Finished with errors.", { dim: true, system: true });
        }
        finally {
            clearRunStopStateTimer();
            if (didRun) {
                onRunFinished({
                    ok: runOk,
                    durationMs,
                    stdout: getRunStdout(),
                    interrupted: interruptedRun
                });
            }
            interruptedRun = false;
            state.isRunning = false;
            updateStatusBar();
            runBtn.disabled = false;
            runModeBtn.disabled = false;
            setRunButtonState(false);
            if (interruptI32) {
                Atomics.store(interruptI32, 0, 0);
            }
            refocusEditor();
        }
    }
    async function stopExecution() {
        if (!state.isRunning)
            return;
        const waitForCompletion = async (timeoutMs) => {
            if (!runCompletionPromise)
                return true;
            const timeout = new Promise((resolve) => setTimeout(() => resolve(false), timeoutMs));
            return Promise.race([runCompletionPromise.then(() => true), timeout]);
        };
        if (stdinI32 && Atomics.load(stdinI32, 0) === 1) {
            cancelActiveInput();
            stdinI32[1] = -1;
            Atomics.store(stdinI32, 0, 2);
            Atomics.notify(stdinI32, 0, 1);
        }
        if (await waitForCompletion(300))
            return;
        if (interruptI32) {
            Atomics.store(interruptI32, 0, 2);
            Atomics.notify(interruptI32, 0, 1);
        }
        if (await waitForCompletion(600))
            return;
        addConsoleLine("Force-stopping execution and resetting environment.", {
            dim: true,
            system: true
        });
        disposeWorker({ notifyWorker: false });
        if (runResolve) {
            runResolve(false);
            runResolve = null;
        }
        runCompletionPromise = null;
        setReady(false);
    }
    function warmStart() {
        ensureWorker({ silent: true });
    }
    return { runCode, resetEnvironment, warmStart, stopExecution };
}
