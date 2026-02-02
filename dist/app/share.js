const SHARE_PREFIX_V1 = "v1:";
const SHARE_PREFIX_V2 = "v2:";
const SHARE_MAX_URL_LEN = 10000;
const MAX_SHARE_EDITS = 3;
const MAX_SHARE_OUTPUTS = 3;
const MAX_OUTPUT_CHARS = 1500;
export function createShareController(dom, getCode, addConsoleLine, saveFile, refocusEditor, history) {
    let toastTimer = null;
    function showToast(title, desc, icon = "check_circle") {
        dom.shareToastTitle.textContent = title;
        dom.shareToastDesc.textContent = desc;
        dom.shareToastIcon.textContent = icon;
        dom.shareToast.classList.add("show");
        if (toastTimer)
            clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
            dom.shareToast.classList.remove("show");
        }, 2800);
    }
    dom.shareToast.addEventListener("click", () => {
        dom.shareToast.classList.remove("show");
    });
    function bytesToBase64Url(bytes) {
        let binary = "";
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
            const chunk = bytes.subarray(i, i + chunkSize);
            binary += String.fromCharCode(...chunk);
        }
        return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    }
    function base64UrlToBytes(data) {
        let base64 = data.replace(/-/g, "+").replace(/_/g, "/");
        const pad = base64.length % 4;
        if (pad)
            base64 += "=".repeat(4 - pad);
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }
    async function compressText(text) {
        const CompressionStreamCtor = window.CompressionStream;
        if (!CompressionStreamCtor)
            throw new Error("CompressionStream not supported");
        const data = new TextEncoder().encode(text);
        const stream = new Blob([data]).stream().pipeThrough(new CompressionStreamCtor("gzip"));
        const buffer = await new Response(stream).arrayBuffer();
        return new Uint8Array(buffer);
    }
    async function decompressText(bytes) {
        const DecompressionStreamCtor = window.DecompressionStream;
        if (!DecompressionStreamCtor)
            throw new Error("DecompressionStream not supported");
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStreamCtor("gzip"));
        const buffer = await new Response(stream).arrayBuffer();
        return new TextDecoder().decode(buffer);
    }
    function encodePlain(text) {
        return bytesToBase64Url(new TextEncoder().encode(text));
    }
    function decodePlain(encoded) {
        return new TextDecoder().decode(base64UrlToBytes(encoded));
    }
    async function buildShareUrl(code) {
        const url = new URL(window.location.href);
        const payload = `${SHARE_PREFIX_V1}${code}`;
        try {
            const compressed = await compressText(payload);
            url.hash = `c=${bytesToBase64Url(compressed)}`;
            return { url: url.toString(), usedCompression: true, trimmedEdits: 0, trimmedOutputs: 0 };
        }
        catch {
            url.hash = `code=${encodePlain(payload)}`;
            return { url: url.toString(), usedCompression: false, trimmedEdits: 0, trimmedOutputs: 0 };
        }
    }
    function truncate(text, max) {
        if (text.length <= max)
            return text;
        return `${text.slice(0, max)}…`;
    }
    async function collectShareHistory(options) {
        if (!history)
            return { edits: [], outputs: [] };
        const edits = options.includeEdits ? await history.listEdits(30) : [];
        const outputs = options.includeOutputs ? await history.listOutputs(30) : [];
        const filteredEdits = edits
            .filter((entry) => entry.kind === "run" || entry.kind === "manual")
            .slice(0, MAX_SHARE_EDITS)
            .reverse();
        const filteredOutputs = outputs
            .filter((entry) => entry.stdout && entry.stdout.trim())
            .slice(0, MAX_SHARE_OUTPUTS)
            .reverse()
            .map((entry) => ({
            ...entry,
            stdout: truncate(entry.stdout, MAX_OUTPUT_CHARS)
        }));
        return { edits: filteredEdits, outputs: filteredOutputs };
    }
    async function buildShareUrlWithHistory(code, options) {
        const url = new URL(window.location.href);
        const historyData = await collectShareHistory(options);
        let edits = historyData.edits;
        let outputs = historyData.outputs;
        let trimmedEdits = 0;
        let trimmedOutputs = 0;
        while (true) {
            const payload = {
                v: 2,
                c: code
            };
            if (edits.length) {
                payload.e = edits.map((entry) => ({
                    t: entry.ts,
                    k: entry.kind,
                    c: entry.code
                }));
            }
            if (outputs.length) {
                payload.o = outputs.map((entry) => ({
                    t: entry.ts,
                    s: entry.stdout
                }));
            }
            const payloadText = `${SHARE_PREFIX_V2}${JSON.stringify(payload)}`;
            try {
                const compressed = await compressText(payloadText);
                url.hash = `c=${bytesToBase64Url(compressed)}`;
                if (url.toString().length <= SHARE_MAX_URL_LEN || (!edits.length && !outputs.length)) {
                    return {
                        url: url.toString(),
                        usedCompression: true,
                        trimmedEdits,
                        trimmedOutputs,
                        editsCount: edits.length,
                        outputsCount: outputs.length
                    };
                }
            }
            catch {
                url.hash = `code=${encodePlain(payloadText)}`;
                if (url.toString().length <= SHARE_MAX_URL_LEN || (!edits.length && !outputs.length)) {
                    return {
                        url: url.toString(),
                        usedCompression: false,
                        trimmedEdits,
                        trimmedOutputs,
                        editsCount: edits.length,
                        outputsCount: outputs.length
                    };
                }
            }
            if (outputs.length) {
                outputs = outputs.slice(0, -1);
                trimmedOutputs += 1;
                continue;
            }
            if (edits.length) {
                edits = edits.slice(0, -1);
                trimmedEdits += 1;
                continue;
            }
            return {
                url: url.toString(),
                usedCompression: true,
                trimmedEdits,
                trimmedOutputs,
                editsCount: edits.length,
                outputsCount: outputs.length
            };
        }
    }
    async function readSharedCodeFromUrl() {
        var _a;
        const hash = window.location.hash.startsWith("#")
            ? window.location.hash.slice(1)
            : window.location.hash;
        if (!hash)
            return null;
        const params = new URLSearchParams(hash);
        const compressed = params.get("c");
        const plain = params.get("code");
        if (!compressed && !plain)
            return null;
        try {
            const decoded = compressed
                ? await decompressText(base64UrlToBytes(compressed))
                : decodePlain(plain !== null && plain !== void 0 ? plain : "");
            if (decoded.startsWith(SHARE_PREFIX_V2)) {
                const raw = decoded.slice(SHARE_PREFIX_V2.length);
                const payload = JSON.parse(raw);
                const code = (_a = payload.c) !== null && _a !== void 0 ? _a : "";
                const edits = Array.isArray(payload.e)
                    ? payload.e
                        .filter((entry) => entry && typeof entry.c === "string")
                        .map((entry) => ({
                        ts: Number(entry.t) || Date.now(),
                        kind: entry.k || "shared",
                        code: entry.c
                    }))
                    : undefined;
                const outputs = Array.isArray(payload.o)
                    ? payload.o
                        .filter((entry) => entry && typeof entry.s === "string")
                        .map((entry) => ({
                        ts: Number(entry.t) || Date.now(),
                        kind: "shared",
                        stdout: entry.s
                    }))
                    : undefined;
                return { code, compressed: !!compressed, history: { edits, outputs } };
            }
            const code = decoded.startsWith(SHARE_PREFIX_V1)
                ? decoded.slice(SHARE_PREFIX_V1.length)
                : decoded;
            return { code, compressed: !!compressed };
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            addConsoleLine(`Share link failed to decode: ${msg}`, { error: true });
            showToast("Share link invalid", "This link could not be decoded.", "error_outline");
            return null;
        }
    }
    function openShareWarn() {
        dom.shareWarnOverlay.classList.add("active");
    }
    function closeShareWarn() {
        dom.shareWarnOverlay.classList.remove("active");
    }
    function confirmLongUrl(length) {
        return new Promise((resolve) => {
            dom.shareWarnText.textContent = `This share link is very long (${length} characters). Continue anyway?`;
            openShareWarn();
            const cleanup = () => {
                dom.shareWarnCancelBtn.removeEventListener("click", onCancel);
                dom.shareWarnDownloadBtn.removeEventListener("click", onDownload);
                dom.shareWarnConfirmBtn.removeEventListener("click", onConfirm);
            };
            const onCancel = () => {
                closeShareWarn();
                cleanup();
                resolve(false);
            };
            const onDownload = () => {
                closeShareWarn();
                saveFile();
                cleanup();
                resolve(false);
            };
            const onConfirm = () => {
                closeShareWarn();
                cleanup();
                resolve(true);
            };
            dom.shareWarnCancelBtn.addEventListener("click", onCancel);
            dom.shareWarnDownloadBtn.addEventListener("click", onDownload);
            dom.shareWarnConfirmBtn.addEventListener("click", onConfirm);
        });
    }
    async function copyToClipboard(text) {
        var _a;
        if ((_a = navigator.clipboard) === null || _a === void 0 ? void 0 : _a.writeText) {
            await navigator.clipboard.writeText(text);
            return;
        }
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "true");
        textarea.style.position = "fixed";
        textarea.style.top = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand("copy");
        }
        finally {
            document.body.removeChild(textarea);
        }
    }
    function promptShareOptions() {
        return new Promise((resolve) => {
            dom.shareIncludeEdits.checked = false;
            dom.shareIncludeOutput.checked = false;
            dom.shareOverlay.classList.add("active");
            const cleanup = () => {
                dom.shareCancelBtn.removeEventListener("click", onCancel);
                dom.shareConfirmBtn.removeEventListener("click", onConfirm);
                dom.shareOverlay.removeEventListener("click", onBackdrop);
                window.removeEventListener("keydown", onEsc, { capture: true });
            };
            const close = () => {
                dom.shareOverlay.classList.remove("active");
                cleanup();
            };
            const onCancel = () => {
                close();
                resolve(null);
            };
            const onConfirm = () => {
                const options = {
                    includeEdits: dom.shareIncludeEdits.checked,
                    includeOutputs: dom.shareIncludeOutput.checked
                };
                close();
                resolve(options);
            };
            const onBackdrop = (e) => {
                if (e.target === dom.shareOverlay)
                    onCancel();
            };
            const onEsc = (e) => {
                if (e.key !== "Escape")
                    return;
                if (!dom.shareOverlay.classList.contains("active"))
                    return;
                e.preventDefault();
                e.stopImmediatePropagation();
                e.stopPropagation();
                onCancel();
            };
            dom.shareCancelBtn.addEventListener("click", onCancel);
            dom.shareConfirmBtn.addEventListener("click", onConfirm);
            dom.shareOverlay.addEventListener("click", onBackdrop);
            window.addEventListener("keydown", onEsc, { capture: true });
        });
    }
    async function shareCode() {
        dom.shareBtn.blur();
        const code = getCode();
        if (!code.trim()) {
            showToast("Nothing to share", "Write some code first, then share a link.", "error_outline");
            return;
        }
        try {
            const options = await promptShareOptions();
            if (!options) {
                addConsoleLine("Share cancelled.", { dim: true, system: true });
                return;
            }
            const { url, usedCompression, trimmedEdits, trimmedOutputs } = options.includeEdits || options.includeOutputs
                ? await buildShareUrlWithHistory(code, options)
                : await buildShareUrl(code);
            const warnThreshold = 1600;
            if (url.length > warnThreshold) {
                const proceed = await confirmLongUrl(url.length);
                if (!proceed) {
                    addConsoleLine("Share cancelled due to long URL.", { dim: true, system: true });
                    showToast("Share cancelled", "Use Save to download a .py file.");
                    return;
                }
            }
            await copyToClipboard(url);
            const trimmedNote = trimmedEdits || trimmedOutputs ? "History trimmed to fit link size." : "";
            const note = usedCompression ? "Compressed and copied to clipboard." : "Copied to clipboard.";
            addConsoleLine(`Share link created. ${note}`, { dim: true, system: true });
            showToast("Share link copied", trimmedNote || "Anyone with the link can see it.");
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            addConsoleLine(`Share failed: ${msg}`, { error: true });
            showToast("Share failed", "Your browser blocked link sharing.", "error_outline");
        }
        finally {
            refocusEditor();
        }
    }
    return {
        shareCode,
        readSharedCodeFromUrl,
        showToast
    };
}
