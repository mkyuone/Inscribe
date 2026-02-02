import { escapeHtml } from "../utils/dom.js";
import { DomRefs } from "./dom-refs.js";

export type ConsoleController = {
  addLine: (
    text: string,
    opts?: { error?: boolean; dim?: boolean; system?: boolean }
  ) => void;
  clear: (keepBanner?: boolean) => void;
  clearWithUndo: () => void;
  undoClear: () => void;
  collectOutput: () => string;
  beginRunCapture: () => void;
  getRunStdout: () => string;
  handleStdout: (text: string) => void;
  flushStdoutBuffer: () => void;
  resetStdoutBuffer: () => void;
  attachStdoutHandlers: () => void;
};

export function createConsoleController(dom: DomRefs): ConsoleController {
  let consoleBackup: string | null = null;
  let undoTimer: ReturnType<typeof setTimeout> | null = null;
  let stdoutBuffer = "";
  let runStdout = "";

  function addLine(
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
    dom.consoleEl.appendChild(line);
    dom.consoleEl.scrollTop = dom.consoleEl.scrollHeight;
  }

  function flushStdoutBuffer() {
    if (!stdoutBuffer.length) return;
    addLine(stdoutBuffer);
    stdoutBuffer = "";
  }

  function beginRunCapture() {
    runStdout = "";
  }

  function getRunStdout() {
    return runStdout.replace(/\s+$/g, "");
  }

  function handleStdout(text: string) {
    const normalized = String(text ?? "").replace(/\r/g, "");
    runStdout += normalized;
    stdoutBuffer += normalized;
    const lines = stdoutBuffer.split("\n");
    stdoutBuffer = lines.pop() ?? "";
    lines.forEach((line) => addLine(line));
  }

  function resetStdoutBuffer() {
    stdoutBuffer = "";
  }

  function attachStdoutHandlers() {
    (window as any).inscribeStdout = (text?: string) => {
      handleStdout(text ?? "");
    };
    (window as any).inscribeStdoutFlush = () => {
      flushStdoutBuffer();
    };
  }

  function clear(keepBanner = true) {
    dom.consoleEl.innerHTML = "";
    if (keepBanner) addLine("Ready. Run to load Pyodide.", { dim: true, system: true });
  }

  function clearWithUndo() {
    if (undoTimer) clearTimeout(undoTimer);
    consoleBackup = dom.consoleEl.innerHTML;

    dom.consoleEl.innerHTML = "";
    addLine("Console cleared. Undo available for 3 seconds.", { dim: true, system: true });

    dom.undoClearBtn.style.display = "inline-flex";
    undoTimer = setTimeout(() => {
      consoleBackup = null;
      dom.undoClearBtn.style.display = "none";
    }, 3000);
  }

  function undoClear() {
    if (!consoleBackup) return;
    if (undoTimer) clearTimeout(undoTimer);

    dom.consoleEl.innerHTML = consoleBackup;
    consoleBackup = null;
    dom.undoClearBtn.style.display = "none";
  }

  function collectOutput() {
    const lines = Array.from(dom.consoleEl.querySelectorAll(".consoleLine"))
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

  return {
    addLine,
    clear,
    clearWithUndo,
    undoClear,
    collectOutput,
    beginRunCapture,
    getRunStdout,
    handleStdout,
    flushStdoutBuffer,
    resetStdoutBuffer,
    attachStdoutHandlers
  };
}
