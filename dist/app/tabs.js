// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2023-2026 Mark Yu
import { debounce } from "../utils/dom.js";
import { dataUrlFromBase64, formatBytes, getBasename, getFileIcon, guessMimeType, isCsvPath, isImagePath, isJsonPath, isTextPath, normalizeWorkspacePath } from "./workspace-files.js";
import { persistWorkspaceState, sanitizeFilename } from "./workspace-session.js";
function createId() {
    return `tab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
function splitBaseAndExt(name) {
    const dotIdx = name.lastIndexOf(".");
    if (dotIdx <= 0) {
        return { base: name, ext: "" };
    }
    return {
        base: name.slice(0, dotIdx),
        ext: name.slice(dotIdx)
    };
}
function countBytes(tab) {
    if (tab.encoding === "base64") {
        const len = tab.content.length;
        return Math.max(0, Math.floor((len * 3) / 4) - (tab.content.endsWith("==") ? 2 : tab.content.endsWith("=") ? 1 : 0));
    }
    return new TextEncoder().encode(tab.content).length;
}
function ensureUniqueFilename(name, docs, excludeId) {
    const nextName = sanitizeFilename(name);
    const existing = new Set(docs.filter((doc) => doc.id !== excludeId).map((doc) => doc.name.toLowerCase()));
    if (!existing.has(nextName.toLowerCase()))
        return nextName;
    const parts = nextName.split("/");
    const leaf = parts.pop() || "untitled.py";
    const parent = parts.join("/");
    const { base, ext } = splitBaseAndExt(leaf);
    for (let i = 2; i < 5000; i += 1) {
        const candidateLeaf = `${base}-${i}${ext}`;
        const candidate = parent ? `${parent}/${candidateLeaf}` : candidateLeaf;
        if (!existing.has(candidate.toLowerCase()))
            return candidate;
    }
    const candidate = parent ? `${parent}/${base}-${Date.now()}${ext}` : `${base}-${Date.now()}${ext}`;
    return candidate;
}
function makeTabDoc(name, content, docs, opts = {}, excludeId) {
    const normalizedName = ensureUniqueFilename(name, docs, excludeId);
    const mime = guessMimeType(normalizedName, opts.mime || "");
    const encoding = opts.encoding || (isTextPath(normalizedName, mime) ? "utf8" : "base64");
    const savedContent = typeof opts.savedContent === "string" ? opts.savedContent : content;
    return {
        id: excludeId || createId(),
        name: normalizedName,
        content,
        savedContent,
        dirty: content !== savedContent,
        mime,
        encoding
    };
}
function createFallbackTab(docs) {
    return makeTabDoc("untitled.py", "", docs, {
        mime: "text/x-python",
        encoding: "utf8",
        savedContent: ""
    });
}
function createTreeNode(path, label) {
    return {
        folders: new Map(),
        files: [],
        path,
        label
    };
}
function buildTree(tabs) {
    const root = createTreeNode("", "Workspace");
    const sortedTabs = [...tabs].sort((a, b) => a.name.localeCompare(b.name));
    for (const tab of sortedTabs) {
        const parts = tab.name.split("/");
        let node = root;
        let currentPath = "";
        for (let i = 0; i < parts.length - 1; i += 1) {
            const part = parts[i];
            currentPath = currentPath ? `${currentPath}/${part}` : part;
            let next = node.folders.get(part);
            if (!next) {
                next = createTreeNode(currentPath, part);
                node.folders.set(part, next);
            }
            node = next;
        }
        node.files.push(tab);
    }
    return root;
}
function parseDelimitedRows(raw, delimiter) {
    return raw
        .split(/\r?\n/)
        .filter((line) => line.trim().length)
        .slice(0, 20)
        .map((line) => line.split(delimiter).map((cell) => cell.trim()));
}
function describeJsonValue(value) {
    if (Array.isArray(value)) {
        return `${value.length} ${value.length === 1 ? "item" : "items"}`;
    }
    if (value && typeof value === "object") {
        const keys = Object.keys(value);
        return `${keys.length} ${keys.length === 1 ? "key" : "keys"}`;
    }
    if (value === null)
        return "null";
    return typeof value;
}
function createJsonScalarNode(value) {
    const span = document.createElement("span");
    span.className = "workspaceJsonScalar";
    if (typeof value === "string") {
        span.classList.add("string");
        span.textContent = JSON.stringify(value);
        return span;
    }
    if (typeof value === "number") {
        span.classList.add("number");
        span.textContent = Number.isFinite(value) ? String(value) : "null";
        return span;
    }
    if (typeof value === "boolean") {
        span.classList.add("boolean");
        span.textContent = value ? "true" : "false";
        return span;
    }
    span.classList.add("null");
    span.textContent = "null";
    return span;
}
function createJsonNode(value, depth, state) {
    if (value === null ||
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean") {
        return createJsonScalarNode(value);
    }
    const isArray = Array.isArray(value);
    const entries = isArray
        ? value.map((entry, index) => [String(index), entry])
        : Object.entries(value);
    if (!entries.length) {
        const empty = document.createElement("span");
        empty.className = "workspaceJsonEmpty";
        empty.textContent = isArray ? "[]" : "{}";
        return empty;
    }
    const details = document.createElement("details");
    details.className = `workspaceJsonNode ${isArray ? "array" : "object"}`;
    details.open = depth < 2;
    const summary = document.createElement("summary");
    summary.className = "workspaceJsonSummary";
    const type = document.createElement("span");
    type.className = "workspaceJsonType";
    type.textContent = isArray ? "Array" : "Object";
    const meta = document.createElement("span");
    meta.className = "workspaceJsonMeta";
    meta.textContent = describeJsonValue(value);
    summary.append(type, meta);
    details.appendChild(summary);
    const children = document.createElement("div");
    children.className = "workspaceJsonChildren";
    let didTruncateHere = false;
    for (const [key, entryValue] of entries) {
        if (state.remaining <= 0) {
            state.truncated = true;
            didTruncateHere = true;
            break;
        }
        state.remaining -= 1;
        const row = document.createElement("div");
        row.className = "workspaceJsonRow";
        const keyEl = document.createElement("div");
        keyEl.className = "workspaceJsonKey";
        keyEl.textContent = isArray ? `[${key}]` : key;
        const valueEl = document.createElement("div");
        valueEl.className = "workspaceJsonValue";
        valueEl.appendChild(createJsonNode(entryValue, depth + 1, state));
        row.append(keyEl, valueEl);
        children.appendChild(row);
    }
    if (didTruncateHere) {
        const note = document.createElement("div");
        note.className = "workspacePreviewNote";
        note.textContent = "Preview truncated to keep large JSON files responsive.";
        children.appendChild(note);
    }
    details.appendChild(children);
    return details;
}
export function createTabsController(opts) {
    const { dom, storedState, defaultFilename, defaultContent, setEditorDocument, refocusEditor, onActiveFilenameChange, onAnyDirtyChange, onNotify, confirmCloseTab } = opts;
    let tabs = [];
    let activeId = "";
    if (storedState) {
        tabs = storedState.tabs.map((tab) => ({
            id: tab.id,
            name: sanitizeFilename(tab.name),
            content: tab.content,
            savedContent: tab.savedContent,
            dirty: !!tab.dirty,
            mime: tab.mime || guessMimeType(tab.name, ""),
            encoding: tab.encoding || (isTextPath(tab.name, tab.mime) ? "utf8" : "base64")
        }));
        activeId = tabs.some((tab) => tab.id === storedState.activeId) ? storedState.activeId : tabs[0].id;
    }
    else {
        tabs = [
            makeTabDoc(defaultFilename || "untitled.py", defaultContent, [], {
                savedContent: defaultContent,
                mime: "text/x-python",
                encoding: "utf8"
            })
        ];
        activeId = tabs[0].id;
    }
    let renamingTabId = null;
    let renameTarget = "tab";
    let dragTabId = null;
    let dragOverTabId = null;
    let dragOverPosition = null;
    let dragInsertIndex = null;
    let workspaceRefocusTimer = null;
    let lastWorkspacePointerDown = null;
    const collapsedFolders = new Set();
    function getActiveTab() {
        var _a, _b;
        return (_b = (_a = tabs.find((tab) => tab.id === activeId)) !== null && _a !== void 0 ? _a : tabs[0]) !== null && _b !== void 0 ? _b : null;
    }
    function hasDirtyTabs() {
        return tabs.some((tab) => tab.dirty);
    }
    function snapshotState() {
        return {
            version: 1,
            activeId,
            tabs: tabs.map((tab) => ({ ...tab }))
        };
    }
    function isTextTab(tab) {
        return !!tab && tab.encoding === "utf8" && isTextPath(tab.name, tab.mime);
    }
    function renderWorkspaceTree() {
        dom.workspaceTree.innerHTML = "";
        const folderCount = new Set(tabs.flatMap((tab) => {
            const parts = tab.name.split("/");
            const folders = [];
            let current = "";
            for (let i = 0; i < parts.length - 1; i += 1) {
                current = current ? `${current}/${parts[i]}` : parts[i];
                folders.push(current);
            }
            return folders;
        })).size;
        dom.workspaceMeta.textContent = `${tabs.length} file${tabs.length === 1 ? "" : "s"}${folderCount ? ` · ${folderCount} folder${folderCount === 1 ? "" : "s"}` : ""}`;
        if (!tabs.length) {
            const empty = document.createElement("div");
            empty.className = "workspaceEmpty workspaceTreeEmpty";
            empty.textContent = "No files in this workspace yet.";
            dom.workspaceTree.appendChild(empty);
            return;
        }
        const tree = buildTree(tabs);
        const appendNode = (node, depth) => {
            const folders = [...node.folders.values()].sort((a, b) => a.label.localeCompare(b.label));
            for (const folder of folders) {
                const row = document.createElement("button");
                row.type = "button";
                const collapsed = collapsedFolders.has(folder.path);
                row.className = `workspaceFolder${collapsed ? " collapsed" : ""}`;
                row.dataset.folderPath = folder.path;
                row.setAttribute("role", "treeitem");
                row.setAttribute("aria-expanded", collapsed ? "false" : "true");
                row.title = folder.path;
                row.style.setProperty("--workspace-depth", String(depth));
                row.innerHTML =
                    `<span class="material-icons workspaceFolderChevron" aria-hidden="true">${collapsed ? "chevron_right" : "expand_more"}</span>` +
                        `<span class="material-icons workspaceFolderIcon" aria-hidden="true">${collapsed ? "folder" : "folder_open"}</span>` +
                        `<span class="workspaceLabel">${folder.label}</span>`;
                dom.workspaceTree.appendChild(row);
                if (!collapsed) {
                    appendNode(folder, depth + 1);
                }
            }
            for (const tab of node.files) {
                const isRenamingHere = tab.id === renamingTabId && renameTarget === "workspace";
                const row = document.createElement(isRenamingHere ? "div" : "button");
                if (row instanceof HTMLButtonElement) {
                    row.type = "button";
                }
                row.className = `workspaceFile${tab.id === activeId ? " active" : ""}${isRenamingHere ? " renaming" : ""}`;
                row.dataset.tabId = tab.id;
                row.setAttribute("role", "treeitem");
                row.setAttribute("aria-selected", tab.id === activeId ? "true" : "false");
                row.style.setProperty("--workspace-depth", String(depth));
                row.title = tab.name;
                const icon = document.createElement("span");
                icon.className = "material-icons";
                icon.setAttribute("aria-hidden", "true");
                icon.textContent = getFileIcon(tab.name, tab.mime);
                row.appendChild(icon);
                if (isRenamingHere) {
                    const input = document.createElement("input");
                    input.type = "text";
                    input.className = "workspaceRenameInput";
                    input.value = tab.name;
                    input.dataset.action = "rename-input";
                    input.dataset.tabId = tab.id;
                    input.setAttribute("aria-label", "Rename workspace file");
                    row.appendChild(input);
                }
                else {
                    const label = document.createElement("span");
                    label.className = "workspaceLabel";
                    label.textContent = getBasename(tab.name);
                    row.appendChild(label);
                }
                const meta = document.createElement("span");
                meta.className = "workspaceMeta";
                meta.textContent = tab.dirty ? "Edited" : "";
                row.appendChild(meta);
                dom.workspaceTree.appendChild(row);
            }
        };
        appendNode(tree, 0);
        if (renamingTabId && renameTarget === "workspace") {
            requestAnimationFrame(() => {
                const input = dom.workspaceTree.querySelector(`.workspaceRenameInput[data-tab-id="${renamingTabId}"]`);
                if (!input)
                    return;
                input.focus();
                input.select();
            });
        }
    }
    function renderPreview(tab) {
        dom.filePreviewBody.innerHTML = "";
        dom.filePreviewMeta.textContent = "Preview";
        dom.filePreviewPane.hidden = true;
        dom.editorSurface.hidden = false;
        dom.editorPane.classList.remove("previewOnly", "dataPreviewVisible");
        if (!tab)
            return;
        const sizeLabel = formatBytes(countBytes(tab));
        const defaultMeta = `${tab.name} · ${sizeLabel}`;
        if (tab.encoding === "base64") {
            dom.filePreviewPane.hidden = false;
            dom.editorSurface.hidden = true;
            dom.editorPane.classList.add("previewOnly");
            const card = document.createElement("div");
            card.className = "workspacePreviewCard";
            const title = document.createElement("div");
            title.className = "workspacePreviewTitle";
            title.textContent = isImagePath(tab.name, tab.mime) ? "Image preview" : "Binary file preview";
            const meta = document.createElement("div");
            meta.className = "workspacePreviewMeta";
            meta.textContent = `${tab.name} · ${tab.mime || "application/octet-stream"} · ${sizeLabel}`;
            card.append(title, meta);
            if (isImagePath(tab.name, tab.mime)) {
                const img = document.createElement("img");
                img.className = "workspacePreviewImage";
                img.alt = getBasename(tab.name);
                img.src = dataUrlFromBase64(tab.content, tab.mime || "");
                card.appendChild(img);
            }
            else {
                const note = document.createElement("div");
                note.className = "workspacePreviewNote";
                note.textContent = "This file is stored in the workspace and available to Python code, but it is not editable in the text editor.";
                card.appendChild(note);
            }
            dom.filePreviewMeta.textContent = `${tab.name} · ${tab.mime || "application/octet-stream"} · ${sizeLabel}`;
            dom.filePreviewBody.appendChild(card);
            dom.editorStatus.textContent = `Preview · ${sizeLabel}`;
            return;
        }
        if (isJsonPath(tab.name, tab.mime)) {
            dom.filePreviewPane.hidden = false;
            dom.editorPane.classList.add("dataPreviewVisible");
            const card = document.createElement("div");
            card.className = "workspacePreviewCard";
            const title = document.createElement("div");
            title.className = "workspacePreviewTitle";
            title.textContent = "Formatted JSON";
            card.appendChild(title);
            try {
                const parsed = JSON.parse(tab.content);
                const meta = document.createElement("div");
                meta.className = "workspacePreviewMeta";
                meta.textContent = describeJsonValue(parsed);
                card.appendChild(meta);
                const tree = document.createElement("div");
                tree.className = "workspaceJsonTree";
                const state = { remaining: 450, truncated: false };
                tree.appendChild(createJsonNode(parsed, 0, state));
                card.appendChild(tree);
            }
            catch {
                const note = document.createElement("div");
                note.className = "workspacePreviewNote";
                note.textContent = "This file is not valid JSON yet, so Inscribe is showing the raw text instead.";
                card.appendChild(note);
                const pre = document.createElement("pre");
                pre.className = "workspacePreviewCode workspacePreviewCodeWrap";
                pre.textContent = tab.content;
                card.appendChild(pre);
            }
            dom.filePreviewMeta.textContent = `${defaultMeta} · JSON preview`;
            dom.filePreviewBody.appendChild(card);
            dom.editorStatus.textContent = `JSON preview · ${sizeLabel}`;
            return;
        }
        if (isCsvPath(tab.name, tab.mime)) {
            dom.filePreviewPane.hidden = false;
            dom.editorPane.classList.add("dataPreviewVisible");
            const card = document.createElement("div");
            card.className = "workspacePreviewCard";
            const title = document.createElement("div");
            title.className = "workspacePreviewTitle";
            title.textContent = "Table preview";
            card.appendChild(title);
            const rows = parseDelimitedRows(tab.content, tab.name.toLowerCase().endsWith(".tsv") ? "\t" : ",");
            if (!rows.length) {
                const empty = document.createElement("div");
                empty.className = "workspacePreviewNote";
                empty.textContent = "No table rows found yet.";
                card.appendChild(empty);
            }
            else {
                const tableWrap = document.createElement("div");
                tableWrap.className = "workspacePreviewTableWrap";
                const table = document.createElement("table");
                table.className = "workspacePreviewTable";
                const body = document.createElement("tbody");
                rows.forEach((row, rowIdx) => {
                    const tr = document.createElement("tr");
                    row.forEach((cell) => {
                        const cellEl = document.createElement(rowIdx === 0 ? "th" : "td");
                        cellEl.textContent = cell;
                        tr.appendChild(cellEl);
                    });
                    body.appendChild(tr);
                });
                table.appendChild(body);
                tableWrap.appendChild(table);
                card.appendChild(tableWrap);
            }
            dom.filePreviewMeta.textContent = `${defaultMeta} · Table preview`;
            dom.filePreviewBody.appendChild(card);
            dom.editorStatus.textContent = `Table preview · ${sizeLabel}`;
        }
    }
    const persistDebounced = debounce(() => {
        void persistWorkspaceState(snapshotState());
    }, 160);
    const flushPersistence = () => {
        persistDebounced.flush();
    };
    window.addEventListener("pagehide", flushPersistence);
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") {
            flushPersistence();
        }
    });
    function scrollActiveTabIntoView() {
        requestAnimationFrame(() => {
            const active = dom.tabStrip.querySelector(".tabItem.active");
            active === null || active === void 0 ? void 0 : active.scrollIntoView({ block: "nearest", inline: "nearest" });
        });
    }
    function renderTabs() {
        const addBtn = dom.newTabBtn;
        dom.tabStrip.innerHTML = "";
        for (const tab of tabs) {
            const item = document.createElement("div");
            item.className = `tabItem${tab.id === activeId ? " active" : ""}${tab.id === renamingTabId ? " renaming" : ""}`;
            item.dataset.tabId = tab.id;
            item.draggable = tab.id !== renamingTabId;
            if (tab.id === renamingTabId && renameTarget === "tab") {
                const renameInput = document.createElement("input");
                renameInput.type = "text";
                renameInput.className = "tabRenameInput";
                renameInput.value = tab.name;
                renameInput.dataset.action = "rename-input";
                renameInput.dataset.tabId = tab.id;
                renameInput.setAttribute("aria-label", "Rename workspace file");
                item.appendChild(renameInput);
            }
            else {
                const selectBtn = document.createElement("button");
                selectBtn.type = "button";
                selectBtn.className = "tabSelect";
                selectBtn.dataset.action = "select";
                selectBtn.dataset.tabId = tab.id;
                selectBtn.title = tab.name;
                selectBtn.setAttribute("role", "tab");
                selectBtn.setAttribute("aria-selected", tab.id === activeId ? "true" : "false");
                const iconEl = document.createElement("span");
                iconEl.className = "material-icons tabFileIcon";
                iconEl.setAttribute("aria-hidden", "true");
                iconEl.textContent = getFileIcon(tab.name, tab.mime);
                const nameEl = document.createElement("span");
                nameEl.className = "tabName";
                nameEl.textContent = getBasename(tab.name);
                const dirtyDot = document.createElement("span");
                dirtyDot.className = `tabDirtyDot${tab.dirty ? "" : " hidden"}`;
                dirtyDot.setAttribute("aria-hidden", "true");
                selectBtn.append(iconEl, nameEl, dirtyDot);
                item.appendChild(selectBtn);
            }
            const closeBtn = document.createElement("button");
            closeBtn.type = "button";
            closeBtn.className = "tabClose";
            closeBtn.dataset.action = "close";
            closeBtn.dataset.tabId = tab.id;
            closeBtn.title = tabs.length === 1 ? "At least one file is required" : `Remove ${tab.name}`;
            closeBtn.disabled = tabs.length === 1 || tab.id === renamingTabId;
            closeBtn.setAttribute("aria-label", `Remove ${tab.name}`);
            closeBtn.innerHTML = '<span class="material-icons" aria-hidden="true">close</span>';
            item.appendChild(closeBtn);
            dom.tabStrip.appendChild(item);
        }
        dom.tabStrip.appendChild(addBtn);
        scrollActiveTabIntoView();
        if (renamingTabId && renameTarget === "tab") {
            requestAnimationFrame(() => {
                const input = dom.tabStrip.querySelector(`.tabRenameInput[data-tab-id="${renamingTabId}"]`);
                if (!input)
                    return;
                input.focus();
                input.select();
            });
        }
    }
    function syncEditorToActiveTab() {
        const active = getActiveTab();
        if (!active)
            return;
        if (isTextTab(active)) {
            setEditorDocument(active.content, active.savedContent);
        }
        else {
            setEditorDocument("", "");
        }
        onActiveFilenameChange(active.name);
        onAnyDirtyChange(hasDirtyTabs());
        renderTabs();
        renderWorkspaceTree();
        renderPreview(active);
    }
    function activateTab(id) {
        if (!tabs.some((tab) => tab.id === id))
            return;
        if (activeId === id && !renamingTabId)
            return;
        renamingTabId = null;
        renameTarget = "tab";
        activeId = id;
        syncEditorToActiveTab();
    }
    async function closeTab(id) {
        if (tabs.length === 1)
            return;
        const toClose = tabs.find((tab) => tab.id === id);
        if (!toClose)
            return;
        const proceed = await confirmCloseTab(toClose);
        if (!proceed) {
            refocusEditor();
            return;
        }
        const idx = tabs.findIndex((tab) => tab.id === id);
        tabs = tabs.filter((tab) => tab.id !== id);
        if (!tabs.length)
            return;
        if (renamingTabId === id)
            renamingTabId = null;
        const nextIdx = Math.max(0, idx - 1);
        if (activeId === id) {
            activeId = tabs[Math.min(nextIdx, tabs.length - 1)].id;
            syncEditorToActiveTab();
        }
        else {
            renderTabs();
            renderWorkspaceTree();
            onAnyDirtyChange(hasDirtyTabs());
        }
        persistDebounced();
        refocusEditor();
    }
    function createNewTab() {
        renamingTabId = null;
        const name = ensureUniqueFilename("untitled.py", tabs);
        const newTab = makeTabDoc(name, "", tabs, {
            mime: "text/x-python",
            encoding: "utf8",
            savedContent: ""
        });
        tabs.push(newTab);
        activeId = newTab.id;
        syncEditorToActiveTab();
        persistDebounced();
        onNotify("New workspace file", name, "note_add");
        refocusEditor();
    }
    function openFileAsTab(name, content, extra = {}) {
        renamingTabId = null;
        const doc = makeTabDoc(name, content, tabs, extra);
        tabs.push(doc);
        activeId = doc.id;
        syncEditorToActiveTab();
        persistDebounced();
    }
    function importFiles(files, opts = {}) {
        var _a, _b;
        if (!files.length)
            return;
        if (opts.replaceAll) {
            const nextTabs = files.map((file, index) => makeTabDoc(file.name, file.content, [], file, `tab_import_${index}`));
            tabs = nextTabs;
            const activeName = opts.activeName ? sanitizeFilename(opts.activeName) : null;
            activeId =
                (activeName && ((_a = tabs.find((tab) => tab.name === activeName)) === null || _a === void 0 ? void 0 : _a.id)) ||
                    ((_b = tabs[0]) === null || _b === void 0 ? void 0 : _b.id) ||
                    "";
            syncEditorToActiveTab();
            persistDebounced();
            return;
        }
        for (const file of files) {
            const doc = makeTabDoc(file.name, file.content, tabs, file);
            tabs.push(doc);
            activeId = doc.id;
        }
        syncEditorToActiveTab();
        persistDebounced();
    }
    function applyRuntimeWorkspace(files, sync) {
        var _a, _b, _c;
        const previousActive = getActiveTab();
        const previousActiveName = (previousActive === null || previousActive === void 0 ? void 0 : previousActive.name) || null;
        const previousByName = new Map(tabs.map((tab) => [tab.name, tab]));
        const previousOrder = new Map(tabs.map((tab, index) => [tab.name, index]));
        const incomingTabs = files
            .map((file) => {
            var _a;
            const name = sanitizeFilename(file.path);
            const existing = previousByName.get(name);
            const savedContent = (_a = existing === null || existing === void 0 ? void 0 : existing.savedContent) !== null && _a !== void 0 ? _a : "";
            const content = file.content;
            return {
                id: (existing === null || existing === void 0 ? void 0 : existing.id) || createId(),
                name,
                content,
                savedContent,
                dirty: content !== savedContent,
                mime: guessMimeType(name, file.mime || ""),
                encoding: file.encoding
            };
        })
            .filter((tab, index, list) => list.findIndex((entry) => entry.name === tab.name) === index)
            .sort((a, b) => {
            const aOrder = previousOrder.get(a.name);
            const bOrder = previousOrder.get(b.name);
            if (typeof aOrder === "number" && typeof bOrder === "number") {
                return aOrder - bOrder;
            }
            if (typeof aOrder === "number")
                return -1;
            if (typeof bOrder === "number")
                return 1;
            return a.name.localeCompare(b.name);
        });
        const incomingNames = new Set(incomingTabs.map((tab) => tab.name));
        const added = incomingTabs.filter((tab) => !previousByName.has(tab.name)).length;
        const updated = incomingTabs.filter((tab) => {
            const prev = previousByName.get(tab.name);
            return !!prev && (prev.content !== tab.content ||
                prev.mime !== tab.mime ||
                prev.encoding !== tab.encoding);
        }).length;
        const removed = ((_a = sync === null || sync === void 0 ? void 0 : sync.deletedPaths) === null || _a === void 0 ? void 0 : _a.length)
            ? sync.deletedPaths
                .map((path) => normalizeWorkspacePath(path))
                .filter((path) => !!path && previousByName.has(path) && !incomingNames.has(path)).length
            : tabs.filter((tab) => !incomingNames.has(tab.name)).length;
        let createdFallback = false;
        if (!incomingTabs.length) {
            incomingTabs.push(createFallbackTab([]));
            createdFallback = true;
        }
        tabs = incomingTabs;
        renamingTabId = null;
        const preferredActiveName = (sync === null || sync === void 0 ? void 0 : sync.activePath) ? sanitizeFilename(sync.activePath) : previousActiveName;
        activeId =
            (preferredActiveName && ((_b = tabs.find((tab) => tab.name === preferredActiveName)) === null || _b === void 0 ? void 0 : _b.id)) ||
                ((_c = tabs[0]) === null || _c === void 0 ? void 0 : _c.id) ||
                activeId;
        syncEditorToActiveTab();
        persistDebounced();
        if (!added && !updated && !removed && !createdFallback) {
            return null;
        }
        return { added, updated, removed, createdFallback };
    }
    function replaceActiveTab(name, content, extra = {}) {
        renamingTabId = null;
        const active = getActiveTab();
        if (!active)
            return;
        const next = makeTabDoc(name, content, tabs, extra, active.id);
        Object.assign(active, next, { id: active.id });
        syncEditorToActiveTab();
        persistDebounced();
    }
    function updateActiveContent(content) {
        const active = getActiveTab();
        if (!active || !isTextTab(active))
            return;
        const wasDirty = active.dirty;
        active.content = content;
        active.dirty = content !== active.savedContent;
        if (wasDirty !== active.dirty) {
            renderTabs();
            renderWorkspaceTree();
            onAnyDirtyChange(hasDirtyTabs());
        }
        renderPreview(active);
        persistDebounced();
    }
    function setActiveDirty(dirty) {
        const active = getActiveTab();
        if (!active || !isTextTab(active))
            return;
        if (active.dirty === dirty) {
            onAnyDirtyChange(hasDirtyTabs());
            return;
        }
        active.dirty = dirty;
        renderTabs();
        renderWorkspaceTree();
        onAnyDirtyChange(hasDirtyTabs());
        persistDebounced();
    }
    function markActiveSaved() {
        const active = getActiveTab();
        if (!active)
            return;
        active.savedContent = active.content;
        if (active.dirty) {
            active.dirty = false;
            renderTabs();
            renderWorkspaceTree();
        }
        onAnyDirtyChange(hasDirtyTabs());
        persistDebounced();
    }
    function markAllSaved() {
        let changed = false;
        tabs.forEach((tab) => {
            if (tab.savedContent !== tab.content || tab.dirty) {
                tab.savedContent = tab.content;
                tab.dirty = false;
                changed = true;
            }
        });
        if (changed) {
            renderTabs();
            renderWorkspaceTree();
        }
        onAnyDirtyChange(hasDirtyTabs());
        persistDebounced();
    }
    function applyRename(tabId, nextName) {
        const tab = tabs.find((entry) => entry.id === tabId);
        if (!tab)
            return;
        const trimmed = nextName.trim();
        if (!trimmed) {
            renamingTabId = null;
            renameTarget = "tab";
            renderTabs();
            renderWorkspaceTree();
            return;
        }
        const unique = ensureUniqueFilename(trimmed, tabs, tabId);
        tab.name = unique;
        tab.mime = guessMimeType(unique, tab.mime || "");
        renamingTabId = null;
        renameTarget = "tab";
        if (tab.id === activeId) {
            onActiveFilenameChange(tab.name);
        }
        renderTabs();
        renderWorkspaceTree();
        renderPreview(tab);
        persistDebounced();
    }
    function beginRename(tabId = activeId, target = "tab") {
        if (!tabs.some((tab) => tab.id === tabId))
            return;
        renamingTabId = tabId;
        renameTarget = target;
        renderTabs();
        renderWorkspaceTree();
    }
    function cancelRename() {
        if (!renamingTabId)
            return;
        renamingTabId = null;
        renameTarget = "tab";
        renderTabs();
        renderWorkspaceTree();
    }
    function closeActiveTab() {
        void closeTab(activeId);
    }
    function clearDragState() {
        dragTabId = null;
        dragOverTabId = null;
        dragOverPosition = null;
        dragInsertIndex = null;
    }
    function clearWorkspaceRefocusTimer() {
        if (workspaceRefocusTimer !== null) {
            window.clearTimeout(workspaceRefocusTimer);
            workspaceRefocusTimer = null;
        }
    }
    function clearDragClasses() {
        dom.tabStrip.querySelectorAll(".tabItem").forEach((el) => {
            el.classList.remove("dragging", "dropBefore", "dropAfter");
        });
    }
    function applyDragClasses() {
        var _a, _b;
        clearDragClasses();
        if (dragTabId) {
            (_a = dom.tabStrip.querySelector(`.tabItem[data-tab-id="${dragTabId}"]`)) === null || _a === void 0 ? void 0 : _a.classList.add("dragging");
        }
        if (dragOverTabId && dragOverPosition) {
            (_b = dom.tabStrip
                .querySelector(`.tabItem[data-tab-id="${dragOverTabId}"]`)) === null || _b === void 0 ? void 0 : _b.classList.add(dragOverPosition === "before" ? "dropBefore" : "dropAfter");
        }
    }
    function getDropTargets() {
        return Array.from(dom.tabStrip.querySelectorAll(".tabItem")).filter((el) => {
            const tabId = el.dataset.tabId;
            return !!tabId && tabId !== dragTabId;
        });
    }
    function autoScrollTabStrip(clientX) {
        const rect = dom.tabStrip.getBoundingClientRect();
        const edgePadding = 40;
        const maxStep = 18;
        if (clientX < rect.left + edgePadding) {
            const progress = (rect.left + edgePadding - clientX) / edgePadding;
            dom.tabStrip.scrollLeft -= Math.ceil(progress * maxStep);
            return;
        }
        if (clientX > rect.right - edgePadding) {
            const progress = (clientX - (rect.right - edgePadding)) / edgePadding;
            dom.tabStrip.scrollLeft += Math.ceil(progress * maxStep);
        }
    }
    function updateDragTargetFromPointer(clientX) {
        var _a, _b;
        if (!dragTabId)
            return;
        const targets = getDropTargets();
        if (!targets.length) {
            dragOverTabId = null;
            dragOverPosition = null;
            dragInsertIndex = 0;
            return;
        }
        let insertIndex = targets.length;
        for (let i = 0; i < targets.length; i += 1) {
            const rect = targets[i].getBoundingClientRect();
            const midpoint = rect.left + rect.width / 2;
            if (clientX < midpoint) {
                insertIndex = i;
                break;
            }
        }
        dragInsertIndex = insertIndex;
        if (insertIndex < targets.length) {
            dragOverTabId = (_a = targets[insertIndex].dataset.tabId) !== null && _a !== void 0 ? _a : null;
            dragOverPosition = "before";
            return;
        }
        const lastTarget = targets[targets.length - 1];
        dragOverTabId = (_b = lastTarget.dataset.tabId) !== null && _b !== void 0 ? _b : null;
        dragOverPosition = "after";
    }
    function reorderDraggedTab() {
        if (!dragTabId || dragInsertIndex === null)
            return;
        const sourceIdx = tabs.findIndex((tab) => tab.id === dragTabId);
        if (sourceIdx < 0)
            return;
        const sourceTab = tabs[sourceIdx];
        const nextTabs = tabs.filter((tab) => tab.id !== dragTabId);
        const insertIdx = Math.max(0, Math.min(dragInsertIndex, nextTabs.length));
        nextTabs.splice(insertIdx, 0, sourceTab);
        tabs = nextTabs;
        renderTabs();
        renderWorkspaceTree();
        persistDebounced();
    }
    function activateByOffset(offset) {
        if (tabs.length <= 1)
            return;
        renamingTabId = null;
        const idx = tabs.findIndex((tab) => tab.id === activeId);
        if (idx < 0)
            return;
        const nextIdx = (idx + offset + tabs.length) % tabs.length;
        activeId = tabs[nextIdx].id;
        syncEditorToActiveTab();
        refocusEditor();
        persistDebounced();
    }
    dom.newTabBtn.addEventListener("click", createNewTab);
    dom.workspaceTree.addEventListener("mousedown", (event) => {
        const target = event.target;
        if (target instanceof HTMLInputElement && target.dataset.action === "rename-input")
            return;
        const row = target === null || target === void 0 ? void 0 : target.closest(".workspaceFile");
        const tabId = row === null || row === void 0 ? void 0 : row.dataset.tabId;
        if (!tabId) {
            lastWorkspacePointerDown = null;
            return;
        }
        const now = performance.now();
        if (lastWorkspacePointerDown &&
            lastWorkspacePointerDown.tabId === tabId &&
            now - lastWorkspacePointerDown.at < 450) {
            lastWorkspacePointerDown = null;
            clearWorkspaceRefocusTimer();
            activateTab(tabId);
            beginRename(tabId, "workspace");
            event.preventDefault();
            return;
        }
        lastWorkspacePointerDown = { tabId, at: now };
    });
    dom.workspaceTree.addEventListener("click", (event) => {
        const target = event.target;
        if (target instanceof HTMLInputElement && target.dataset.action === "rename-input")
            return;
        const folderBtn = target === null || target === void 0 ? void 0 : target.closest(".workspaceFolder");
        const folderPath = folderBtn === null || folderBtn === void 0 ? void 0 : folderBtn.dataset.folderPath;
        if (folderPath) {
            if (collapsedFolders.has(folderPath)) {
                collapsedFolders.delete(folderPath);
            }
            else {
                collapsedFolders.add(folderPath);
            }
            renderWorkspaceTree();
            return;
        }
        const btn = target === null || target === void 0 ? void 0 : target.closest(".workspaceFile");
        const tabId = btn === null || btn === void 0 ? void 0 : btn.dataset.tabId;
        if (!tabId)
            return;
        clearWorkspaceRefocusTimer();
        if (event.detail >= 2) {
            lastWorkspacePointerDown = null;
            activateTab(tabId);
            beginRename(tabId, "workspace");
            event.preventDefault();
            return;
        }
        activateTab(tabId);
        workspaceRefocusTimer = window.setTimeout(() => {
            workspaceRefocusTimer = null;
            if (renamingTabId)
                return;
            refocusEditor();
        }, 220);
    });
    dom.workspaceTree.addEventListener("dblclick", (event) => {
        const target = event.target;
        if (target instanceof HTMLInputElement && target.dataset.action === "rename-input")
            return;
        const row = target === null || target === void 0 ? void 0 : target.closest(".workspaceFile");
        const tabId = row === null || row === void 0 ? void 0 : row.dataset.tabId;
        if (!tabId)
            return;
        clearWorkspaceRefocusTimer();
        activateTab(tabId);
        beginRename(tabId, "workspace");
        event.preventDefault();
    });
    dom.workspaceTree.addEventListener("keydown", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement))
            return;
        if (target.dataset.action !== "rename-input")
            return;
        const tabId = target.dataset.tabId;
        if (!tabId)
            return;
        if (event.key === "Enter") {
            event.preventDefault();
            applyRename(tabId, target.value);
            refocusEditor();
            return;
        }
        if (event.key === "Escape") {
            event.preventDefault();
            cancelRename();
            refocusEditor();
        }
    });
    dom.workspaceTree.addEventListener("blur", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement))
            return;
        if (target.dataset.action !== "rename-input")
            return;
        if (renameTarget !== "workspace")
            return;
        clearWorkspaceRefocusTimer();
        const tabId = target.dataset.tabId;
        if (!tabId || renamingTabId !== tabId)
            return;
        applyRename(tabId, target.value);
    }, true);
    dom.tabStrip.addEventListener("dragstart", (event) => {
        const target = event.target;
        if (!target)
            return;
        if (target.closest('[data-action="close"]')) {
            event.preventDefault();
            return;
        }
        const tabItem = target.closest(".tabItem");
        if (!tabItem)
            return;
        const tabId = tabItem.dataset.tabId;
        if (!tabId || tabId === renamingTabId) {
            event.preventDefault();
            return;
        }
        dragTabId = tabId;
        dragOverTabId = null;
        dragOverPosition = null;
        dragInsertIndex = null;
        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", tabId);
        }
        applyDragClasses();
    });
    dom.tabStrip.addEventListener("dragover", (event) => {
        if (!dragTabId)
            return;
        event.preventDefault();
        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = "move";
        }
        autoScrollTabStrip(event.clientX);
        updateDragTargetFromPointer(event.clientX);
        applyDragClasses();
    });
    dom.tabStrip.addEventListener("drop", (event) => {
        if (!dragTabId)
            return;
        event.preventDefault();
        updateDragTargetFromPointer(event.clientX);
        reorderDraggedTab();
        clearDragState();
        clearDragClasses();
    });
    dom.tabStrip.addEventListener("dragend", () => {
        clearDragState();
        clearDragClasses();
    });
    dom.tabStrip.addEventListener("click", (event) => {
        const target = event.target;
        if (!target)
            return;
        const actionEl = target.closest("[data-action]");
        if (!actionEl)
            return;
        const tabId = actionEl.dataset.tabId;
        if (!tabId)
            return;
        if (actionEl.dataset.action === "close") {
            void closeTab(tabId);
            event.preventDefault();
            event.stopPropagation();
            return;
        }
        if (actionEl.dataset.action === "select") {
            activateTab(tabId);
            refocusEditor();
        }
    });
    dom.tabStrip.addEventListener("dblclick", (event) => {
        const target = event.target;
        const selectEl = target === null || target === void 0 ? void 0 : target.closest('[data-action="select"]');
        const tabId = selectEl === null || selectEl === void 0 ? void 0 : selectEl.dataset.tabId;
        if (!tabId)
            return;
        activateTab(tabId);
        beginRename(tabId);
        event.preventDefault();
    });
    dom.tabStrip.addEventListener("keydown", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement))
            return;
        if (target.dataset.action !== "rename-input")
            return;
        const tabId = target.dataset.tabId;
        if (!tabId)
            return;
        if (event.key === "Enter") {
            event.preventDefault();
            applyRename(tabId, target.value);
            refocusEditor();
            return;
        }
        if (event.key === "Escape") {
            event.preventDefault();
            cancelRename();
            refocusEditor();
        }
    });
    dom.tabStrip.addEventListener("blur", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement))
            return;
        if (target.dataset.action !== "rename-input")
            return;
        if (renameTarget !== "tab")
            return;
        const tabId = target.dataset.tabId;
        if (!tabId || renamingTabId !== tabId)
            return;
        applyRename(tabId, target.value);
    }, true);
    syncEditorToActiveTab();
    void persistWorkspaceState(snapshotState());
    return {
        createNewTab,
        renameActiveTab: (target = "tab") => beginRename(activeId, target),
        closeActiveTab,
        activateNextTab: () => activateByOffset(1),
        activatePreviousTab: () => activateByOffset(-1),
        openFileAsTab,
        importFiles,
        applyRuntimeWorkspace,
        replaceActiveTab,
        updateActiveContent,
        setActiveDirty,
        markActiveSaved,
        markAllSaved,
        getActiveFilename: () => { var _a; return ((_a = getActiveTab()) === null || _a === void 0 ? void 0 : _a.name) || "untitled.py"; },
        getActiveContent: () => { var _a; return ((_a = getActiveTab()) === null || _a === void 0 ? void 0 : _a.content) || ""; },
        getActiveFile: () => getActiveTab(),
        getAllFiles: () => tabs.map((tab) => ({ ...tab })),
        hasDirtyTabs
    };
}
