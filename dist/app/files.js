// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2023-2026 Mark Yu
export function createFileController(dom, editor, onFilenameChange, onSaved, onConsoleLine, refocusEditor) {
    let currentFilename = "untitled.py";
    function setFilename(name) {
        currentFilename = name || "untitled.py";
        onFilenameChange(currentFilename);
    }
    function openFile() {
        dom.openBtn.blur();
        dom.fileInput.value = "";
        dom.fileInput.click();
    }
    dom.fileInput.addEventListener("change", (e) => {
        var _a;
        const file = (_a = e.target.files) === null || _a === void 0 ? void 0 : _a[0];
        if (!file) {
            onConsoleLine("Open cancelled.", { dim: true, system: true });
            refocusEditor();
            return;
        }
        const reader = new FileReader();
        reader.onload = (ev) => {
            var _a;
            editor.setValue(String((_a = ev.target.result) !== null && _a !== void 0 ? _a : ""));
            setFilename(file.name);
            onSaved();
            onConsoleLine(`Loaded: ${file.name}`, { dim: true, system: true });
            refocusEditor();
        };
        reader.readAsText(file);
    });
    function saveFile() {
        dom.saveBtn.blur();
        const code = editor.getValue();
        const blob = new Blob([code], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = currentFilename || "script.py";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        onSaved();
        onConsoleLine(`Saved: ${a.download}`, { dim: true, system: true });
        refocusEditor();
    }
    return {
        openFile,
        saveFile,
        setFilename,
        getFilename: () => currentFilename
    };
}
