// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2023-2026 Mark Yu

/// <reference lib="webworker" />

type WorkerGlobal = DedicatedWorkerGlobalScope & {
  loadPyodide?: () => Promise<any>;
  inscribeStdout?: (text?: string) => void;
  inscribeStdoutFlush?: () => void;
  __inscribeReadline?: (prompt?: string) => string | null;
  __inscribePauseTimer?: () => void;
  __inscribeResumeTimer?: () => void;
};

const ctx = self as WorkerGlobal;

type InitMessage = {
  type: "init";
  stdinSab: SharedArrayBuffer;
  stdinMaxBytes: number;
  interruptSab: SharedArrayBuffer;
};

type WorkerWorkspaceTransferFile =
  | { path: string; mime: string; kind: "text"; text: string }
  | { path: string; mime: string; kind: "binary"; bytes: Uint8Array | ArrayBuffer };

type WorkerWorkspaceSnapshotFile =
  | { path: string; mime: string; kind: "text"; text: string }
  | { path: string; mime: string; kind: "binary"; bytes: Uint8Array };

type LegacyWorkspaceFile = {
  path: string;
  mime: string;
  encoding: "utf8" | "base64";
  content: string;
};

type WorkerWorkspaceTransferSnapshot = {
  activePath: string;
  files: WorkerWorkspaceTransferFile[];
};

type WorkerWorkspaceSnapshot = {
  activePath: string;
  files: WorkerWorkspaceSnapshotFile[];
};

type RunMessage = {
  type: "run";
  code: string;
  mode: "all" | "selection" | "cell";
  workspace?: WorkerWorkspaceTransferSnapshot;
  activePath?: string;
  workspaceFiles?: LegacyWorkspaceFile[];
};

type ResetMessage = { type: "reset" };

type InboundMessage = InitMessage | RunMessage | ResetMessage;

let pyodide: any = null;
let stdinI32: Int32Array | null = null;
let stdinU8: Uint8Array | null = null;
let interruptI32: Int32Array | null = null;
let mainGlobals: any = null;
let runStartMs = 0;
let pausedMs = 0;
let pauseStartMs = 0;
let pauseDepth = 0;

const textDecoder = new TextDecoder();
const utf8Decoder = new TextDecoder("utf-8", { fatal: true });
const WORKSPACE_ROOT = "/workspace";

function post(type: string, payload: Record<string, unknown> = {}) {
  ctx.postMessage({ type, ...payload });
}

function setupStdin(sab: SharedArrayBuffer, maxBytes: number) {
  stdinI32 = new Int32Array(sab, 0, 2);
  stdinU8 = new Uint8Array(sab, 8, maxBytes);
}

function setupInterrupt(sab: SharedArrayBuffer) {
  interruptI32 = new Int32Array(sab);
}

function beginPause() {
  if (pauseDepth === 0) pauseStartMs = performance.now();
  pauseDepth += 1;
}

function endPause() {
  if (pauseDepth === 0) return;
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

function readLine(prompt?: string) {
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

function normalizeWorkspacePath(path: string) {
  const parts = String(path || "")
    .replaceAll("\\", "/")
    .split("/");
  const sanitized: string[] = [];
  for (const rawPart of parts) {
    const part = rawPart.trim();
    if (!part || part === ".") continue;
    if (part === ".." || part.includes("\0")) return "";
    sanitized.push(part);
  }
  return sanitized.join("/");
}

function base64ToBytes(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function toUint8Array(value: Uint8Array | ArrayBuffer) {
  if (value instanceof Uint8Array) return value;
  return new Uint8Array(value);
}

function toWorkspaceSnapshot(message: RunMessage): WorkerWorkspaceSnapshot {
  if (message.workspace) {
    return {
      activePath: normalizeWorkspacePath(message.workspace.activePath),
      files: (message.workspace.files || [])
        .map((file) => {
          const path = normalizeWorkspacePath(file.path);
          if (!path) return null;
          if (file.kind === "binary") {
            return {
              path,
              mime: file.mime || "",
              kind: "binary" as const,
              bytes: toUint8Array(file.bytes)
            };
          }
          return {
            path,
            mime: file.mime || "",
            kind: "text" as const,
            text: file.text
          };
        })
        .filter((file): file is WorkerWorkspaceSnapshotFile => !!file)
    };
  }

  return {
    activePath: normalizeWorkspacePath(message.activePath || ""),
    files: (message.workspaceFiles || [])
      .map((file) => {
        const path = normalizeWorkspacePath(file.path);
        if (!path) return null;
        if (file.encoding === "base64") {
          return {
            path,
            mime: file.mime || "",
            kind: "binary" as const,
            bytes: base64ToBytes(file.content)
          };
        }
        return {
          path,
          mime: file.mime || "",
          kind: "text" as const,
          text: file.content
        };
      })
      .filter((file): file is WorkerWorkspaceSnapshotFile => !!file)
  };
}

function getFs() {
  return pyodide?.FS ?? null;
}

function clearPath(path: string) {
  const FS = getFs();
  if (!FS) return;
  const stat = FS.stat(path);
  if (FS.isDir(stat.mode)) {
    for (const child of FS.readdir(path)) {
      if (child === "." || child === "..") continue;
      clearPath(`${path}/${child}`);
    }
    FS.rmdir(path);
    return;
  }
  FS.unlink(path);
}

function ensureWorkspaceRoot() {
  const FS = getFs();
  if (!FS) return;
  try {
    clearPath(WORKSPACE_ROOT);
  } catch {
    // ignore
  }
  try {
    FS.mkdirTree(WORKSPACE_ROOT);
  } catch {
    // ignore
  }
}

function writeWorkspaceFiles(files: WorkerWorkspaceSnapshotFile[]) {
  const FS = getFs();
  if (!FS) return;
  ensureWorkspaceRoot();
  for (const file of files) {
    const path = normalizeWorkspacePath(file.path);
    if (!path) continue;
    const fullPath = `${WORKSPACE_ROOT}/${path}`;
    const slashIdx = fullPath.lastIndexOf("/");
    if (slashIdx > WORKSPACE_ROOT.length) {
      FS.mkdirTree(fullPath.slice(0, slashIdx));
    }
    if (file.kind === "text") {
      FS.writeFile(fullPath, file.text, { encoding: "utf8" });
    } else {
      FS.writeFile(fullPath, toUint8Array(file.bytes));
    }
  }
}

function snapshotWorkspaceSync(source: WorkerWorkspaceSnapshot) {
  const FS = getFs();
  if (!FS) {
    return {
      activePath: normalizeWorkspacePath(source.activePath),
      files: [],
      deletedPaths: source.files.map((file) => normalizeWorkspacePath(file.path)).filter(Boolean)
    };
  }
  const mimeByPath = new Map(
    source.files.map((file) => [normalizeWorkspacePath(file.path), file.mime || ""])
  );
  const originalPaths = new Set(
    source.files.map((file) => normalizeWorkspacePath(file.path)).filter(Boolean)
  );
  const currentPaths = new Set<string>();
  const results: WorkerWorkspaceSnapshotFile[] = [];

  const walk = (dir: string) => {
    for (const child of FS.readdir(dir)) {
      if (child === "." || child === ".." || child === "__pycache__") continue;
      const fullPath = `${dir}/${child}`;
      const stat = FS.stat(fullPath);
      if (FS.isDir(stat.mode)) {
        walk(fullPath);
        continue;
      }
      const relPath = normalizeWorkspacePath(fullPath.slice(`${WORKSPACE_ROOT}/`.length));
      if (!relPath) continue;
      currentPaths.add(relPath);
      const bytes = FS.readFile(fullPath, { encoding: "binary" }) as Uint8Array;
      try {
        results.push({
          path: relPath,
          mime: mimeByPath.get(relPath) || "",
          kind: "text",
          text: utf8Decoder.decode(bytes)
        });
      } catch {
        results.push({
          path: relPath,
          mime: mimeByPath.get(relPath) || "",
          kind: "binary",
          bytes: new Uint8Array(bytes)
        });
      }
    }
  };

  try {
    walk(WORKSPACE_ROOT);
  } catch {
    return {
      activePath: normalizeWorkspacePath(source.activePath),
      files: [],
      deletedPaths: Array.from(originalPaths).sort((a, b) => a.localeCompare(b))
    };
  }

  results.sort((a, b) => a.path.localeCompare(b.path));
  return {
    activePath: normalizeWorkspacePath(source.activePath),
    files: results,
    deletedPaths: Array.from(originalPaths)
      .filter((path) => !currentPaths.has(path))
      .sort((a, b) => a.localeCompare(b))
  };
}

async function prepareWorkspaceEnvironment(activePath: string) {
  const workspaceRootLiteral = JSON.stringify(WORKSPACE_ROOT);
  const normalizedActivePath = normalizeWorkspacePath(activePath);
  const activeDir =
    normalizedActivePath && normalizedActivePath.includes("/")
      ? `${WORKSPACE_ROOT}/${normalizedActivePath.slice(
          0,
          normalizedActivePath.lastIndexOf("/")
        )}`
      : WORKSPACE_ROOT;
  const activeDirLiteral = JSON.stringify(activeDir);
  const code = `
import importlib
import os
import sys

_workspace_root = ${workspaceRootLiteral}
_active_dir = ${activeDirLiteral}
if _workspace_root not in sys.path:
    sys.path.insert(0, _workspace_root)
if _active_dir and _active_dir not in sys.path:
    sys.path.insert(0, _active_dir)
os.chdir(_workspace_root)
importlib.invalidate_caches()

def _inscribe_in_workspace(value):
    if isinstance(value, str):
        return value.startswith(_workspace_root)
    try:
        return any(isinstance(item, str) and item.startswith(_workspace_root) for item in value)
    except Exception:
        return False

for _name, _module in list(sys.modules.items()):
    _file = getattr(_module, "__file__", "")
    _path = getattr(_module, "__path__", ())
    if _inscribe_in_workspace(_file) or _inscribe_in_workspace(_path):
        del sys.modules[_name]
`;
  if (mainGlobals) {
    pyodide.runPython(code, { globals: mainGlobals });
  } else {
    pyodide.runPython(code);
  }

  return normalizedActivePath ? `${WORKSPACE_ROOT}/${normalizedActivePath}` : "";
}

async function ensurePyodide() {
  if (pyodide) return;

  const baseUrl = new URL(".", ctx.location.href);
  const pyodideUrl = new URL("../../assets/vendor/pyodide/pyodide.js", baseUrl).toString();
  ctx.importScripts(pyodideUrl);

  if (!ctx.loadPyodide) {
    throw new Error("Pyodide failed to load (loadPyodide missing).");
  }

  pyodide = await ctx.loadPyodide();
  mainGlobals = pyodide.globals ?? null;

  if (interruptI32 && typeof pyodide.setInterruptBuffer === "function") {
    pyodide.setInterruptBuffer(interruptI32);
  }

  ctx.inscribeStdout = (text?: string) => {
    post("stdout", { text: String(text ?? "") });
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

class _InscribeJSConsole:
    def write(self, s):
        js.inscribeStdout(s)
    def flush(self):
        js.inscribeStdoutFlush()

sys.stdout = _InscribeJSConsole()
sys.stderr = _InscribeJSConsole()

def _inscribe_input(prompt=""):
    val = js.__inscribeReadline(prompt)
    if val is None:
        raise KeyboardInterrupt("Execution interrupted")
    return val
builtins.input = _inscribe_input

_orig_sleep = _time.sleep
def _inscribe_sleep(secs=0):
    js.__inscribePauseTimer()
    try:
        return _orig_sleep(secs)
    finally:
        js.__inscribeResumeTimer()
_time.sleep = _inscribe_sleep

_INSCRIBE_BASELINE_NAMES = set(globals().keys())
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
        baseline = set(_INSCRIBE_BASELINE_NAMES)
    except Exception:
        g = {}
        baseline = set()
    for k, v in g.items():
        if k.startswith("_"):
            continue
        if k in baseline:
            continue
        if k in ("__builtins__", "js", "sys", "builtins", "pyodide"):
            continue
        if isinstance(v, types.ModuleType):
            continue
        t = type(v).__name__
        try:
            r = repr(v)
        except Exception as err:
            err_type = type(err).__name__
            err_msg = str(err).strip()
            r = f"<repr failed: {err_type}{': ' + err_msg if err_msg else ''}>"
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
  if (!pyodide) return;
  try {
    const raw = mainGlobals
      ? pyodide.runPython(VARS_SNAPSHOT_CODE, { globals: mainGlobals })
      : pyodide.runPython(VARS_SNAPSHOT_CODE);
    const json = typeof raw === "string" ? raw : String(raw);
    const payload = JSON.parse(json);
    if (payload && typeof payload === "object") {
      post("vars", payload as Record<string, unknown>);
    }
  } catch {
    // ignore snapshot errors
  }
}

function postEmptyVariablesSnapshot() {
  post("vars", { items: [], truncated: false });
}

function isMemoryExhaustionError(err: unknown) {
  const msg = err?.toString?.() ?? String(err);
  return (
    msg.includes("MemoryError") ||
    /out of memory|allocation failed|cannot allocate memory|oom|memory access out of bounds/i.test(msg)
  );
}

ctx.onmessage = async (event: MessageEvent<InboundMessage>) => {
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
      mainGlobals = null;
      post("status", { ready: false });
      return;
    }

    if (message.type === "run") {
      await ensurePyodide();
      resetRunTiming();
      const workspace = toWorkspaceSnapshot(message);
      let runOk = false;
      try {
        writeWorkspaceFiles(workspace.files);
        const activeFsPath = await prepareWorkspaceEnvironment(workspace.activePath);
        if (mainGlobals) {
          pyodide.runPython(BUILTIN_GUARD_CODE, { globals: mainGlobals });
          if (message.mode === "all" && activeFsPath.endsWith(".py")) {
            const runCode =
              `__inscribe_path = ${JSON.stringify(activeFsPath)}\n` +
              "globals()['__file__'] = __inscribe_path\n" +
              "globals()['__name__'] = '__main__'\n" +
              "globals()['__package__'] = None\n" +
              "import sys\n" +
              "sys.argv = [__inscribe_path]\n" +
              "with open(__inscribe_path, 'rb') as _f:\n" +
              "    _inscribe_code = _f.read()\n" +
              "exec(compile(_inscribe_code, __inscribe_path, 'exec'), globals())\n";
            await pyodide.runPythonAsync(runCode, { globals: mainGlobals });
          } else {
            await pyodide.runPythonAsync(message.code, { globals: mainGlobals });
          }
        } else {
          pyodide.runPython(BUILTIN_GUARD_CODE);
          if (message.mode === "all" && activeFsPath.endsWith(".py")) {
            const runCode =
              `__inscribe_path = ${JSON.stringify(activeFsPath)}\n` +
              "globals()['__file__'] = __inscribe_path\n" +
              "globals()['__name__'] = '__main__'\n" +
              "globals()['__package__'] = None\n" +
              "import sys\n" +
              "sys.argv = [__inscribe_path]\n" +
              "with open(__inscribe_path, 'rb') as _f:\n" +
              "    _inscribe_code = _f.read()\n" +
              "exec(compile(_inscribe_code, __inscribe_path, 'exec'), globals())\n";
            await pyodide.runPythonAsync(runCode);
          } else {
            await pyodide.runPythonAsync(message.code);
          }
        }
        runOk = true;
        if (pauseDepth > 0) endPause();
        const durationMs = Math.max(0, performance.now() - runStartMs - pausedMs);
        postVariablesSnapshot();
        post("workspace-sync", { sync: snapshotWorkspaceSync(workspace) });
        post("run-complete", { ok: true, durationMs });
      } catch (err) {
        const msg = err?.toString?.() ?? String(err);
        const fatalMemory = isMemoryExhaustionError(err);
        if (msg.includes("KeyboardInterrupt")) {
          post("interrupted");
        } else {
          msg.split("\\n").forEach((line: string) => {
            if (line.trim()) post("error-line", { text: line });
          });
        }
        if (pauseDepth > 0) endPause();
        const durationMs = Math.max(0, performance.now() - runStartMs - pausedMs);
        if (fatalMemory) {
          postEmptyVariablesSnapshot();
          post("run-complete", { ok: false, durationMs, fatal: "memory" });
        } else {
          postVariablesSnapshot();
          post("workspace-sync", { sync: snapshotWorkspaceSync(workspace) });
          post("run-complete", { ok: runOk, durationMs });
        }
      }
      return;
    }
  } catch (err) {
    const msg = err?.toString?.() ?? String(err);
    post("error-line", { text: msg });
    if (isMemoryExhaustionError(err)) {
      postEmptyVariablesSnapshot();
      post("run-complete", { ok: false, fatal: "memory" });
      return;
    }
    post("run-complete", { ok: false });
  }
};
