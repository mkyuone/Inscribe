// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2023-2026 Mark Yu

import { LS_KEYS } from "../constants.js";
import { safeLS } from "../utils/storage.js";

export type TabDoc = {
  id: string;
  name: string;
  content: string;
  savedContent: string;
  dirty: boolean;
};

export type StoredTabsState = {
  version: 1;
  activeId: string;
  tabs: TabDoc[];
};

export type WorkspaceLoadSource = "idb-primary" | "idb-backup" | "local-storage" | "none";

export type WorkspaceLoadResult = {
  state: StoredTabsState | null;
  source: WorkspaceLoadSource;
};

type WorkspaceRecord = {
  slot: "primary" | "backup";
  savedAt: number;
  state: StoredTabsState;
};

type LocalWorkspaceCandidate = {
  state: StoredTabsState;
  savedAt: number;
};

type WorkspaceCandidate = {
  state: StoredTabsState;
  source: Exclude<WorkspaceLoadSource, "none">;
  savedAt: number;
};

const DB_NAME = "inscribe-workspace";
const DB_VERSION = 1;
const STORE_WORKSPACE = "workspace";
const SLOT_PRIMARY: WorkspaceRecord["slot"] = "primary";
const SLOT_BACKUP: WorkspaceRecord["slot"] = "backup";

let persistQueue: Promise<void> = Promise.resolve();

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
      if (!db.objectStoreNames.contains(STORE_WORKSPACE)) {
        db.createObjectStore(STORE_WORKSPACE, { keyPath: "slot" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function sanitizeFilename(name: string) {
  const trimmed = name.trim();
  return trimmed || "untitled.py";
}

function normalizeTabDoc(tab: Partial<TabDoc>): TabDoc | null {
  if (
    !tab ||
    typeof tab.id !== "string" ||
    typeof tab.name !== "string" ||
    typeof tab.content !== "string" ||
    typeof tab.savedContent !== "string" ||
    typeof tab.dirty !== "boolean"
  ) {
    return null;
  }
  return {
    id: tab.id,
    name: sanitizeFilename(tab.name),
    content: tab.content,
    savedContent: tab.savedContent,
    dirty: tab.dirty
  };
}

function normalizeStoredState(parsed: Partial<StoredTabsState> | null | undefined): StoredTabsState | null {
  if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.tabs)) return null;

  const tabs = parsed.tabs
    .map((tab) => normalizeTabDoc(tab))
    .filter((tab): tab is TabDoc => !!tab);

  if (!tabs.length || typeof parsed.activeId !== "string") return null;
  const activeId = tabs.some((tab) => tab.id === parsed.activeId) ? parsed.activeId : tabs[0].id;

  return {
    version: 1,
    activeId,
    tabs
  };
}

function cloneStoredState(state: StoredTabsState): StoredTabsState {
  return {
    version: 1,
    activeId: state.activeId,
    tabs: state.tabs.map((tab) => ({ ...tab }))
  };
}

function getActiveTab(state: StoredTabsState) {
  return state.tabs.find((tab) => tab.id === state.activeId) ?? state.tabs[0] ?? null;
}

function persistLegacyWorkspaceState(state: StoredTabsState, savedAt: number) {
  const snapshot = cloneStoredState(state);
  safeLS.set(LS_KEYS.TABS, JSON.stringify({ ...snapshot, savedAt }));

  const active = getActiveTab(snapshot);
  if (!active) return;
  safeLS.set(LS_KEYS.FILENAME, active.name);
  safeLS.set(LS_KEYS.DRAFT, active.content);
}

export function parseStoredTabsState(raw: string | null): StoredTabsState | null {
  return parseLocalWorkspaceCandidate(raw)?.state ?? null;
}

function parseLocalWorkspaceCandidate(raw: string | null): LocalWorkspaceCandidate | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredTabsState> & { savedAt?: number };
    const state = normalizeStoredState(parsed);
    if (!state) return null;
    return {
      state,
      savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : 0
    };
  } catch {
    return null;
  }
}

async function getWorkspaceRecord(slot: WorkspaceRecord["slot"]) {
  if (!hasIndexedDb()) return null;
  const db = await openDb();
  const tx = db.transaction(STORE_WORKSPACE, "readonly");
  const store = tx.objectStore(STORE_WORKSPACE);
  const record = (await requestToPromise(store.get(slot))) as WorkspaceRecord | undefined;
  await txDone(tx);
  return record ?? null;
}

function toWorkspaceCandidate(
  record: WorkspaceRecord | null,
  source: Extract<WorkspaceCandidate["source"], "idb-primary" | "idb-backup">
): WorkspaceCandidate | null {
  if (!record) return null;
  const state = normalizeStoredState(record.state);
  if (!state) return null;
  return {
    state,
    source,
    savedAt: typeof record.savedAt === "number" ? record.savedAt : 0
  };
}

async function persistWorkspaceStateToIndexedDb(state: StoredTabsState, savedAt: number) {
  if (!hasIndexedDb()) return;

  try {
    const existingPrimary = await getWorkspaceRecord(SLOT_PRIMARY);
    const db = await openDb();
    const tx = db.transaction(STORE_WORKSPACE, "readwrite");
    const store = tx.objectStore(STORE_WORKSPACE);

    if (existingPrimary?.state) {
      store.put({
        slot: SLOT_BACKUP,
        savedAt: existingPrimary.savedAt,
        state: cloneStoredState(existingPrimary.state)
      } satisfies WorkspaceRecord);
    }

    store.put({
      slot: SLOT_PRIMARY,
      savedAt,
      state: cloneStoredState(state)
    } satisfies WorkspaceRecord);

    await txDone(tx);
  } catch {
    // ignore: localStorage mirror already provides a best-effort fallback
  }
}

export function persistWorkspaceState(state: StoredTabsState) {
  const snapshot = cloneStoredState(state);
  const savedAt = Date.now();
  persistLegacyWorkspaceState(snapshot, savedAt);

  persistQueue = persistQueue
    .catch(() => undefined)
    .then(() => persistWorkspaceStateToIndexedDb(snapshot, savedAt));

  return persistQueue;
}

export async function loadWorkspaceState(): Promise<WorkspaceLoadResult> {
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

    const candidates: WorkspaceCandidate[] = [];
    const primaryCandidate = toWorkspaceCandidate(primaryRecord, "idb-primary");
    const backupCandidate = toWorkspaceCandidate(backupRecord, "idb-backup");

    if (primaryCandidate) candidates.push(primaryCandidate);
    if (backupCandidate) candidates.push(backupCandidate);
    if (localCandidate) {
      candidates.push({
        state: localCandidate.state,
        source: "local-storage",
        savedAt: localCandidate.savedAt
      });
    }

    if (candidates.length) {
      candidates.sort((a, b) => {
        if (b.savedAt !== a.savedAt) return b.savedAt - a.savedAt;
        const priority = (source: WorkspaceCandidate["source"]) =>
          source === "idb-primary" ? 0 : source === "local-storage" ? 1 : source === "idb-backup" ? 2 : 3;
        return priority(a.source) - priority(b.source);
      });
      return {
        state: cloneStoredState(candidates[0].state),
        source: candidates[0].source
      };
    }
  } catch {
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
