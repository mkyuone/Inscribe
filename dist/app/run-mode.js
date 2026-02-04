// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2023-2026 Mark Yu
import { LS_KEYS } from "../constants.js";
import { safeLS } from "../utils/storage.js";
export function getRunModeLabel(mode) {
    if (mode === "selection")
        return "Selection";
    if (mode === "cell")
        return "Cell";
    return "All";
}
export function updateRunModeUI(stateRunMode, dom) {
    const label = getRunModeLabel(stateRunMode);
    dom.runLabel.textContent = `Run ${label}`;
    [dom.runAllBtn, dom.runSelBtn, dom.runCellBtn].forEach((b) => b.classList.remove("activeMode"));
    const map = {
        all: dom.runAllBtn,
        selection: dom.runSelBtn,
        cell: dom.runCellBtn
    };
    const active = map[stateRunMode];
    if (active)
        active.classList.add("activeMode");
    dom.runBtn.title = `Run ${label} (Cmd/Ctrl + Enter)`;
}
export function setRunMode(mode, dom, onModeChange, addConsoleLine) {
    const allowed = ["all", "selection", "cell"];
    const nextMode = allowed.includes(mode) ? mode : "all";
    onModeChange(nextMode);
    safeLS.set(LS_KEYS.RUNMODE, nextMode);
    updateRunModeUI(nextMode, dom);
    addConsoleLine(`Run mode set to: ${getRunModeLabel(nextMode)}`, {
        dim: true,
        system: true
    });
}
