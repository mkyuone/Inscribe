// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2023-2026 Mark Yu

import { DEFAULT_PREFS, LS_KEYS } from "../constants.js";
import { safeLS } from "../utils/storage.js";
import { Prefs } from "./types.js";
import { DomRefs } from "./dom-refs.js";

export function loadPrefs(): Prefs {
  try {
    const raw = safeLS.get(LS_KEYS.PREFS);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<Prefs> & {
      workspaceFeatureEnabled?: boolean;
      showWorkspaceSidebar?: boolean;
    };
    const legacyWorkspaceVisible =
      typeof parsed.showWorkspaceSidebar === "boolean" ? parsed.showWorkspaceSidebar : undefined;

    return {
      ...DEFAULT_PREFS,
      ...parsed,
      workspaceFeatureEnabled:
        typeof parsed.workspaceFeatureEnabled === "boolean"
          ? parsed.workspaceFeatureEnabled
          : legacyWorkspaceVisible ?? DEFAULT_PREFS.workspaceFeatureEnabled,
      showWorkspaceSidebar:
        typeof parsed.showWorkspaceSidebar === "boolean"
          ? parsed.showWorkspaceSidebar
          : typeof parsed.workspaceFeatureEnabled === "boolean"
            ? parsed.workspaceFeatureEnabled
            : DEFAULT_PREFS.showWorkspaceSidebar
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(prefs: Prefs) {
  try {
    safeLS.set(LS_KEYS.PREFS, JSON.stringify(prefs));
  } catch {
    // ignore
  }
}

export function applyPrefs(prefs: Prefs, editor: CodeMirrorEditor, dom: DomRefs) {
  const themeMedia = window.matchMedia("(prefers-color-scheme: dark)");
  const resolvedTheme =
    prefs.theme === "system" ? (themeMedia.matches ? "dark" : "light") : prefs.theme;
  const workspaceFeatureEnabled = !!prefs.workspaceFeatureEnabled;
  const workspaceVisible = workspaceFeatureEnabled && !!prefs.showWorkspaceSidebar;
  document.documentElement.dataset.theme = resolvedTheme;
  document.documentElement.dataset.workspaceFeature = workspaceFeatureEnabled ? "on" : "off";
  document.documentElement.dataset.workspaceSidebar = workspaceVisible ? "on" : "off";
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
  } else {
    dom.editorPane.style.width = "";
  }

  dom.editorSizeRange.value = String(prefs.editorFontSize);
  dom.consoleSizeRange.value = String(prefs.consoleFontSize);
  dom.editorSizeLabel.textContent = `${prefs.editorFontSize.toFixed(2)}px`;
  dom.consoleSizeLabel.textContent = `${prefs.consoleFontSize.toFixed(2)}px`;
  dom.wrapToggle.checked = !!prefs.lineWrap;
  dom.activeLineToggle.checked = !!prefs.highlightActiveLine;
  dom.splitToggle.checked = !!prefs.splitHorizontal;
  dom.workspaceFeatureToggle.checked = workspaceFeatureEnabled;
  dom.execTimeToggle.checked = !!prefs.showExecTime;
  dom.themeAuto.checked = prefs.theme === "system";
  dom.themeLight.checked = prefs.theme === "light";
  dom.themeDark.checked = prefs.theme === "dark";
  dom.themeGroup.dataset.choice = prefs.theme;
  dom.workspacePane.hidden = !workspaceVisible;
  dom.workspaceResizer.hidden = !workspaceVisible;
  dom.workspaceToggleBtn.hidden = !workspaceFeatureEnabled;
  dom.workspaceToggleBtn.setAttribute("aria-pressed", workspaceVisible ? "true" : "false");
  dom.workspaceToggleBtn.classList.toggle("active", workspaceVisible);
  dom.workspaceToggleBtn.title = workspaceVisible ? "Hide workspace sidebar" : "Show workspace sidebar";
  dom.workspaceToggleBtn.setAttribute(
    "aria-label",
    workspaceVisible ? "Hide workspace sidebar" : "Show workspace sidebar"
  );
  const workspaceToggleIcon = dom.workspaceToggleBtn.querySelector(".material-icons");
  if (workspaceToggleIcon) {
    workspaceToggleIcon.textContent = workspaceVisible ? "chevron_left" : "chevron_right";
  }
  dom.openBtn.title = workspaceFeatureEnabled
    ? "Import files or project (Cmd/Ctrl + O)"
    : "Open file (Cmd/Ctrl + O)";
  dom.openBtn.setAttribute(
    "aria-label",
    workspaceFeatureEnabled ? "Import files or project" : "Open file"
  );
  dom.saveBtn.title = workspaceFeatureEnabled
    ? "Save project (.inscribeproj, Cmd/Ctrl + S)"
    : "Save file (Cmd/Ctrl + S)";
  dom.saveBtn.setAttribute("aria-label", workspaceFeatureEnabled ? "Save project" : "Save file");

  const stackedWorkspace = getComputedStyle(dom.workspaceLayout).flexDirection === "column";
  if (stackedWorkspace) {
    dom.workspacePane.style.width = "";
  } else {
    dom.workspacePane.style.height = "";
  }

  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) {
    themeColor.setAttribute("content", resolvedTheme === "dark" ? "#0b0f1a" : "#2563eb");
  }

  document.documentElement.dataset.activeLine = prefs.highlightActiveLine ? "on" : "off";
  requestAnimationFrame(() => editor.refresh());
}

export function bindPrefsUI(
  prefs: Prefs,
  editor: CodeMirrorEditor,
  dom: DomRefs,
  onChange?: () => void
) {
  dom.editorSizeRange.addEventListener("input", () => {
    prefs.editorFontSize = parseFloat(dom.editorSizeRange.value);
    savePrefs(prefs);
    applyPrefs(prefs, editor, dom);
    onChange?.();
  });
  dom.consoleSizeRange.addEventListener("input", () => {
    prefs.consoleFontSize = parseFloat(dom.consoleSizeRange.value);
    savePrefs(prefs);
    applyPrefs(prefs, editor, dom);
    onChange?.();
  });
  dom.wrapToggle.addEventListener("change", () => {
    prefs.lineWrap = !!dom.wrapToggle.checked;
    savePrefs(prefs);
    applyPrefs(prefs, editor, dom);
    onChange?.();
  });
  dom.activeLineToggle.addEventListener("change", () => {
    prefs.highlightActiveLine = !!dom.activeLineToggle.checked;
    savePrefs(prefs);
    applyPrefs(prefs, editor, dom);
    onChange?.();
  });
  dom.splitToggle.addEventListener("change", () => {
    prefs.splitHorizontal = !!dom.splitToggle.checked;
    savePrefs(prefs);
    applyPrefs(prefs, editor, dom);
    onChange?.();
  });
  dom.workspaceFeatureToggle.addEventListener("change", () => {
    const nextEnabled = !!dom.workspaceFeatureToggle.checked;
    if (nextEnabled && !prefs.workspaceFeatureEnabled) {
      window.alert("Workspace projects are still under development.");
    }
    prefs.workspaceFeatureEnabled = nextEnabled;
    prefs.showWorkspaceSidebar = prefs.workspaceFeatureEnabled;
    savePrefs(prefs);
    applyPrefs(prefs, editor, dom);
    onChange?.();
  });
  dom.execTimeToggle.addEventListener("change", () => {
    prefs.showExecTime = !!dom.execTimeToggle.checked;
    savePrefs(prefs);
    applyPrefs(prefs, editor, dom);
    onChange?.();
  });
  const applyThemeChoice = (next: Prefs["theme"]) => {
    prefs.theme = next;
    savePrefs(prefs);
    applyPrefs(prefs, editor, dom);
    onChange?.();
  };
  const handleThemeToggle = (next: Prefs["theme"]) => {
    applyThemeChoice(next);
  };
  dom.themeAuto.addEventListener("change", () => handleThemeToggle("system"));
  dom.themeLight.addEventListener("change", () => handleThemeToggle("light"));
  dom.themeDark.addEventListener("change", () => handleThemeToggle("dark"));

  const themeMedia = window.matchMedia("(prefers-color-scheme: dark)");
  const onThemeMedia = () => {
    if (prefs.theme !== "system") return;
    applyPrefs(prefs, editor, dom);
    onChange?.();
  };
  if (typeof themeMedia.addEventListener === "function") {
    themeMedia.addEventListener("change", onThemeMedia);
  } else {
    (
      themeMedia as MediaQueryList & {
        addListener?: (listener: (e: MediaQueryListEvent) => void) => void;
      }
    ).addListener?.(onThemeMedia);
  }
}

export function resetPrefs(prefs: Prefs, editor: CodeMirrorEditor, dom: DomRefs) {
  Object.assign(prefs, DEFAULT_PREFS);
  savePrefs(prefs);
  applyPrefs(prefs, editor, dom);
}
