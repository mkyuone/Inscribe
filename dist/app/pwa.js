// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2023-2026 Mark Yu
export function registerServiceWorker() {
    if (!("serviceWorker" in navigator))
        return;
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js").catch((err) => {
            console.warn("[PWA] Service worker registration failed:", err);
        });
    });
}
