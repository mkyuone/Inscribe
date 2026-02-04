// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2023-2026 Mark Yu

import { DEFAULT_PREFS } from "../constants.js";

export type RunMode = "all" | "selection" | "cell";
export type Prefs = typeof DEFAULT_PREFS;

export type AppState = {
  isRunning: boolean;
  isDirty: boolean;
  pyodideReady: boolean;
  pyodideInstance: any;
  runMode: RunMode;
};
