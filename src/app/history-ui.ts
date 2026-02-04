// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2023-2026 Mark Yu

import { escapeHtml } from "../utils/dom.js";
import { DomRefs } from "./dom-refs.js";
import { HistoryController, HistoryEditEntry, HistoryEditKind } from "./history.js";

export type HistoryUiController = {
  openHistory: () => void;
  closeHistory: () => void;
};

const MAX_DIFF_LINES = 600;
const MAX_DIFF_CHARS = 120000;

type DiffLine = { kind: "equal" | "add" | "remove"; text: string };

function formatKind(kind: HistoryEditKind) {
  switch (kind) {
    case "run":
      return "Run";
    case "manual":
      return "Manual";
    case "restore":
      return "Restore";
    case "shared":
      return "Shared";
    default:
      return "Auto";
  }
}

function formatTimestamp(ts: number) {
  const date = new Date(ts);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function buildDiff(before: string, after: string): DiffLine[] {
  if (!before && !after) return [{ kind: "equal", text: "(no content)" }];
  if (before.length + after.length > MAX_DIFF_CHARS) {
    return [{ kind: "equal", text: "Diff preview skipped (too large)." }];
  }
  const a = before.split("\n");
  const b = after.split("\n");
  if (a.length + b.length > MAX_DIFF_LINES) {
    return [{ kind: "equal", text: "Diff preview skipped (too many lines)." }];
  }

  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
      else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  const diff: DiffLine[] = [];
  let i = a.length;
  let j = b.length;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      diff.push({ kind: "equal", text: a[i - 1] });
      i -= 1;
      j -= 1;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      diff.push({ kind: "remove", text: a[i - 1] });
      i -= 1;
    } else {
      diff.push({ kind: "add", text: b[j - 1] });
      j -= 1;
    }
  }
  while (i > 0) {
    diff.push({ kind: "remove", text: a[i - 1] });
    i -= 1;
  }
  while (j > 0) {
    diff.push({ kind: "add", text: b[j - 1] });
    j -= 1;
  }

  return diff.reverse();
}

function renderDiff(diff: DiffLine[]) {
  return diff
    .map((line) => {
      const prefix = line.kind === "add" ? "+" : line.kind === "remove" ? "-" : " ";
      return `<div class="diffLine ${line.kind}"><span class="diffPrefix">${prefix}</span>${escapeHtml(
        line.text
      )}</div>`;
    })
    .join("");
}

export function createHistoryUiController(
  dom: DomRefs,
  history: HistoryController,
  editor: CodeMirrorEditor,
  refocusEditor: () => void
): HistoryUiController {
  let entries: HistoryEditEntry[] = [];
  let selectedId: number | null = null;
  let escHandler: ((e: KeyboardEvent) => void) | null = null;

  async function refreshList() {
    entries = await history.listEdits(80);
    selectedId = null;
    renderList();
    renderDiffPreview();
  }

  function renderList() {
    if (!entries.length) {
      dom.historyList.innerHTML = `<div class="historyEmpty">No snapshots yet.</div>`;
      dom.historyRestoreBtn.disabled = true;
      return;
    }
    dom.historyList.innerHTML = entries
      .map((entry) => {
        const label = `${formatKind(entry.kind)} • ${formatTimestamp(entry.ts)}`;
        const lines = entry.code.split("\n").length;
        return `<button class="historyItem" type="button" data-id="${entry.id ?? ""}">
          <div class="historyItemTitle">${escapeHtml(label)}</div>
          <div class="historyItemMeta">${lines} lines</div>
        </button>`;
      })
      .join("");
  }

  function renderDiffPreview() {
    if (!selectedId) {
      dom.historyDiff.innerHTML =
        `<div class="diffEmpty">Select a snapshot to preview changes.</div>`;
      dom.historyRestoreBtn.disabled = true;
      return;
    }
    const entry = entries.find((e) => e.id === selectedId);
    if (!entry) return;
    const diff = buildDiff(editor.getValue(), entry.code);
    dom.historyDiff.innerHTML = renderDiff(diff);
    dom.historyRestoreBtn.disabled = false;
  }

  function setSelected(id: number) {
    selectedId = id;
    dom.historyList.querySelectorAll(".historyItem").forEach((item) => {
      const btn = item as HTMLButtonElement;
      btn.classList.toggle("active", Number(btn.dataset.id) === id);
    });
    renderDiffPreview();
  }

  function openHistory() {
    dom.historyOverlay.classList.add("active");
    void refreshList();
    escHandler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (!dom.historyOverlay.classList.contains("active")) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      e.stopPropagation();
      closeHistory();
    };
    window.addEventListener("keydown", escHandler, { capture: true });
  }

  function closeHistory() {
    dom.historyOverlay.classList.remove("active");
    if (escHandler) {
      window.removeEventListener("keydown", escHandler, { capture: true });
      escHandler = null;
    }
    refocusEditor();
  }

  dom.historyList.addEventListener("click", (e) => {
    const target = e.target as HTMLElement | null;
    const btn = target?.closest<HTMLButtonElement>(".historyItem");
    if (!btn?.dataset.id) return;
    const id = Number(btn.dataset.id);
    if (!Number.isFinite(id)) return;
    setSelected(id);
  });

  dom.historyRestoreBtn.addEventListener("click", () => {
    if (!selectedId) return;
    const entry = entries.find((e) => e.id === selectedId);
    if (!entry) return;
    editor.setValue(entry.code);
    void history.addEdit({ ts: Date.now(), kind: "restore", code: entry.code });
    closeHistory();
  });

  dom.historyCloseBtn.addEventListener("click", () => {
    closeHistory();
  });

  dom.historyOverlay.addEventListener("click", (e) => {
    if (e.target === dom.historyOverlay) closeHistory();
  });

  return {
    openHistory,
    closeHistory
  };
}
