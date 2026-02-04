// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2023-2026 Mark Yu

import { LS_KEYS } from "../constants.js";
import { safeLS } from "../utils/storage.js";
import { DomRefs } from "./dom-refs.js";
import { RunMode } from "./types.js";

export function getRunModeLabel(mode: RunMode) {
  if (mode === "selection") return "Selection";
  if (mode === "cell") return "Cell";
  return "All";
}

export function updateRunModeUI(stateRunMode: RunMode, dom: DomRefs) {
  const label = getRunModeLabel(stateRunMode);
  dom.runLabel.textContent = `Run ${label}`;

  [dom.runAllBtn, dom.runSelBtn, dom.runCellBtn].forEach((b) =>
    b.classList.remove("activeMode")
  );
  const map: Record<RunMode, HTMLButtonElement> = {
    all: dom.runAllBtn,
    selection: dom.runSelBtn,
    cell: dom.runCellBtn
  };
  const active = map[stateRunMode];
  if (active) active.classList.add("activeMode");

  dom.runBtn.title = `Run ${label} (Cmd/Ctrl + Enter)`;
}

export function setRunMode(
  mode: RunMode,
  dom: DomRefs,
  onModeChange: (next: RunMode) => void,
  addConsoleLine: (text: string, opts?: { dim?: boolean; system?: boolean }) => void
) {
  const allowed: RunMode[] = ["all", "selection", "cell"];
  const nextMode = allowed.includes(mode) ? mode : "all";
  onModeChange(nextMode);
  safeLS.set(LS_KEYS.RUNMODE, nextMode);
  updateRunModeUI(nextMode, dom);
  addConsoleLine(`Run mode set to: ${getRunModeLabel(nextMode)}`, {
    dim: true,
    system: true
  });
}
