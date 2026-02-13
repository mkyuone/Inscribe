// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2023-2026 Mark Yu
import { LS_KEYS } from "../constants.js";
import { debounce } from "../utils/dom.js";
import { safeLS } from "../utils/storage.js";
function createId() {
    return `tab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
function parseStoredState(raw) {
    if (!raw)
        return null;
    try {
        const parsed = JSON.parse(raw);
        if (parsed.version !== 1 || !Array.isArray(parsed.tabs))
            return null;
        const tabs = parsed.tabs
            .filter((tab) => !!tab &&
            typeof tab.id === "string" &&
            typeof tab.name === "string" &&
            typeof tab.content === "string" &&
            typeof tab.savedContent === "string" &&
            typeof tab.dirty === "boolean")
            .map((tab) => ({
            id: tab.id,
            name: sanitizeFilename(tab.name),
            content: tab.content,
            savedContent: tab.savedContent,
            dirty: tab.dirty
        }));
        if (!tabs.length || typeof parsed.activeId !== "string")
            return null;
        return {
            version: 1,
            activeId: parsed.activeId,
            tabs
        };
    }
    catch {
        return null;
    }
}
function sanitizeFilename(name) {
    const trimmed = name.trim();
    return trimmed || "untitled.py";
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
function ensureUniqueFilename(name, docs, excludeId) {
    const nextName = sanitizeFilename(name);
    const existing = new Set(docs.filter((doc) => doc.id !== excludeId).map((doc) => doc.name.toLowerCase()));
    if (!existing.has(nextName.toLowerCase()))
        return nextName;
    const { base, ext } = splitBaseAndExt(nextName);
    for (let i = 2; i < 5000; i += 1) {
        const candidate = `${base}-${i}${ext}`;
        if (!existing.has(candidate.toLowerCase()))
            return candidate;
    }
    return `${base}-${Date.now()}${ext}`;
}
export function createTabsController(opts) {
    const { dom, initialContent, legacyFilename, legacyDraft, setEditorDocument, refocusEditor, onActiveFilenameChange, onAnyDirtyChange, onNotify } = opts;
    const stored = parseStoredState(safeLS.get(LS_KEYS.TABS));
    let tabs = [];
    let activeId = "";
    if (stored) {
        tabs = stored.tabs.map((tab) => ({
            id: tab.id,
            name: sanitizeFilename(tab.name),
            content: tab.content,
            savedContent: tab.savedContent,
            dirty: !!tab.dirty
        }));
        activeId = tabs.some((tab) => tab.id === stored.activeId) ? stored.activeId : tabs[0].id;
    }
    else {
        const startingName = sanitizeFilename(legacyFilename || "untitled.py");
        const startingContent = legacyDraft && legacyDraft.trim().length ? legacyDraft : initialContent;
        tabs = [
            {
                id: createId(),
                name: startingName,
                content: startingContent,
                savedContent: startingContent,
                dirty: false
            }
        ];
        activeId = tabs[0].id;
    }
    let renamingTabId = null;
    function getActiveTab() {
        var _a;
        return (_a = tabs.find((tab) => tab.id === activeId)) !== null && _a !== void 0 ? _a : tabs[0];
    }
    function hasDirtyTabs() {
        return tabs.some((tab) => tab.dirty);
    }
    const persistDebounced = debounce(() => {
        const payload = {
            version: 1,
            activeId,
            tabs
        };
        safeLS.set(LS_KEYS.TABS, JSON.stringify(payload));
        const active = getActiveTab();
        if (active) {
            safeLS.set(LS_KEYS.FILENAME, active.name);
            safeLS.set(LS_KEYS.DRAFT, active.content);
        }
    }, 160);
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
            if (tab.id === renamingTabId) {
                const renameInput = document.createElement("input");
                renameInput.type = "text";
                renameInput.className = "tabRenameInput";
                renameInput.value = tab.name;
                renameInput.dataset.action = "rename-input";
                renameInput.dataset.tabId = tab.id;
                renameInput.setAttribute("aria-label", "Rename file tab");
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
                const nameEl = document.createElement("span");
                nameEl.className = "tabName";
                nameEl.textContent = tab.name;
                const dirtyDot = document.createElement("span");
                dirtyDot.className = `tabDirtyDot${tab.dirty ? "" : " hidden"}`;
                dirtyDot.setAttribute("aria-hidden", "true");
                selectBtn.append(nameEl, dirtyDot);
                item.appendChild(selectBtn);
            }
            const closeBtn = document.createElement("button");
            closeBtn.type = "button";
            closeBtn.className = "tabClose";
            closeBtn.dataset.action = "close";
            closeBtn.dataset.tabId = tab.id;
            closeBtn.title = tabs.length === 1 ? "At least one tab is required" : `Close ${tab.name}`;
            closeBtn.disabled = tabs.length === 1 || tab.id === renamingTabId;
            closeBtn.setAttribute("aria-label", `Close ${tab.name}`);
            closeBtn.innerHTML = '<span class="material-icons" aria-hidden="true">close</span>';
            item.appendChild(closeBtn);
            dom.tabStrip.appendChild(item);
        }
        dom.tabStrip.appendChild(addBtn);
        scrollActiveTabIntoView();
        if (renamingTabId) {
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
        setEditorDocument(active.content, active.savedContent);
        onActiveFilenameChange(active.name);
        onAnyDirtyChange(hasDirtyTabs());
        renderTabs();
    }
    function activateTab(id) {
        if (!tabs.some((tab) => tab.id === id))
            return;
        renamingTabId = null;
        activeId = id;
        syncEditorToActiveTab();
    }
    function closeTab(id) {
        if (tabs.length === 1)
            return;
        const toClose = tabs.find((tab) => tab.id === id);
        if (!toClose)
            return;
        if (toClose.dirty) {
            const proceed = window.confirm(`Close ${toClose.name}?\n\nThis tab has unsaved changes that will be lost.`);
            if (!proceed)
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
            onAnyDirtyChange(hasDirtyTabs());
        }
        persistDebounced();
    }
    function createNewTab() {
        renamingTabId = null;
        const name = ensureUniqueFilename("untitled.py", tabs);
        const newTab = {
            id: createId(),
            name,
            content: "",
            savedContent: "",
            dirty: false
        };
        tabs.push(newTab);
        activeId = newTab.id;
        syncEditorToActiveTab();
        persistDebounced();
        onNotify("New file created", name, "note_add");
        refocusEditor();
    }
    function openFileAsTab(name, content) {
        renamingTabId = null;
        const uniqueName = ensureUniqueFilename(name, tabs);
        const doc = {
            id: createId(),
            name: uniqueName,
            content,
            savedContent: content,
            dirty: false
        };
        tabs.push(doc);
        activeId = doc.id;
        syncEditorToActiveTab();
        persistDebounced();
    }
    function replaceActiveTab(name, content) {
        renamingTabId = null;
        const active = getActiveTab();
        if (!active)
            return;
        active.name = ensureUniqueFilename(name, tabs, active.id);
        active.content = content;
        active.savedContent = content;
        active.dirty = false;
        syncEditorToActiveTab();
        persistDebounced();
    }
    function updateActiveContent(content) {
        const active = getActiveTab();
        if (!active)
            return;
        const wasDirty = active.dirty;
        active.content = content;
        active.dirty = content !== active.savedContent;
        if (wasDirty !== active.dirty) {
            renderTabs();
            onAnyDirtyChange(hasDirtyTabs());
        }
        persistDebounced();
    }
    function setActiveDirty(dirty) {
        const active = getActiveTab();
        if (!active)
            return;
        if (active.dirty === dirty) {
            onAnyDirtyChange(hasDirtyTabs());
            return;
        }
        active.dirty = dirty;
        renderTabs();
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
            renderTabs();
            return;
        }
        const unique = ensureUniqueFilename(trimmed, tabs, tabId);
        tab.name = unique;
        renamingTabId = null;
        if (tab.id === activeId) {
            onActiveFilenameChange(tab.name);
        }
        renderTabs();
        persistDebounced();
    }
    function beginRename(tabId = activeId) {
        if (!tabs.some((tab) => tab.id === tabId))
            return;
        renamingTabId = tabId;
        renderTabs();
    }
    function cancelRename() {
        if (!renamingTabId)
            return;
        renamingTabId = null;
        renderTabs();
    }
    function closeActiveTab() {
        closeTab(activeId);
        refocusEditor();
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
            closeTab(tabId);
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
        if (!target)
            return;
        const nameEl = target.closest(".tabName");
        if (!nameEl)
            return;
        const selectEl = nameEl.closest('[data-action="select"]');
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
        const tabId = target.dataset.tabId;
        if (!tabId)
            return;
        if (renamingTabId !== tabId)
            return;
        applyRename(tabId, target.value);
    }, true);
    syncEditorToActiveTab();
    persistDebounced();
    return {
        createNewTab,
        renameActiveTab: () => beginRename(activeId),
        closeActiveTab,
        activateNextTab: () => activateByOffset(1),
        activatePreviousTab: () => activateByOffset(-1),
        openFileAsTab,
        replaceActiveTab,
        updateActiveContent,
        setActiveDirty,
        markActiveSaved,
        getActiveFilename: () => { var _a; return ((_a = getActiveTab()) === null || _a === void 0 ? void 0 : _a.name) || "untitled.py"; },
        getActiveContent: () => { var _a; return ((_a = getActiveTab()) === null || _a === void 0 ? void 0 : _a.content) || ""; },
        hasDirtyTabs
    };
}
