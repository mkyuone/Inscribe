// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2023-2026 Mark Yu
import { LS_KEYS } from "../constants.js";
import { safeLS } from "../utils/storage.js";
import { guessMimeType, isTextPath, normalizeWorkspacePath } from "./workspace-files.js";
const DB_NAME = "inscribe-workspace";
const DB_VERSION = 1;
const STORE_WORKSPACE = "workspace";
const SLOT_PRIMARY = "primary";
const SLOT_BACKUP = "backup";
let persistQueue = Promise.resolve();
function hasIndexedDb() {
    return typeof indexedDB !== "undefined";
}
function requestToPromise(req) {
    return new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}
function txDone(tx) {
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
    });
}
function openDb() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE_WORKSPACE)) {
                db.createObjectStore(STORE_WORKSPACE, { keyPath: "slot" });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}
export function sanitizeFilename(name) {
    const trimmed = name.trim();
    return trimmed ? normalizeWorkspacePath(trimmed) || "untitled.py" : "untitled.py";
}
function normalizeTabDoc(tab) {
    if (!tab ||
        typeof tab.id !== "string" ||
        typeof tab.name !== "string" ||
        typeof tab.content !== "string" ||
        typeof tab.savedContent !== "string" ||
        typeof tab.dirty !== "boolean") {
        return null;
    }
    const name = sanitizeFilename(tab.name);
    const mime = guessMimeType(name, typeof tab.mime === "string" ? tab.mime : "");
    const encoding = tab.encoding === "base64" || tab.encoding === "utf8"
        ? tab.encoding
        : isTextPath(name, mime)
            ? "utf8"
            : "base64";
    return {
        id: tab.id,
        name,
        content: tab.content,
        savedContent: tab.savedContent,
        dirty: tab.dirty,
        mime,
        encoding
    };
}
function normalizeStoredState(parsed) {
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.tabs))
        return null;
    const tabs = parsed.tabs
        .map((tab) => normalizeTabDoc(tab))
        .filter((tab) => !!tab);
    if (!tabs.length || typeof parsed.activeId !== "string")
        return null;
    const activeId = tabs.some((tab) => tab.id === parsed.activeId) ? parsed.activeId : tabs[0].id;
    return {
        version: 1,
        activeId,
        tabs
    };
}
function cloneStoredState(state) {
    return {
        version: 1,
        activeId: state.activeId,
        tabs: state.tabs.map((tab) => ({ ...tab }))
    };
}
function getActiveTab(state) {
    var _a, _b;
    return (_b = (_a = state.tabs.find((tab) => tab.id === state.activeId)) !== null && _a !== void 0 ? _a : state.tabs[0]) !== null && _b !== void 0 ? _b : null;
}
function persistLegacyWorkspaceState(state, savedAt) {
    const snapshot = cloneStoredState(state);
    safeLS.set(LS_KEYS.TABS, JSON.stringify({ ...snapshot, savedAt }));
    const active = getActiveTab(snapshot);
    if (!active)
        return;
    safeLS.set(LS_KEYS.FILENAME, active.name);
    if (active.encoding !== "base64") {
        safeLS.set(LS_KEYS.DRAFT, active.content);
    }
}
export function parseStoredTabsState(raw) {
    var _a, _b;
    return (_b = (_a = parseLocalWorkspaceCandidate(raw)) === null || _a === void 0 ? void 0 : _a.state) !== null && _b !== void 0 ? _b : null;
}
function parseLocalWorkspaceCandidate(raw) {
    if (!raw)
        return null;
    try {
        const parsed = JSON.parse(raw);
        const state = normalizeStoredState(parsed);
        if (!state)
            return null;
        return {
            state,
            savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : 0
        };
    }
    catch {
        return null;
    }
}
async function getWorkspaceRecord(slot) {
    if (!hasIndexedDb())
        return null;
    const db = await openDb();
    const tx = db.transaction(STORE_WORKSPACE, "readonly");
    const store = tx.objectStore(STORE_WORKSPACE);
    const record = (await requestToPromise(store.get(slot)));
    await txDone(tx);
    return record !== null && record !== void 0 ? record : null;
}
function toWorkspaceCandidate(record, source) {
    if (!record)
        return null;
    const state = normalizeStoredState(record.state);
    if (!state)
        return null;
    return {
        state,
        source,
        savedAt: typeof record.savedAt === "number" ? record.savedAt : 0
    };
}
async function persistWorkspaceStateToIndexedDb(state, savedAt) {
    if (!hasIndexedDb())
        return;
    try {
        const existingPrimary = await getWorkspaceRecord(SLOT_PRIMARY);
        const db = await openDb();
        const tx = db.transaction(STORE_WORKSPACE, "readwrite");
        const store = tx.objectStore(STORE_WORKSPACE);
        if (existingPrimary === null || existingPrimary === void 0 ? void 0 : existingPrimary.state) {
            store.put({
                slot: SLOT_BACKUP,
                savedAt: existingPrimary.savedAt,
                state: cloneStoredState(existingPrimary.state)
            });
        }
        store.put({
            slot: SLOT_PRIMARY,
            savedAt,
            state: cloneStoredState(state)
        });
        await txDone(tx);
    }
    catch {
        // ignore: localStorage mirror already provides a best-effort fallback
    }
}
export function persistWorkspaceState(state) {
    const snapshot = cloneStoredState(state);
    const savedAt = Date.now();
    persistLegacyWorkspaceState(snapshot, savedAt);
    persistQueue = persistQueue
        .catch(() => undefined)
        .then(() => persistWorkspaceStateToIndexedDb(snapshot, savedAt));
    return persistQueue;
}
export async function loadWorkspaceState() {
    const localCandidate = parseLocalWorkspaceCandidate(safeLS.get(LS_KEYS.TABS));
    if (!hasIndexedDb()) {
        return {
            state: localCandidate ? cloneStoredState(localCandidate.state) : null,
            source: localCandidate ? "local-storage" : "none"
        };
    }
    try {
        const [primaryRecord, backupRecord] = await Promise.all([
            getWorkspaceRecord(SLOT_PRIMARY),
            getWorkspaceRecord(SLOT_BACKUP)
        ]);
        const candidates = [];
        const primaryCandidate = toWorkspaceCandidate(primaryRecord, "idb-primary");
        const backupCandidate = toWorkspaceCandidate(backupRecord, "idb-backup");
        if (primaryCandidate)
            candidates.push(primaryCandidate);
        if (backupCandidate)
            candidates.push(backupCandidate);
        if (localCandidate) {
            candidates.push({
                state: localCandidate.state,
                source: "local-storage",
                savedAt: localCandidate.savedAt
            });
        }
        if (candidates.length) {
            candidates.sort((a, b) => {
                if (b.savedAt !== a.savedAt)
                    return b.savedAt - a.savedAt;
                const priority = (source) => source === "idb-primary" ? 0 : source === "local-storage" ? 1 : source === "idb-backup" ? 2 : 3;
                return priority(a.source) - priority(b.source);
            });
            return {
                state: cloneStoredState(candidates[0].state),
                source: candidates[0].source
            };
        }
    }
    catch {
        // ignore and fall back to legacy storage below
    }
    if (localCandidate) {
        void persistWorkspaceState(localCandidate.state);
        return {
            state: cloneStoredState(localCandidate.state),
            source: "local-storage"
        };
    }
    return {
        state: null,
        source: "none"
    };
}
