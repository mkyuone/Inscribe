// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2023-2026 Mark Yu
import { DEFAULT_PREFS, LS_KEYS } from "../constants.js";
import { safeLS } from "../utils/storage.js";
export function loadPrefs() {
    try {
        const raw = safeLS.get(LS_KEYS.PREFS);
        if (!raw)
            return { ...DEFAULT_PREFS };
        return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
    }
    catch {
        return { ...DEFAULT_PREFS };
    }
}
export function savePrefs(prefs) {
    try {
        safeLS.set(LS_KEYS.PREFS, JSON.stringify(prefs));
    }
    catch {
        // ignore
    }
}
export function applyPrefs(prefs, editor, dom) {
    const themeMedia = window.matchMedia("(prefers-color-scheme: dark)");
    const resolvedTheme = prefs.theme === "system" ? (themeMedia.matches ? "dark" : "light") : prefs.theme;
    document.documentElement.dataset.theme = resolvedTheme;
    editor.setOption("theme", resolvedTheme === "dark" ? "inscribe-dark" : "eclipse");
    dom.dynamicStyles.textContent = `
    .CodeMirror{ font-size:${prefs.editorFontSize}px; }
    #console{ font-size:${prefs.consoleFontSize}px; }
  `;
    editor.setOption("lineWrapping", !!prefs.lineWrap);
    editor.refresh();
    dom.splitPane.classList.toggle("horizontal", !!prefs.splitHorizontal);
    dom.resizer.setAttribute("aria-orientation", prefs.splitHorizontal ? "vertical" : "horizontal");
    if (prefs.splitHorizontal) {
        dom.editorPane.style.height = "";
    }
    else {
        dom.editorPane.style.width = "";
    }
    dom.editorSizeRange.value = String(prefs.editorFontSize);
    dom.consoleSizeRange.value = String(prefs.consoleFontSize);
    dom.editorSizeLabel.textContent = `${prefs.editorFontSize.toFixed(2)}px`;
    dom.consoleSizeLabel.textContent = `${prefs.consoleFontSize.toFixed(2)}px`;
    dom.wrapToggle.checked = !!prefs.lineWrap;
    dom.splitToggle.checked = !!prefs.splitHorizontal;
    dom.execTimeToggle.checked = !!prefs.showExecTime;
    dom.themeAuto.checked = prefs.theme === "system";
    dom.themeLight.checked = prefs.theme === "light";
    dom.themeDark.checked = prefs.theme === "dark";
    dom.themeGroup.dataset.choice = prefs.theme;
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) {
        themeColor.setAttribute("content", resolvedTheme === "dark" ? "#0b0f1a" : "#2563eb");
    }
}
export function bindPrefsUI(prefs, editor, dom, onChange) {
    var _a, _b;
    dom.editorSizeRange.addEventListener("input", () => {
        prefs.editorFontSize = parseFloat(dom.editorSizeRange.value);
        savePrefs(prefs);
        applyPrefs(prefs, editor, dom);
        onChange === null || onChange === void 0 ? void 0 : onChange();
    });
    dom.consoleSizeRange.addEventListener("input", () => {
        prefs.consoleFontSize = parseFloat(dom.consoleSizeRange.value);
        savePrefs(prefs);
        applyPrefs(prefs, editor, dom);
        onChange === null || onChange === void 0 ? void 0 : onChange();
    });
    dom.wrapToggle.addEventListener("change", () => {
        prefs.lineWrap = !!dom.wrapToggle.checked;
        savePrefs(prefs);
        applyPrefs(prefs, editor, dom);
        onChange === null || onChange === void 0 ? void 0 : onChange();
    });
    dom.splitToggle.addEventListener("change", () => {
        prefs.splitHorizontal = !!dom.splitToggle.checked;
        savePrefs(prefs);
        applyPrefs(prefs, editor, dom);
        onChange === null || onChange === void 0 ? void 0 : onChange();
    });
    dom.execTimeToggle.addEventListener("change", () => {
        prefs.showExecTime = !!dom.execTimeToggle.checked;
        savePrefs(prefs);
        applyPrefs(prefs, editor, dom);
        onChange === null || onChange === void 0 ? void 0 : onChange();
    });
    const applyThemeChoice = (next) => {
        prefs.theme = next;
        savePrefs(prefs);
        applyPrefs(prefs, editor, dom);
        onChange === null || onChange === void 0 ? void 0 : onChange();
    };
    const handleThemeToggle = (next) => {
        applyThemeChoice(next);
    };
    dom.themeAuto.addEventListener("change", () => handleThemeToggle("system"));
    dom.themeLight.addEventListener("change", () => handleThemeToggle("light"));
    dom.themeDark.addEventListener("change", () => handleThemeToggle("dark"));
    const themeMedia = window.matchMedia("(prefers-color-scheme: dark)");
    const onThemeMedia = () => {
        if (prefs.theme !== "system")
            return;
        applyPrefs(prefs, editor, dom);
        onChange === null || onChange === void 0 ? void 0 : onChange();
    };
    if (typeof themeMedia.addEventListener === "function") {
        themeMedia.addEventListener("change", onThemeMedia);
    }
    else {
        (_b = (_a = themeMedia).addListener) === null || _b === void 0 ? void 0 : _b.call(_a, onThemeMedia);
    }
}
export function resetPrefs(prefs, editor, dom) {
    Object.assign(prefs, DEFAULT_PREFS);
    savePrefs(prefs);
    applyPrefs(prefs, editor, dom);
}
