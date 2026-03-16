// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2023-2026 Mark Yu
function applyConfirmTone(button, tone) {
    button.classList.remove("primary", "danger");
    button.classList.add(tone);
}
export function confirmDialog(dom, opts) {
    const { title, text, hint = "", confirmLabel = "Continue", cancelLabel = "Cancel", icon = "warning", tone = "primary", showCancel = true } = opts;
    dom.confirmTitle.textContent = title;
    dom.confirmText.textContent = text;
    dom.confirmHint.textContent = hint;
    dom.confirmHint.hidden = !hint.trim();
    dom.confirmIcon.textContent = icon;
    dom.confirmOkBtn.textContent = confirmLabel;
    dom.confirmCancelBtn.textContent = cancelLabel;
    dom.confirmCancelBtn.hidden = !showCancel;
    applyConfirmTone(dom.confirmOkBtn, tone);
    dom.confirmOverlay.classList.add("active");
    return new Promise((resolve) => {
        const cleanup = () => {
            dom.confirmOkBtn.removeEventListener("click", onConfirm);
            dom.confirmCancelBtn.removeEventListener("click", onCancel);
            dom.confirmOverlay.removeEventListener("click", onBackdrop);
            window.removeEventListener("keydown", onKeyDown, true);
            dom.confirmOverlay.classList.remove("active");
            dom.confirmCancelBtn.hidden = false;
            applyConfirmTone(dom.confirmOkBtn, "primary");
        };
        const close = (result) => {
            cleanup();
            resolve(result);
        };
        const onConfirm = () => close(true);
        const onCancel = () => close(false);
        const onBackdrop = (event) => {
            if (event.target === dom.confirmOverlay)
                onCancel();
        };
        const onKeyDown = (event) => {
            if (event.key !== "Escape")
                return;
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            onCancel();
        };
        dom.confirmOkBtn.addEventListener("click", onConfirm);
        if (showCancel) {
            dom.confirmCancelBtn.addEventListener("click", onCancel);
        }
        dom.confirmOverlay.addEventListener("click", onBackdrop);
        window.addEventListener("keydown", onKeyDown, true);
        requestAnimationFrame(() => {
            (showCancel ? dom.confirmCancelBtn : dom.confirmOkBtn).focus();
        });
    });
}
