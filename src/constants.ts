// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2023-2026 Mark Yu

export const LS_KEYS = {
  DRAFT: "inscribe_draft_code_v5",
  PREFS: "inscribe_prefs_v5",
  FILENAME: "inscribe_filename_v5",
  RUNMODE: "inscribe_runmode_v5",
  TABS: "inscribe_tabs_v1"
} as const;

export const DEFAULT_PREFS = {
  editorFontSize: 14.0,
  consoleFontSize: 13.5,
  lineWrap: false,
  showExecTime: true,
  splitHorizontal: true,
  theme: "system"
};
