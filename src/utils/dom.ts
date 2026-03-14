// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2023-2026 Mark Yu

export function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element: ${id}`);
  return el as T;
}

export type DebouncedFn<T extends (...args: any[]) => void> = ((
  ...args: Parameters<T>
) => void) & {
  cancel: () => void;
  flush: () => void;
};

export function debounce<T extends (...args: any[]) => void>(fn: T, delay = 200): DebouncedFn<T> {
  let t: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Parameters<T> | null = null;

  const debounced = ((...args: Parameters<T>) => {
    lastArgs = args;
    if (t) clearTimeout(t);
    t = setTimeout(() => {
      t = null;
      const nextArgs = lastArgs;
      lastArgs = null;
      if (nextArgs) fn(...nextArgs);
    }, delay);
  }) as DebouncedFn<T>;

  debounced.cancel = () => {
    if (t) clearTimeout(t);
    t = null;
    lastArgs = null;
  };

  debounced.flush = () => {
    if (!t) return;
    clearTimeout(t);
    t = null;
    const nextArgs = lastArgs;
    lastArgs = null;
    if (nextArgs) fn(...nextArgs);
  };

  return debounced;
}

export function escapeHtml(str: string) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function setClass(el: HTMLElement, status: "good" | "warn" | "bad") {
  el.classList.remove("good", "warn", "bad");
  el.classList.add(status);
}
