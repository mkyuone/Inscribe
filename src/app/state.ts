// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2023-2026 Mark Yu

import { LS_KEYS } from "../constants.js";
import { safeLS } from "../utils/storage.js";
import { AppState, RunMode } from "./types.js";

export function createInitialState(): AppState {
  return {
    isRunning: false,
    isDirty: false,
    pyodideReady: false,
    pyodideInstance: null,
    runMode: (safeLS.get(LS_KEYS.RUNMODE) as RunMode) || "all"
  };
}
