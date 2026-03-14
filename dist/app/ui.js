// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2023-2026 Mark Yu
import { escapeHtml } from "../utils/dom.js";
import { isMac } from "../utils/platform.js";
export function createRefocusEditor(dom, editor) {
    return () => {
        [
            dom.openBtn,
            dom.saveBtn,
            dom.shareBtn,
            dom.moreBtn,
            dom.runModeBtn,
            dom.editorActionsBtn,
            dom.varsToggleBtn,
            dom.newTabBtn
        ].forEach((b) => b && b.blur());
        requestAnimationFrame(() => editor.focus());
    };
}
export function createUiController(dom, editor, refocusEditor, onRunDefault, onRunCell, onSaveFile, onOpenFile, onOpenPrintModal, onOpenSettings, onNewTab, onRenameTab, onNextTab, onPreviousTab) {
    function openAbout() {
        dom.aboutOverlay.classList.add("active");
    }
    function closeAbout() {
        dom.aboutOverlay.classList.remove("active");
    }
    function openLicense() {
        dom.licenseOverlay.classList.add("active");
    }
    function closeLicense() {
        dom.licenseOverlay.classList.remove("active");
    }
    function openSettings() {
        closeShortcuts();
        dom.settingsOverlay.classList.add("active");
    }
    function closeSettings() {
        dom.settingsOverlay.classList.remove("active");
    }
    function openShortcuts() {
        closeSettings();
        dom.shortcutsOverlay.classList.add("active");
    }
    function closeShortcuts() {
        dom.shortcutsOverlay.classList.remove("active");
    }
    function openPrint() {
        dom.printOverlay.classList.add("active");
    }
    function closePrint() {
        dom.printOverlay.classList.remove("active");
    }
    function openShareWarn() {
        dom.shareWarnOverlay.classList.add("active");
    }
    function closeShareWarn() {
        dom.shareWarnOverlay.classList.remove("active");
    }
    function closeAnyModal() {
        closeAbout();
        closeLicense();
        closeSettings();
        closeShortcuts();
        closePrint();
        closeShareWarn();
    }
    function openMenu() {
        closeRunMenu();
        closeEditorActions();
        dom.moreMenu.classList.add("active");
        dom.moreBtn.setAttribute("aria-expanded", "true");
    }
    function closeMenu() {
        dom.moreMenu.classList.remove("active");
        dom.moreBtn.setAttribute("aria-expanded", "false");
        dom.moreBtn.blur();
    }
    function toggleMenu() {
        if (dom.moreMenu.classList.contains("active"))
            closeMenu();
        else
            openMenu();
    }
    function openRunMenu() {
        closeMenu();
        closeEditorActions();
        dom.runMenu.classList.add("active");
        dom.runModeBtn.setAttribute("aria-expanded", "true");
    }
    function closeRunMenu() {
        dom.runMenu.classList.remove("active");
        dom.runModeBtn.setAttribute("aria-expanded", "false");
        dom.runModeBtn.blur();
    }
    function toggleRunMenu() {
        if (dom.runMenu.classList.contains("active"))
            closeRunMenu();
        else
            openRunMenu();
    }
    function openEditorActions() {
        closeMenu();
        closeRunMenu();
        dom.editorActionsMenu.classList.add("active");
        dom.editorActionsBtn.setAttribute("aria-expanded", "true");
    }
    function closeEditorActions() {
        dom.editorActionsMenu.classList.remove("active");
        dom.editorActionsBtn.setAttribute("aria-expanded", "false");
        dom.editorActionsBtn.blur();
    }
    function toggleEditorActions() {
        if (dom.editorActionsMenu.classList.contains("active"))
            closeEditorActions();
        else
            openEditorActions();
    }
    function setHints() {
        const mac = isMac();
        const mod = mac ? "⌘" : "Ctrl";
        const enterKey = mac ? "Return" : "Enter";
        dom.hintRun.textContent = `${mod} ${enterKey}`;
        dom.hintOpen.textContent = `${mod} O`;
        dom.hintSave.textContent = `${mod} S`;
        dom.hintSettings.textContent = `${mod} ,`;
        dom.hintPrint.textContent = `${mod} P`;
        const shortcuts = [
            { keys: [mod, enterKey], desc: "Run (uses Run Mode config)" },
            { keys: [mod, "Shift", enterKey], desc: "Run current cell (# %%)" },
            { keys: [mod, "S"], desc: "Save file" },
            { keys: [mod, "O"], desc: "Open file" },
            { keys: [mod, "F"], desc: "Open Find" },
            { keys: [mod, "H"], desc: "Open Replace" },
            { keys: ["F3"], desc: "Next search match" },
            { keys: ["Shift", "F3"], desc: "Previous search match" },
            { keys: ["Enter"], desc: "Next match in Find field" },
            { keys: ["Shift", "Enter"], desc: "Previous match in Find field" },
            { keys: ["Enter"], desc: "Replace current match in Replace field" },
            { keys: ["Shift", "Enter"], desc: "Replace all in Replace field" },
            { keys: [mod, "Alt", "N"], desc: "New tab" },
            { keys: ["F2"], desc: "Rename current tab" },
            { keys: [mod, "Alt", "← / →"], desc: "Previous / next tab" },
            { keys: [mod, "P"], desc: "Print / Export" },
            { keys: [mod, ","], desc: "Open Settings" },
            { keys: ["Esc"], desc: "Close modals, menus, or Find" }
        ];
        dom.shortcutBody.innerHTML = shortcuts
            .map((s) => {
            const keyHtml = s.keys.map((k) => `<kbd>${escapeHtml(k)}</kbd>`).join("");
            return `<tr><td class="sKeys">${keyHtml}</td><td class="sDesc">${escapeHtml(s.desc)}</td></tr>`;
        })
            .join("");
    }
    function isModKey(e) {
        return e.metaKey || e.ctrlKey;
    }
    function bindGlobalShortcuts() {
        window.addEventListener("keydown", (e) => {
            if (e.key === "Escape") {
                closeAnyModal();
                closeMenu();
                closeRunMenu();
                closeEditorActions();
                refocusEditor();
                return;
            }
            if (e.key === "F2") {
                e.preventDefault();
                onRenameTab();
                return;
            }
            if (!isModKey(e))
                return;
            if (e.altKey && e.key.toLowerCase() === "n") {
                e.preventDefault();
                onNewTab();
                return;
            }
            if (e.altKey && e.key === "ArrowRight") {
                e.preventDefault();
                onNextTab();
                return;
            }
            if (e.altKey && e.key === "ArrowLeft") {
                e.preventDefault();
                onPreviousTab();
                return;
            }
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onRunDefault();
                return;
            }
            if (e.key === "Enter" && e.shiftKey) {
                e.preventDefault();
                onRunCell();
                return;
            }
            if (e.key.toLowerCase() === "s") {
                e.preventDefault();
                onSaveFile();
                return;
            }
            if (e.key.toLowerCase() === "o") {
                e.preventDefault();
                onOpenFile();
                return;
            }
            if (e.key.toLowerCase() === "p") {
                e.preventDefault();
                onOpenPrintModal();
                return;
            }
            if (e.key === ",") {
                e.preventDefault();
                onOpenSettings();
                return;
            }
        }, { passive: false });
    }
    function bindMenuDismiss() {
        document.addEventListener("click", (e) => {
            const target = e.target;
            const withinMore = dom.moreMenu.contains(target) || dom.moreBtn.contains(target);
            if (!withinMore)
                closeMenu();
            const withinRun = dom.runMenu.contains(target) || dom.runModeBtn.contains(target);
            if (!withinRun)
                closeRunMenu();
            const withinEditorActions = dom.editorActionsMenu.contains(target) || dom.editorActionsBtn.contains(target);
            if (!withinEditorActions)
                closeEditorActions();
        });
    }
    function bindModalDismiss() {
        dom.aboutOverlay.addEventListener("click", (e) => {
            if (e.target === dom.aboutOverlay)
                closeAbout();
        });
        dom.licenseOverlay.addEventListener("click", (e) => {
            if (e.target === dom.licenseOverlay)
                closeLicense();
        });
        dom.settingsOverlay.addEventListener("click", (e) => {
            if (e.target === dom.settingsOverlay)
                closeSettings();
        });
        dom.shortcutsOverlay.addEventListener("click", (e) => {
            if (e.target === dom.shortcutsOverlay)
                closeShortcuts();
        });
        dom.printOverlay.addEventListener("click", (e) => {
            if (e.target === dom.printOverlay)
                closePrint();
        });
        dom.shareWarnOverlay.addEventListener("click", (e) => {
            if (e.target === dom.shareWarnOverlay)
                closeShareWarn();
        });
    }
    function bindResizer() {
        let dragging = false;
        let startY = 0;
        let startX = 0;
        let startSize = 0;
        dom.resizer.addEventListener("mousedown", (e) => {
            dragging = true;
            startY = e.clientY;
            startX = e.clientX;
            startSize = dom.splitPane.classList.contains("horizontal")
                ? dom.editorPane.offsetWidth
                : dom.editorPane.offsetHeight;
            e.preventDefault();
        });
        document.addEventListener("mousemove", (e) => {
            if (!dragging)
                return;
            const horizontal = dom.splitPane.classList.contains("horizontal");
            const delta = horizontal ? e.clientX - startX : e.clientY - startY;
            const total = horizontal ? dom.splitPane.clientWidth : dom.splitPane.clientHeight;
            const min = horizontal ? 220 : 150;
            const max = total - min;
            let next = startSize + delta;
            if (next < min)
                next = min;
            if (next > max)
                next = max;
            if (horizontal) {
                dom.editorPane.style.width = `${next}px`;
            }
            else {
                dom.editorPane.style.height = `${next}px`;
            }
            editor.refresh();
        });
        document.addEventListener("mouseup", () => {
            dragging = false;
        });
    }
    return {
        openAbout,
        closeAbout,
        openLicense,
        closeLicense,
        openSettings,
        closeSettings,
        openShortcuts,
        closeShortcuts,
        openPrint,
        closePrint,
        openShareWarn,
        closeShareWarn,
        closeAnyModal,
        openMenu,
        closeMenu,
        toggleMenu,
        openRunMenu,
        closeRunMenu,
        toggleRunMenu,
        openEditorActions,
        closeEditorActions,
        toggleEditorActions,
        setHints,
        bindGlobalShortcuts,
        bindMenuDismiss,
        bindModalDismiss,
        bindResizer
    };
}
