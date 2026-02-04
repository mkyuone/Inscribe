// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2023-2026 Mark Yu

export const safeLS = {
  get(key: string) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // ignore
    }
  }
};
