import { escapeHtml } from "../utils/dom.js";
const MAX_DIFF_LINES = 600;
const MAX_DIFF_CHARS = 120000;
function formatKind(kind) {
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
function formatTimestamp(ts) {
    const date = new Date(ts);
    return date.toLocaleString(undefined, {
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
    });
}
function buildDiff(before, after) {
    if (!before && !after)
        return [{ kind: "equal", text: "(no content)" }];
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
    const dp = Array.from({ length: rows }, () => Array(cols).fill(0));
    for (let i = 1; i < rows; i += 1) {
        for (let j = 1; j < cols; j += 1) {
            if (a[i - 1] === b[j - 1])
                dp[i][j] = dp[i - 1][j - 1] + 1;
            else
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
    }
    const diff = [];
    let i = a.length;
    let j = b.length;
    while (i > 0 && j > 0) {
        if (a[i - 1] === b[j - 1]) {
            diff.push({ kind: "equal", text: a[i - 1] });
            i -= 1;
            j -= 1;
        }
        else if (dp[i - 1][j] >= dp[i][j - 1]) {
            diff.push({ kind: "remove", text: a[i - 1] });
            i -= 1;
        }
        else {
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
function renderDiff(diff) {
    return diff
        .map((line) => {
        const prefix = line.kind === "add" ? "+" : line.kind === "remove" ? "-" : " ";
        return `<div class="diffLine ${line.kind}"><span class="diffPrefix">${prefix}</span>${escapeHtml(line.text)}</div>`;
    })
        .join("");
}
export function createHistoryUiController(dom, history, editor, refocusEditor) {
    let entries = [];
    let selectedId = null;
    let escHandler = null;
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
            var _a;
            const label = `${formatKind(entry.kind)} • ${formatTimestamp(entry.ts)}`;
            const lines = entry.code.split("\n").length;
            return `<button class="historyItem" type="button" data-id="${(_a = entry.id) !== null && _a !== void 0 ? _a : ""}">
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
        if (!entry)
            return;
        const diff = buildDiff(editor.getValue(), entry.code);
        dom.historyDiff.innerHTML = renderDiff(diff);
        dom.historyRestoreBtn.disabled = false;
    }
    function setSelected(id) {
        selectedId = id;
        dom.historyList.querySelectorAll(".historyItem").forEach((item) => {
            const btn = item;
            btn.classList.toggle("active", Number(btn.dataset.id) === id);
        });
        renderDiffPreview();
    }
    function openHistory() {
        dom.historyOverlay.classList.add("active");
        void refreshList();
        escHandler = (e) => {
            if (e.key !== "Escape")
                return;
            if (!dom.historyOverlay.classList.contains("active"))
                return;
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
        const target = e.target;
        const btn = target === null || target === void 0 ? void 0 : target.closest(".historyItem");
        if (!(btn === null || btn === void 0 ? void 0 : btn.dataset.id))
            return;
        const id = Number(btn.dataset.id);
        if (!Number.isFinite(id))
            return;
        setSelected(id);
    });
    dom.historyRestoreBtn.addEventListener("click", () => {
        if (!selectedId)
            return;
        const entry = entries.find((e) => e.id === selectedId);
        if (!entry)
            return;
        editor.setValue(entry.code);
        void history.addEdit({ ts: Date.now(), kind: "restore", code: entry.code });
        closeHistory();
    });
    dom.historyCloseBtn.addEventListener("click", () => {
        closeHistory();
    });
    dom.historyOverlay.addEventListener("click", (e) => {
        if (e.target === dom.historyOverlay)
            closeHistory();
    });
    return {
        openHistory,
        closeHistory
    };
}
