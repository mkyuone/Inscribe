// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2023-2026 Mark Yu
const TOAST_HIDE_DELAY_MS = 220;
export function createToastVisibility(toast) {
    let hideTimer = null;
    const clearHideTimer = () => {
        if (!hideTimer)
            return;
        clearTimeout(hideTimer);
        hideTimer = null;
    };
    return {
        show() {
            clearHideTimer();
            toast.hidden = false;
            void toast.offsetWidth;
            toast.classList.add("show");
        },
        hide() {
            clearHideTimer();
            toast.classList.remove("show");
            hideTimer = setTimeout(() => {
                if (!toast.classList.contains("show")) {
                    toast.hidden = true;
                }
            }, TOAST_HIDE_DELAY_MS);
        }
    };
}
