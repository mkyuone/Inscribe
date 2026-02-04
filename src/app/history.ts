// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2023-2026 Mark Yu

export type HistoryEditKind = "auto" | "run" | "manual" | "restore" | "shared";
export type HistoryOutputKind = "run" | "interrupt" | "shared";

export type HistoryEditEntry = {
  id?: number;
  ts: number;
  kind: HistoryEditKind;
  code: string;
};

export type HistoryOutputEntry = {
  id?: number;
  ts: number;
  kind: HistoryOutputKind;
  stdout: string;
};

export type HistoryController = {
  addEdit: (entry: HistoryEditEntry) => Promise<void>;
  addOutput: (entry: HistoryOutputEntry) => Promise<void>;
  listEdits: (limit: number) => Promise<HistoryEditEntry[]>;
  listOutputs: (limit: number) => Promise<HistoryOutputEntry[]>;
  importShared: (payload: {
    edits?: HistoryEditEntry[];
    outputs?: HistoryOutputEntry[];
  }) => Promise<void>;
};

const DB_NAME = "inscribe-history";
const DB_VERSION = 1;
const STORE_EDITS = "edits";
const STORE_OUTPUTS = "outputs";
const MAX_EDIT_ENTRIES = 200;
const MAX_OUTPUT_ENTRIES = 120;

function hasIndexedDb() {
  return typeof indexedDB !== "undefined";
}

function requestToPromise<T>(req: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
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

async function listRecent<T>(
  storeName: string,
  limit: number
): Promise<T[]> {
  if (!hasIndexedDb() || limit <= 0) return [];
  const db = await openDb();
  const tx = db.transaction(storeName, "readonly");
  const store = tx.objectStore(storeName);
  const index = store.index("ts");
  const items: T[] = [];
  await new Promise<void>((resolve, reject) => {
    const req = index.openCursor(null, "prev");
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor || items.length >= limit) {
        resolve();
        return;
      }
      items.push(cursor.value as T);
      cursor.continue();
    };
  });
  await txDone(tx);
  return items;
}

async function prune(storeName: string, maxEntries: number) {
  if (!hasIndexedDb()) return;
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
  await new Promise<void>((resolve, reject) => {
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

export function createHistoryController(): HistoryController {
  async function addEdit(entry: HistoryEditEntry) {
    if (!hasIndexedDb()) return;
    const db = await openDb();
    const tx = db.transaction(STORE_EDITS, "readwrite");
    tx.objectStore(STORE_EDITS).add(entry);
    await txDone(tx);
    await prune(STORE_EDITS, MAX_EDIT_ENTRIES);
  }

  async function addOutput(entry: HistoryOutputEntry) {
    if (!hasIndexedDb()) return;
    const db = await openDb();
    const tx = db.transaction(STORE_OUTPUTS, "readwrite");
    tx.objectStore(STORE_OUTPUTS).add(entry);
    await txDone(tx);
    await prune(STORE_OUTPUTS, MAX_OUTPUT_ENTRIES);
  }

  async function listEdits(limit: number) {
    return listRecent<HistoryEditEntry>(STORE_EDITS, limit);
  }

  async function listOutputs(limit: number) {
    return listRecent<HistoryOutputEntry>(STORE_OUTPUTS, limit);
  }

  async function importShared(payload: {
    edits?: HistoryEditEntry[];
    outputs?: HistoryOutputEntry[];
  }) {
    if (!hasIndexedDb()) return;
    const edits = payload.edits ?? [];
    const outputs = payload.outputs ?? [];
    if (!edits.length && !outputs.length) return;

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
