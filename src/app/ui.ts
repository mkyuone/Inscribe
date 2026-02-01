import { escapeHtml } from "../utils/dom.js";
import { isMac } from "../utils/platform.js";
import { DomRefs } from "./dom-refs.js";

export type UiController = {
  openAbout: () => void;
  closeAbout: () => void;
  openSettings: () => void;
  closeSettings: () => void;
  openPrint: () => void;
  closePrint: () => void;
  openShareWarn: () => void;
  closeShareWarn: () => void;
  closeAnyModal: () => void;
  openMenu: () => void;
  closeMenu: () => void;
  toggleMenu: () => void;
  openRunMenu: () => void;
  closeRunMenu: () => void;
  toggleRunMenu: () => void;
  setHints: () => void;
  bindGlobalShortcuts: () => void;
  bindMenuDismiss: () => void;
  bindModalDismiss: () => void;
  bindResizer: () => void;
};

export function createRefocusEditor(dom: DomRefs, editor: CodeMirrorEditor) {
  return () => {
    [dom.openBtn, dom.saveBtn, dom.shareBtn, dom.moreBtn, dom.runModeBtn].forEach((b) =>
      b && b.blur()
    );
    requestAnimationFrame(() => editor.focus());
  };
}

export function createUiController(
  dom: DomRefs,
  editor: CodeMirrorEditor,
  refocusEditor: () => void,
  onRunDefault: () => void,
  onRunCell: () => void,
  onSaveFile: () => void,
  onOpenFile: () => void,
  onOpenPrintModal: () => void,
  onOpenSettings: () => void
): UiController {
  function openAbout() {
    dom.aboutOverlay.classList.add("active");
  }
  function closeAbout() {
    dom.aboutOverlay.classList.remove("active");
  }
  function openSettings() {
    dom.settingsOverlay.classList.add("active");
  }
  function closeSettings() {
    dom.settingsOverlay.classList.remove("active");
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
    closeSettings();
    closePrint();
    closeShareWarn();
  }

  function openMenu() {
    closeRunMenu();
    dom.moreMenu.classList.add("active");
    dom.moreBtn.setAttribute("aria-expanded", "true");
  }
  function closeMenu() {
    dom.moreMenu.classList.remove("active");
    dom.moreBtn.setAttribute("aria-expanded", "false");
    dom.moreBtn.blur();
  }
  function toggleMenu() {
    if (dom.moreMenu.classList.contains("active")) closeMenu();
    else openMenu();
  }

  function openRunMenu() {
    closeMenu();
    dom.runMenu.classList.add("active");
    dom.runModeBtn.setAttribute("aria-expanded", "true");
  }
  function closeRunMenu() {
    dom.runMenu.classList.remove("active");
    dom.runModeBtn.setAttribute("aria-expanded", "false");
    dom.runModeBtn.blur();
  }
  function toggleRunMenu() {
    if (dom.runMenu.classList.contains("active")) closeRunMenu();
    else openRunMenu();
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
      { keys: [mod, "P"], desc: "Print / Export" },
      { keys: [mod, ","], desc: "Open Settings" },
      { keys: ["Esc"], desc: "Close modals / menus" }
    ];

    dom.shortcutBody.innerHTML = shortcuts
      .map((s) => {
        const keyHtml = s.keys.map((k) => `<kbd>${escapeHtml(k)}</kbd>`).join("");
        return `<tr><td class="sKeys">${keyHtml}</td><td class="sDesc">${escapeHtml(
          s.desc
        )}</td></tr>`;
      })
      .join("");
  }

  function isModKey(e: KeyboardEvent) {
    return e.metaKey || e.ctrlKey;
  }

  function bindGlobalShortcuts() {
    window.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Escape") {
          closeAnyModal();
          closeMenu();
          closeRunMenu();
          refocusEditor();
          return;
        }

        if (!isModKey(e)) return;

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
      },
      { passive: false }
    );
  }

  function bindMenuDismiss() {
    document.addEventListener("click", (e) => {
      const target = e.target as Node;
      const withinMore = dom.moreMenu.contains(target) || dom.moreBtn.contains(target);
      if (!withinMore) closeMenu();

      const withinRun = dom.runMenu.contains(target) || dom.runModeBtn.contains(target);
      if (!withinRun) closeRunMenu();
    });
  }

  function bindModalDismiss() {
    dom.aboutOverlay.addEventListener("click", (e) => {
      if (e.target === dom.aboutOverlay) closeAbout();
    });
    dom.settingsOverlay.addEventListener("click", (e) => {
      if (e.target === dom.settingsOverlay) closeSettings();
    });
    dom.printOverlay.addEventListener("click", (e) => {
      if (e.target === dom.printOverlay) closePrint();
    });
    dom.shareWarnOverlay.addEventListener("click", (e) => {
      if (e.target === dom.shareWarnOverlay) closeShareWarn();
    });
  }

  function bindResizer() {
    let dragging = false;
    let startY = 0;
    let startHeight = 0;

    dom.resizer.addEventListener("mousedown", (e) => {
      dragging = true;
      startY = e.clientY;
      startHeight = dom.editorPane.offsetHeight;
      e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
      if (!dragging) return;

      const dy = e.clientY - startY;
      const split = document.querySelector(".split") as HTMLElement | null;
      if (!split) return;
      const total = split.clientHeight;
      const min = 150;
      const max = total - 150;

      let next = startHeight + dy;
      if (next < min) next = min;
      if (next > max) next = max;

      dom.editorPane.style.height = `${next}px`;
      editor.refresh();
    });

    document.addEventListener("mouseup", () => {
      dragging = false;
    });
  }

  return {
    openAbout,
    closeAbout,
    openSettings,
    closeSettings,
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
    setHints,
    bindGlobalShortcuts,
    bindMenuDismiss,
    bindModalDismiss,
    bindResizer
  };
}
