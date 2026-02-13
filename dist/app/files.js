// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2023-2026 Mark Yu
export function createFileController(dom, opts) {
    const { onOpenFileText, getActiveFilename, getActiveContent, onSaved, onNotify, refocusEditor } = opts;
    function openFile() {
        dom.openBtn.blur();
        dom.fileInput.value = "";
        dom.fileInput.click();
    }
    dom.fileInput.addEventListener("change", (e) => {
        var _a;
        const file = (_a = e.target.files) === null || _a === void 0 ? void 0 : _a[0];
        if (!file) {
            onNotify("Open cancelled", "No file selected.", "info");
            refocusEditor();
            return;
        }
        const reader = new FileReader();
        reader.onload = (ev) => {
            var _a;
            onOpenFileText(file.name, String((_a = ev.target.result) !== null && _a !== void 0 ? _a : ""));
            onNotify("File opened", file.name, "folder_open");
            refocusEditor();
        };
        reader.readAsText(file);
    });
    function saveFile() {
        dom.saveBtn.blur();
        const filename = getActiveFilename() || "script.py";
        const code = getActiveContent();
        const blob = new Blob([code], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        onSaved(filename);
        onNotify("File saved", a.download, "save");
        refocusEditor();
    }
    return {
        openFile,
        saveFile
    };
}
