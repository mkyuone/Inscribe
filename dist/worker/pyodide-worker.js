"use strict";
/// <reference lib="webworker" />
const ctx = self;
let pyodide = null;
let stdinI32 = null;
let stdinU8 = null;
let interruptI32 = null;
let mainGlobals = null;
let runStartMs = 0;
let pausedMs = 0;
let pauseStartMs = 0;
let pauseDepth = 0;
const textDecoder = new TextDecoder();
function post(type, payload = {}) {
    ctx.postMessage({ type, ...payload });
}
function setupStdin(sab, maxBytes) {
    stdinI32 = new Int32Array(sab, 0, 2);
    stdinU8 = new Uint8Array(sab, 8, maxBytes);
}
function setupInterrupt(sab) {
    interruptI32 = new Int32Array(sab);
}
function beginPause() {
    if (pauseDepth === 0)
        pauseStartMs = performance.now();
    pauseDepth += 1;
}
function endPause() {
    if (pauseDepth === 0)
        return;
    pauseDepth -= 1;
    if (pauseDepth === 0) {
        pausedMs += performance.now() - pauseStartMs;
        pauseStartMs = 0;
    }
}
function resetRunTiming() {
    runStartMs = performance.now();
    pausedMs = 0;
    pauseStartMs = 0;
    pauseDepth = 0;
}
function readLine(prompt) {
    if (!stdinI32 || !stdinU8) {
        post("error-line", { text: "Input bridge unavailable (no SharedArrayBuffer)." });
        return "";
    }
    Atomics.store(stdinI32, 0, 1);
    Atomics.store(stdinI32, 1, 0);
    post("input", { prompt: prompt ? String(prompt) : "" });
    beginPause();
    Atomics.wait(stdinI32, 0, 1);
    endPause();
    const rawLength = stdinI32[1];
    if (rawLength < 0) {
        stdinI32[1] = 0;
        Atomics.store(stdinI32, 0, 0);
        return null;
    }
    const length = Math.max(0, Math.min(rawLength, stdinU8.length));
    const copy = new Uint8Array(length);
    if (length > 0) {
        copy.set(stdinU8.subarray(0, length));
    }
    const value = textDecoder.decode(copy);
    Atomics.store(stdinI32, 0, 0);
    return value;
}
async function ensurePyodide() {
    var _a;
    if (pyodide)
        return;
    const baseUrl = new URL(".", ctx.location.href);
    const pyodideUrl = new URL("../../assets/vendor/pyodide/pyodide.js", baseUrl).toString();
    ctx.importScripts(pyodideUrl);
    if (!ctx.loadPyodide) {
        throw new Error("Pyodide failed to load (loadPyodide missing).");
    }
    pyodide = await ctx.loadPyodide();
    mainGlobals = (_a = pyodide.globals) !== null && _a !== void 0 ? _a : null;
    if (interruptI32 && typeof pyodide.setInterruptBuffer === "function") {
        pyodide.setInterruptBuffer(interruptI32);
    }
    ctx.inscribeStdout = (text) => {
        post("stdout", { text: String(text !== null && text !== void 0 ? text : "") });
    };
    ctx.inscribeStdoutFlush = () => {
        post("stdout-flush");
    };
    ctx.__inscribeReadline = readLine;
    ctx.__inscribePauseTimer = beginPause;
    ctx.__inscribeResumeTimer = endPause;
    pyodide.runPython(`
import sys
import js
import builtins
import time as _time

class JSConsole:
    def write(self, s):
        js.inscribeStdout(s)
    def flush(self):
        js.inscribeStdoutFlush()

sys.stdout = JSConsole()
sys.stderr = JSConsole()

def custom_input(prompt=""):
    val = js.__inscribeReadline(prompt)
    if val is None:
        raise KeyboardInterrupt("Execution interrupted")
    return val
builtins.input = custom_input

_orig_sleep = _time.sleep
def _inscribe_sleep(secs=0):
    js.__inscribePauseTimer()
    try:
        return _orig_sleep(secs)
    finally:
        js.__inscribeResumeTimer()
_time.sleep = _inscribe_sleep
  `);
}
const BUILTIN_GUARD_CODE = `
import builtins as _bi
_COMMON_BUILTINS = ["input","print","list","str","int","len","sum","max","min","type"]
_shadowed = [
    name
    for name in _bi.__dict__.keys()
    if not name.startswith("__")
    and name in globals()
    and globals()[name] is not _bi.__dict__[name]
]
_name = None
if _shadowed:
    _bi.print("Warning: overwritten built-ins detected (" + ", ".join(_shadowed) + ").")
    for _name in _COMMON_BUILTINS:
        globals()[_name] = getattr(_bi, _name)
    _bi.print("Some built-ins were reset. Avoid reusing names like input, list, str.")
del _shadowed, _name, _COMMON_BUILTINS, _bi
`;
const VARS_SNAPSHOT_CODE = `
import json, types
def _inscribe_collect_vars():
    items = []
    try:
        g = globals()
    except Exception:
        g = {}
    for k, v in g.items():
        if k.startswith("_"):
            continue
        if k in ("__builtins__", "js", "sys", "builtins", "pyodide"):
            continue
        if isinstance(v, types.ModuleType):
            continue
        t = type(v).__name__
        try:
            r = repr(v)
        except Exception:
            r = "<repr failed>"
        if len(r) > 140:
            r = r[:137] + "..."
        item = {"name": k, "type": t, "repr": r}
        try:
            item["size"] = len(v)
        except Exception:
            pass
        items.append(item)
    items.sort(key=lambda x: x["name"].lower())
    truncated = False
    if len(items) > 200:
        items = items[:200]
        truncated = True
    return json.dumps({"items": items, "truncated": truncated})
_inscribe_collect_vars()
`;
function postVariablesSnapshot() {
    if (!pyodide)
        return;
    try {
        const raw = mainGlobals
            ? pyodide.runPython(VARS_SNAPSHOT_CODE, { globals: mainGlobals })
            : pyodide.runPython(VARS_SNAPSHOT_CODE);
        const json = typeof raw === "string" ? raw : String(raw);
        const payload = JSON.parse(json);
        if (payload && typeof payload === "object") {
            post("vars", payload);
        }
    }
    catch {
        // ignore snapshot errors
    }
}
ctx.onmessage = async (event) => {
    var _a, _b, _c, _d;
    const message = event.data;
    try {
        if (message.type === "init") {
            setupStdin(message.stdinSab, message.stdinMaxBytes);
            setupInterrupt(message.interruptSab);
            await ensurePyodide();
            post("ready");
            return;
        }
        if (message.type === "reset") {
            pyodide = null;
            post("status", { ready: false });
            return;
        }
        if (message.type === "run") {
            await ensurePyodide();
            resetRunTiming();
            let runOk = false;
            try {
                if (mainGlobals) {
                    pyodide.runPython(BUILTIN_GUARD_CODE, { globals: mainGlobals });
                    await pyodide.runPythonAsync(message.code, { globals: mainGlobals });
                }
                else {
                    pyodide.runPython(BUILTIN_GUARD_CODE);
                    await pyodide.runPythonAsync(message.code);
                }
                runOk = true;
                if (pauseDepth > 0)
                    endPause();
                const durationMs = Math.max(0, performance.now() - runStartMs - pausedMs);
                postVariablesSnapshot();
                post("run-complete", { ok: true, durationMs });
            }
            catch (err) {
                const msg = (_b = (_a = err === null || err === void 0 ? void 0 : err.toString) === null || _a === void 0 ? void 0 : _a.call(err)) !== null && _b !== void 0 ? _b : String(err);
                if (msg.includes("KeyboardInterrupt")) {
                    post("interrupted");
                }
                else {
                    msg.split("\\n").forEach((line) => {
                        if (line.trim())
                            post("error-line", { text: line });
                    });
                }
                if (pauseDepth > 0)
                    endPause();
                const durationMs = Math.max(0, performance.now() - runStartMs - pausedMs);
                postVariablesSnapshot();
                post("run-complete", { ok: runOk, durationMs });
            }
            return;
        }
    }
    catch (err) {
        const msg = (_d = (_c = err === null || err === void 0 ? void 0 : err.toString) === null || _c === void 0 ? void 0 : _c.call(err)) !== null && _d !== void 0 ? _d : String(err);
        post("error-line", { text: msg });
        post("run-complete", { ok: false });
    }
};
