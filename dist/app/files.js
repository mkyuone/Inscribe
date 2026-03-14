// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2023-2026 Mark Yu
import { arrayBufferToBase64, base64ToUint8Array, getBasename, guessMimeType, isTextPath, normalizeWorkspacePath, parseWorkspaceBundle } from "./workspace-files.js";
function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
async function readWorkspaceUpload(file) {
    const path = normalizeWorkspacePath(file.webkitRelativePath || file.name);
    const mime = guessMimeType(path, file.type);
    if (isTextPath(path, mime)) {
        return {
            name: path,
            mime,
            encoding: "utf8",
            content: await file.text()
        };
    }
    return {
        name: path,
        mime,
        encoding: "base64",
        content: arrayBufferToBase64(await file.arrayBuffer())
    };
}
export function createFileController(dom, opts) {
    const { isWorkspaceEnabled, importFiles, getAllFiles, getActiveFile, onSaved, onNotify, refocusEditor } = opts;
    let pendingOpenMode = "workspaceFiles";
    const setFilePickerMode = (mode) => {
        pendingOpenMode = mode;
        if (mode === "singleText") {
            dom.fileInput.multiple = false;
            dom.fileInput.accept =
                ".py,.txt,.md,.json,.csv,.tsv,.yaml,.yml,.toml,.ini,.cfg,.log,text/*,application/json,text/csv";
            return;
        }
        dom.fileInput.multiple = true;
        dom.fileInput.accept = "";
    };
    function openFile() {
        dom.openBtn.blur();
        setFilePickerMode(isWorkspaceEnabled() ? "workspaceFiles" : "singleText");
        dom.fileInput.value = "";
        dom.fileInput.click();
    }
    function openWorkspaceFiles() {
        setFilePickerMode("workspaceFiles");
        dom.fileInput.value = "";
        dom.fileInput.click();
    }
    function openFolder() {
        dom.directoryInput.value = "";
        dom.directoryInput.click();
    }
    function confirmWorkspaceReplace() {
        return new Promise((resolve) => {
            dom.projectImportText.textContent =
                "Importing this project file will replace the current workspace.";
            dom.projectImportOverlay.classList.add("active");
            const cleanup = () => {
                dom.projectImportCancelBtn.removeEventListener("click", onCancel);
                dom.projectImportConfirmBtn.removeEventListener("click", onConfirm);
                dom.projectImportOverlay.removeEventListener("click", onBackdrop);
                window.removeEventListener("keydown", onKeyDown, true);
            };
            const close = (result) => {
                dom.projectImportOverlay.classList.remove("active");
                cleanup();
                resolve(result);
            };
            const onCancel = () => close(false);
            const onConfirm = () => close(true);
            const onBackdrop = (event) => {
                if (event.target === dom.projectImportOverlay) {
                    close(false);
                }
            };
            const onKeyDown = (event) => {
                if (event.key === "Escape") {
                    event.preventDefault();
                    close(false);
                }
            };
            dom.projectImportCancelBtn.addEventListener("click", onCancel);
            dom.projectImportConfirmBtn.addEventListener("click", onConfirm);
            dom.projectImportOverlay.addEventListener("click", onBackdrop);
            window.addEventListener("keydown", onKeyDown, true);
        });
    }
    async function handleBundleImport(file) {
        const text = await file.text();
        const bundle = parseWorkspaceBundle(text);
        if (!bundle)
            return false;
        const hasExisting = getAllFiles().length > 0;
        if (hasExisting) {
            const proceed = await confirmWorkspaceReplace();
            if (!proceed)
                return true;
        }
        importFiles(bundle.files.map((entry) => ({
            name: entry.path,
            mime: entry.mime,
            encoding: entry.encoding,
            content: entry.content,
            savedContent: entry.content
        })), { replaceAll: true, activeName: bundle.activePath });
        onNotify("Project imported", `${bundle.files.length} file(s) restored.`, "folder");
        return true;
    }
    async function importSelectedFiles(input, opts) {
        const files = Array.from(input.files || []);
        if (!files.length) {
            onNotify(opts.emptyTitle, "No files selected.", "info");
            refocusEditor();
            return;
        }
        try {
            if (opts.allowBundle &&
                files.length === 1 &&
                (files[0].name.endsWith(".inscribeproj") ||
                    files[0].name.endsWith(".inscribe-workspace.json") ||
                    files[0].type === "application/json")) {
                const importedBundle = await handleBundleImport(files[0]);
                if (importedBundle) {
                    refocusEditor();
                    return;
                }
            }
            const imported = await Promise.all(files.map((file) => readWorkspaceUpload(file)));
            importFiles(imported);
            onNotify(opts.successTitle, `${imported.length} file(s) added to the workspace.`, opts.successIcon);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            onNotify("Import failed", msg || "Could not import files.", "error_outline");
        }
        finally {
            refocusEditor();
        }
    }
    async function importSingleTextFile(input) {
        const file = (input.files || [])[0];
        if (!file) {
            onNotify("Open cancelled", "No file selected.", "info");
            refocusEditor();
            return;
        }
        try {
            const content = await file.text();
            importFiles([
                {
                    name: file.name,
                    mime: guessMimeType(file.name, file.type),
                    encoding: "utf8",
                    content,
                    savedContent: content
                }
            ], { activeName: file.name });
            onNotify("File opened", file.name, "folder_open");
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            onNotify("Open failed", msg || "Could not open the file.", "error_outline");
        }
        finally {
            refocusEditor();
        }
    }
    dom.fileInput.addEventListener("change", async (e) => {
        const input = e.target;
        if (pendingOpenMode === "singleText") {
            await importSingleTextFile(input);
            return;
        }
        await importSelectedFiles(input, {
            allowBundle: true,
            successTitle: "Files imported",
            successIcon: "file_upload",
            emptyTitle: "Open cancelled"
        });
    });
    dom.directoryInput.addEventListener("change", async (e) => {
        await importSelectedFiles(e.target, {
            allowBundle: false,
            successTitle: "Folder imported",
            successIcon: "folder_open",
            emptyTitle: "Folder import cancelled"
        });
    });
    function saveFile() {
        dom.saveBtn.blur();
        if (!isWorkspaceEnabled()) {
            const active = getActiveFile();
            if (!active) {
                onNotify("No active file", "Select a file to save it.", "error_outline");
                return;
            }
            const filename = getBasename(active.name) || "script.py";
            if (active.encoding === "utf8") {
                downloadBlob(new Blob([active.content], { type: active.mime || "text/plain" }), filename);
            }
            else {
                downloadBlob(new Blob([base64ToUint8Array(active.content)], {
                    type: active.mime || "application/octet-stream"
                }), filename);
            }
            onSaved(filename);
            onNotify("File saved", filename, "save");
            refocusEditor();
            return;
        }
        const files = getAllFiles();
        const active = getActiveFile();
        const bundle = {
            format: "inscribe-workspace-v1",
            exportedAt: new Date().toISOString(),
            activePath: (active === null || active === void 0 ? void 0 : active.name) || null,
            files: files.map((file) => ({
                path: file.name,
                mime: file.mime || guessMimeType(file.name, ""),
                encoding: file.encoding || "utf8",
                content: file.content
            }))
        };
        const filename = `${getBasename((active === null || active === void 0 ? void 0 : active.name) || "workspace").replace(/\.[^.]+$/, "") || "workspace"}.inscribeproj`;
        downloadBlob(new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" }), filename);
        onSaved(filename);
        onNotify("Project saved", filename, "save");
        refocusEditor();
    }
    function downloadActiveFile() {
        const active = getActiveFile();
        if (!active) {
            onNotify("No active file", "Select a file to download it.", "error_outline");
            return;
        }
        if (active.encoding === "utf8") {
            downloadBlob(new Blob([active.content], { type: active.mime || "text/plain" }), getBasename(active.name));
        }
        else {
            downloadBlob(new Blob([base64ToUint8Array(active.content)], { type: active.mime || "application/octet-stream" }), getBasename(active.name));
        }
        onNotify("File downloaded", getBasename(active.name), "download");
        refocusEditor();
    }
    return {
        openFile,
        openWorkspaceFiles,
        openFolder,
        saveFile,
        downloadActiveFile
    };
}
