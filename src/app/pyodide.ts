import { formatDuration } from "../utils/time.js";
import { AppState, RunMode } from "./types.js";
import type { VariableItem } from "./variables.js";
import { BUILD_TIME } from "../version.js";

export type PyodideController = {
  runCode: (mode?: RunMode) => Promise<void>;
  resetEnvironment: () => void;
  warmStart: () => void;
  stopExecution: () => void;
};

type WorkerInitMessage = {
  type: "init";
  stdinSab: SharedArrayBuffer;
  stdinMaxBytes: number;
  interruptSab: SharedArrayBuffer;
};

type WorkerRunMessage = {
  type: "run";
  code: string;
};

type WorkerResetMessage = {
  type: "reset";
};

type WorkerMessage = WorkerInitMessage | WorkerRunMessage | WorkerResetMessage;

type WorkerReadyMessage = { type: "ready" };
type WorkerStatusMessage = { type: "status"; ready: boolean };
type WorkerStdoutMessage = { type: "stdout"; text: string };
type WorkerStdoutFlushMessage = { type: "stdout-flush" };
type WorkerInputRequestMessage = { type: "input"; prompt: string };
type WorkerErrorLineMessage = { type: "error-line"; text: string };
type WorkerRunCompleteMessage = { type: "run-complete"; ok: boolean; durationMs?: number };
type WorkerInterruptedMessage = { type: "interrupted" };
type WorkerVarsMessage = { type: "vars"; items: VariableItem[]; truncated?: boolean };

type WorkerInboundMessage =
  | WorkerReadyMessage
  | WorkerStatusMessage
  | WorkerStdoutMessage
  | WorkerStdoutFlushMessage
  | WorkerInputRequestMessage
  | WorkerErrorLineMessage
  | WorkerRunCompleteMessage
  | WorkerInterruptedMessage
  | WorkerVarsMessage;

export function createPyodideController(
  state: AppState,
  addConsoleLine: (text: string, opts?: { dim?: boolean; system?: boolean; error?: boolean }) => void,
  updateStatusBar: () => void,
  refocusEditor: () => void,
  getCodeForMode: (mode: RunMode) => string | null,
  getRunModeLabel: (mode: RunMode) => string,
  runBtn: HTMLButtonElement,
  runModeBtn: HTMLButtonElement,
  runGroup: HTMLDivElement,
  prefs: { showExecTime: boolean },
  resetStdoutBuffer: () => void,
  beginRunCapture: () => void,
  flushStdoutBuffer: () => void,
  getRunStdout: () => string,
  handleStdout: (text: string) => void,
  requestInput: (prompt?: string) => Promise<string>,
  cancelActiveInput: () => void,
  showIsolationWarning: () => void,
  confirmAsyncioRun: () => Promise<boolean>,
  onReadyToast: () => void,
  onVariables: (payload: { items: VariableItem[]; truncated?: boolean }) => void,
  onRunFinished: (result: {
    ok: boolean;
    durationMs: number;
    stdout: string;
    interrupted: boolean;
  }) => void
): PyodideController {
  const inputMaxBytes = 64 * 1024;
  const supportsBlockingInput =
    typeof SharedArrayBuffer !== "undefined" && window.crossOriginIsolated === true;

  let worker: Worker | null = null;
  let stdinSab: SharedArrayBuffer | null = null;
  let stdinI32: Int32Array | null = null;
  let stdinU8: Uint8Array | null = null;
  let interruptSab: SharedArrayBuffer | null = null;
  let interruptI32: Int32Array | null = null;
  let runResolve: ((ok: boolean) => void) | null = null;
  let runCompletionPromise: Promise<boolean> | null = null;
  let runStart = 0;
  let lastRunDurationMs: number | null = null;
  let warnedIsolation = false;
  let warnedAsyncioRun = false;
  let readyNotified = false;
  let interruptedRun = false;

  const runIcon = runBtn.querySelector(".material-icons") as HTMLSpanElement | null;
  const runLabelEl = runBtn.querySelector("#runLabel") as HTMLSpanElement | null;
  const hintRunEl = runBtn.querySelector("#hintRun") as HTMLSpanElement | null;

  function setRunButtonState(running: boolean) {
    if (running) {
      runGroup.classList.add("running");
      runBtn.classList.remove("primary");
      runBtn.classList.add("danger");
      if (runIcon) runIcon.textContent = "stop_circle";
      if (runLabelEl) runLabelEl.textContent = "Stop";
      if (hintRunEl) hintRunEl.style.display = "none";
      runBtn.title = "Stop execution";
      runBtn.setAttribute("aria-label", "Stop execution");
    } else {
      runGroup.classList.remove("running");
      runBtn.classList.add("primary");
      runBtn.classList.remove("danger");
      if (runIcon) runIcon.textContent = "play_arrow";
      if (runLabelEl) runLabelEl.textContent = `Run ${getRunModeLabel(state.runMode)}`;
      if (hintRunEl) hintRunEl.style.display = "";
      runBtn.title = `Run ${getRunModeLabel(state.runMode)} (Cmd/Ctrl + Enter)`;
      runBtn.setAttribute("aria-label", "Run code");
    }
  }

  function setReady(ready: boolean) {
    state.pyodideReady = ready;
    updateStatusBar();
  }

  function postToWorker(message: WorkerMessage) {
    if (!worker) return;
    worker.postMessage(message);
  }

  function ensureWorker(opts: { silent?: boolean } = {}): boolean {
    if (worker) return true;
    if (!supportsBlockingInput) {
      if (!warnedIsolation) {
        addConsoleLine(
          "Blocking input requires cross-origin isolation (COOP/COEP headers).",
          { error: true }
        );
        addConsoleLine(
          "Enable COOP/COEP on your host to use input() and time.sleep().",
          { dim: true, system: true }
        );
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
    worker = new Worker(workerUrl);
    worker.onmessage = (event) => {
      handleWorkerMessage(event.data as WorkerInboundMessage);
    };
    worker.onerror = (event) => {
      addConsoleLine(`Worker error: ${event.message || "unknown"}`, { error: true });
      setReady(false);
    };

    const initMessage: WorkerInitMessage = {
      type: "init",
      stdinSab,
      stdinMaxBytes: inputMaxBytes,
      interruptSab
    };
    postToWorker(initMessage);
    return true;
  }

  async function handleInputRequest(prompt: string) {
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

  function handleWorkerMessage(message: WorkerInboundMessage) {
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
        addConsoleLine("Inscribe v3.1 / (c) Mark Yu, py.mkyu.one", {
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
        if (message.text.trim()) addConsoleLine(message.text, { error: true });
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
        if (runResolve) {
          runResolve(message.ok);
          runResolve = null;
        }
        runCompletionPromise = null;
        break;
      case "vars":
        onVariables({ items: message.items || [], truncated: message.truncated });
        break;
      default:
        break;
    }
  }

  function resetEnvironment() {
    if (worker) {
      postToWorker({ type: "reset" });
      worker.terminate();
      worker = null;
    }
    stdinSab = null;
    stdinI32 = null;
    stdinU8 = null;
    interruptSab = null;
    interruptI32 = null;
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

  async function runCode(mode: RunMode = "all") {
    if (state.isRunning) return;
    state.isRunning = true;
    updateStatusBar();

    runBtn.disabled = false;
    runModeBtn.disabled = true;
    setRunButtonState(true);
    resetStdoutBuffer();
    beginRunCapture();
    lastRunDurationMs = null;

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
        if (!proceed) return;
        warnedAsyncioRun = true;
      }

      if (!ensureWorker()) return;

      addConsoleLine(`Executing (${getRunModeLabel(mode)})…`, {
        dim: true,
        system: true
      });

      runStart = performance.now();
      if (interruptI32) {
        Atomics.store(interruptI32, 0, 0);
      }
      runCompletionPromise = new Promise<boolean>((resolve) => {
        runResolve = resolve;
      });

      const runMessage: WorkerRunMessage = { type: "run", code };
      postToWorker(runMessage);
      didRun = true;

      const ok = await runCompletionPromise;
      runOk = ok;
      flushStdoutBuffer();

      const dt =
        typeof lastRunDurationMs === "number"
          ? lastRunDurationMs
          : performance.now() - runStart;
      durationMs = dt;
      if (prefs.showExecTime) {
        addConsoleLine(`Finished in ${formatDuration(dt)}.`, { dim: true, system: true });
      }
      if (!ok && !interruptedRun) {
        addConsoleLine("Finished with errors.", { dim: true, system: true });
      }
    } catch (err) {
      runOk = false;
      const msg = err?.toString?.() ?? String(err);
      msg.split("\n").forEach((l: string) => {
        if (l.trim()) addConsoleLine(l, { error: true });
      });
      addConsoleLine("Finished with errors.", { dim: true, system: true });
    } finally {
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
    if (!state.isRunning) return;

    const waitForCompletion = async (timeoutMs: number) => {
      if (!runCompletionPromise) return true;
      const timeout = new Promise<boolean>((resolve) =>
        setTimeout(() => resolve(false), timeoutMs)
      );
      return Promise.race([runCompletionPromise.then(() => true), timeout]);
    };

    if (stdinI32 && Atomics.load(stdinI32, 0) === 1) {
      cancelActiveInput();
      stdinI32[1] = -1;
      Atomics.store(stdinI32, 0, 2);
      Atomics.notify(stdinI32, 0, 1);
    }

    if (await waitForCompletion(300)) return;

    if (interruptI32) {
      Atomics.store(interruptI32, 0, 2);
      Atomics.notify(interruptI32, 0, 1);
    }

    if (await waitForCompletion(600)) return;

    addConsoleLine("Force-stopping execution and resetting environment.", {
      dim: true,
      system: true
    });
    if (worker) {
      worker.terminate();
      worker = null;
    }
    if (runResolve) {
      runResolve(false);
      runResolve = null;
    }
    runCompletionPromise = null;
    stdinSab = null;
    stdinI32 = null;
    stdinU8 = null;
    interruptSab = null;
    interruptI32 = null;
    setReady(false);
  }

  function warmStart() {
    ensureWorker({ silent: true });
  }

  return { runCode, resetEnvironment, warmStart, stopExecution };
}
