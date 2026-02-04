// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2023-2026 Mark Yu

export function formatDuration(ms: number) {
  if (!Number.isFinite(ms)) return "--";
  const rounded = ms < 100 ? ms.toFixed(1) : ms.toFixed(0);
  return `${rounded} ms`;
}
