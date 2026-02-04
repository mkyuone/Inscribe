// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2023-2026 Mark Yu
export const safeLS = {
    get(key) {
        try {
            return localStorage.getItem(key);
        }
        catch {
            return null;
        }
    },
    set(key, value) {
        try {
            localStorage.setItem(key, value);
        }
        catch {
            // ignore
        }
    }
};
