// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2023-2026 Mark Yu
import { escapeHtml } from "../utils/dom.js";
export function createPrintController(dom, getCode, collectConsoleOutput, closeMenu, openPrint, closePrint) {
    function getTimestamp() {
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        const hh = String(d.getHours()).padStart(2, "0");
        const mm = String(d.getMinutes()).padStart(2, "0");
        return `${y}-${m}-${day} ${hh}:${mm}`;
    }
    function buildExportLayout(opts) {
        dom.exportRoot.innerHTML = "";
        const header = document.createElement("div");
        header.className = "exportHeader";
        const headerLines = [];
        if (opts.includeBranding) {
            headerLines.push("Inscribe Editor");
            headerLines.push("py.mkyu.one");
        }
        if (opts.includeTimestamp) {
            headerLines.push(`Printed / Exported: ${getTimestamp()}`);
        }
        headerLines.forEach((line, idx) => {
            const row = document.createElement("div");
            const cls = opts.includeBranding && idx === 0
                ? "exportBrand"
                : opts.includeBranding && idx === 1
                    ? "exportSite"
                    : "";
            row.className = cls;
            row.innerHTML = line ? `<strong>${escapeHtml(line)}</strong>` : "&nbsp;";
            header.appendChild(row);
        });
        if (headerLines.length)
            dom.exportRoot.appendChild(header);
        const code = getCode();
        const output = collectConsoleOutput();
        if (opts.includeCode && code.trim().length) {
            const section = document.createElement("section");
            section.className = "exportSection";
            section.innerHTML = `<div class="exportTitle">Code</div>`;
            const pre = document.createElement("pre");
            pre.className = `exportBlock${opts.wrap ? " wrap" : ""}`;
            if (opts.lineNumbers) {
                const lines = code.replace(/\r\n/g, "\n").split("\n");
                const pad = String(lines.length).length;
                pre.textContent = lines
                    .map((line, idx) => `${String(idx + 1).padStart(pad, " ")} | ${line}`)
                    .join("\n");
            }
            else {
                pre.textContent = code;
            }
            section.appendChild(pre);
            dom.exportRoot.appendChild(section);
        }
        if (opts.includeOutput && output.trim().length) {
            const section = document.createElement("section");
            section.className = "exportSection";
            section.innerHTML = `<div class="exportTitle">Output</div>`;
            const pre = document.createElement("pre");
            pre.className = `exportBlock${opts.wrap ? " wrap" : ""}`;
            pre.textContent = output;
            section.appendChild(pre);
            dom.exportRoot.appendChild(section);
        }
    }
    function updatePrintConfirmState() {
        const codeSelected = dom.printIncludeCode.checked;
        const outputSelected = dom.printIncludeOutput.checked;
        const codeExists = getCode().trim().length > 0;
        const ok = (codeSelected || outputSelected) && codeExists;
        dom.printConfirmBtn.disabled = !ok;
        if (!codeSelected && !outputSelected) {
            dom.printContentNote.textContent = "Select at least one item to print.";
        }
        else if (!codeExists) {
            dom.printContentNote.textContent = "No code detected. Add code to enable export.";
        }
        else {
            dom.printContentNote.textContent = "Ready to print or export.";
        }
    }
    function openPrintModal() {
        closeMenu();
        dom.printIncludeCode.checked = true;
        dom.printIncludeOutput.checked = true;
        dom.printLineNumbers.checked = false;
        dom.printWrapLines.checked = true;
        dom.printBranding.checked = true;
        dom.printTimestamp.checked = true;
        dom.printConfirmBtn.textContent = "Print / Export";
        updatePrintConfirmState();
        openPrint();
    }
    function handlePrintConfirm() {
        const includeCode = dom.printIncludeCode.checked;
        const includeOutput = dom.printIncludeOutput.checked;
        const lineNumbers = dom.printLineNumbers.checked;
        const wrap = dom.printWrapLines.checked;
        const includeBranding = dom.printBranding.checked;
        const includeTimestamp = dom.printTimestamp.checked;
        buildExportLayout({
            includeCode,
            includeOutput,
            lineNumbers,
            wrap,
            includeBranding,
            includeTimestamp
        });
        document.body.classList.add("exporting");
        closePrint();
        const cleanup = () => {
            document.body.classList.remove("exporting");
            window.removeEventListener("afterprint", cleanup);
        };
        window.addEventListener("afterprint", cleanup);
        setTimeout(() => {
            window.print();
        }, 0);
    }
    return { openPrintModal, handlePrintConfirm, updatePrintConfirmState };
}
