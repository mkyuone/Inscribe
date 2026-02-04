// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2023-2026 Mark Yu
const DB_NAME = "inscribe-history";
const DB_VERSION = 1;
const STORE_EDITS = "edits";
const STORE_OUTPUTS = "outputs";
const MAX_EDIT_ENTRIES = 200;
const MAX_OUTPUT_ENTRIES = 120;
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
            const edits = db.createObjectStore(STORE_EDITS, {
                keyPath: "id",
                autoIncrement: true
            });
            edits.createIndex("ts", "ts");
            const outputs = db.createObjectStore(STORE_OUTPUTS, {
                keyPath: "id",
                autoIncrement: true
            });
            outputs.createIndex("ts", "ts");
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}
async function listRecent(storeName, limit) {
    if (!hasIndexedDb() || limit <= 0)
        return [];
    const db = await openDb();
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const index = store.index("ts");
    const items = [];
    await new Promise((resolve, reject) => {
        const req = index.openCursor(null, "prev");
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
            const cursor = req.result;
            if (!cursor || items.length >= limit) {
                resolve();
                return;
            }
            items.push(cursor.value);
            cursor.continue();
        };
    });
    await txDone(tx);
    return items;
}
async function prune(storeName, maxEntries) {
    if (!hasIndexedDb())
        return;
    const db = await openDb();
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const count = await requestToPromise(store.count());
    if (count <= maxEntries) {
        await txDone(tx);
        return;
    }
    const toDelete = count - maxEntries;
    let deleted = 0;
    await new Promise((resolve, reject) => {
        const index = store.index("ts");
        const req = index.openCursor(null, "next");
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
            const cursor = req.result;
            if (!cursor || deleted >= toDelete) {
                resolve();
                return;
            }
            cursor.delete();
            deleted += 1;
            cursor.continue();
        };
    });
    await txDone(tx);
}
export function createHistoryController() {
    async function addEdit(entry) {
        if (!hasIndexedDb())
            return;
        const db = await openDb();
        const tx = db.transaction(STORE_EDITS, "readwrite");
        tx.objectStore(STORE_EDITS).add(entry);
        await txDone(tx);
        await prune(STORE_EDITS, MAX_EDIT_ENTRIES);
    }
    async function addOutput(entry) {
        if (!hasIndexedDb())
            return;
        const db = await openDb();
        const tx = db.transaction(STORE_OUTPUTS, "readwrite");
        tx.objectStore(STORE_OUTPUTS).add(entry);
        await txDone(tx);
        await prune(STORE_OUTPUTS, MAX_OUTPUT_ENTRIES);
    }
    async function listEdits(limit) {
        return listRecent(STORE_EDITS, limit);
    }
    async function listOutputs(limit) {
        return listRecent(STORE_OUTPUTS, limit);
    }
    async function importShared(payload) {
        var _a, _b;
        if (!hasIndexedDb())
            return;
        const edits = (_a = payload.edits) !== null && _a !== void 0 ? _a : [];
        const outputs = (_b = payload.outputs) !== null && _b !== void 0 ? _b : [];
        if (!edits.length && !outputs.length)
            return;
        const db = await openDb();
        const tx = db.transaction([STORE_EDITS, STORE_OUTPUTS], "readwrite");
        const editsStore = tx.objectStore(STORE_EDITS);
        const outputsStore = tx.objectStore(STORE_OUTPUTS);
        edits.forEach((entry) => {
            editsStore.add({ ...entry, kind: entry.kind || "shared" });
        });
        outputs.forEach((entry) => {
            outputsStore.add({ ...entry, kind: entry.kind || "shared" });
        });
        await txDone(tx);
        await prune(STORE_EDITS, MAX_EDIT_ENTRIES);
        await prune(STORE_OUTPUTS, MAX_OUTPUT_ENTRIES);
    }
    return {
        addEdit,
        addOutput,
        listEdits,
        listOutputs,
        importShared
    };
}
