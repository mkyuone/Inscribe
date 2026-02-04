// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2023-2026 Mark Yu
export function isMac() {
    const p = navigator.platform || "";
    const ua = navigator.userAgent || "";
    return /Mac|iPhone|iPad|iPod/i.test(p) || /Mac OS X/i.test(ua);
}
