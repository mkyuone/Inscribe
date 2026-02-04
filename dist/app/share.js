// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2023-2026 Mark Yu
const SHARE_PREFIX = "v1:";
export function createShareController(dom, getCode, addConsoleLine, saveFile, refocusEditor) {
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
        const payload = `${SHARE_PREFIX}${code}`;
        try {
            const compressed = await compressText(payload);
            url.hash = `c=${bytesToBase64Url(compressed)}`;
            return { url: url.toString(), usedCompression: true };
        }
        catch {
            url.hash = `code=${encodePlain(payload)}`;
            return { url: url.toString(), usedCompression: false };
        }
    }
    async function readSharedCodeFromUrl() {
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
            const code = decoded.startsWith(SHARE_PREFIX)
                ? decoded.slice(SHARE_PREFIX.length)
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
    async function shareCode() {
        dom.shareBtn.blur();
        const code = getCode();
        if (!code.trim()) {
            showToast("Nothing to share", "Write some code first, then share a link.", "error_outline");
            return;
        }
        try {
            const { url, usedCompression } = await buildShareUrl(code);
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
            const note = usedCompression ? "Compressed and copied to clipboard." : "Copied to clipboard.";
            addConsoleLine(`Share link created. ${note}`, { dim: true, system: true });
            showToast("Share link copied", "Anyone with the link can see it.");
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
