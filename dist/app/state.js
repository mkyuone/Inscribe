// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2023-2026 Mark Yu
import { LS_KEYS } from "../constants.js";
import { safeLS } from "../utils/storage.js";
export function createInitialState() {
    return {
        isRunning: false,
        isDirty: false,
        pyodideReady: false,
        pyodideInstance: null,
        runMode: safeLS.get(LS_KEYS.RUNMODE) || "all"
    };
}
