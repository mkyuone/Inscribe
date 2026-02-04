import { escapeHtml } from "../utils/dom.js";
function formatType(item) {
    if (typeof item.size === "number") {
        return `${item.type} (${item.size})`;
    }
    return item.type;
}
export function createVariablesController(dom) {
    let isOpen = false;
    const setOpen = (next) => {
        isOpen = next;
        dom.varsPane.classList.toggle("collapsed", !isOpen);
        dom.varsToggleBtn.setAttribute("aria-pressed", String(isOpen));
        dom.varsToggleBtn.classList.toggle("active", isOpen);
    };
    const renderEmpty = (message) => {
        dom.varsList.innerHTML = `<div class="varsEmpty">${escapeHtml(message)}</div>`;
        dom.varsMeta.textContent = "0";
    };
    const setVariables = (items, truncated = false) => {
        if (!items.length) {
            renderEmpty("No variables yet.");
            return;
        }
        dom.varsMeta.textContent = truncated ? `${items.length}+` : `${items.length}`;
        dom.varsList.innerHTML = items
            .map((item) => `<div class="varsRow">
        <span class="varsName">${escapeHtml(item.name)}</span>
        <span class="varsType">${escapeHtml(formatType(item))}</span>
        <span class="varsValue">${escapeHtml(item.repr)}</span>
      </div>`)
            .join("");
    };
    const clear = () => {
        renderEmpty("Run code to see variables.");
    };
    const toggle = () => {
        setOpen(!isOpen);
    };
    clear();
    setOpen(isOpen);
    return { setVariables, clear, toggle };
}
