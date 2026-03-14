// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2023-2026 Mark Yu
export function byId(id) {
    const el = document.getElementById(id);
    if (!el)
        throw new Error(`Missing element: ${id}`);
    return el;
}
export function debounce(fn, delay = 200) {
    let t = null;
    let lastArgs = null;
    const debounced = ((...args) => {
        lastArgs = args;
        if (t)
            clearTimeout(t);
        t = setTimeout(() => {
            t = null;
            const nextArgs = lastArgs;
            lastArgs = null;
            if (nextArgs)
                fn(...nextArgs);
        }, delay);
    });
    debounced.cancel = () => {
        if (t)
            clearTimeout(t);
        t = null;
        lastArgs = null;
    };
    debounced.flush = () => {
        if (!t)
            return;
        clearTimeout(t);
        t = null;
        const nextArgs = lastArgs;
        lastArgs = null;
        if (nextArgs)
            fn(...nextArgs);
    };
    return debounced;
}
export function escapeHtml(str) {
    return String(str)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
export function setClass(el, status) {
    el.classList.remove("good", "warn", "bad");
    el.classList.add(status);
}
