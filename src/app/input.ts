// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2023-2026 Mark Yu

type InputRequest = {
  prompt: string;
  resolve: (value: string) => void;
};

export type ConsoleInputController = {
  requestInput: (prompt?: string) => Promise<string>;
  cancelActiveInput: () => void;
};

export function setupConsoleInput(consoleEl: HTMLDivElement): ConsoleInputController {
  const inputQueue: InputRequest[] = [];
  let activeInput: InputRequest | null = null;
  let cancelActive: (() => void) | null = null;

  function showNextInput() {
    const next = inputQueue.shift();
    if (!next) {
      activeInput = null;
      return;
    }
    activeInput = next;

    const line = document.createElement("div");
    line.className = "consoleLine input";

    const prefix = document.createElement("span");
    prefix.className = "prefix";
    prefix.textContent = "?";
    line.appendChild(prefix);

    const promptText = (next.prompt ?? "").toString();
    if (promptText) {
      const promptSpan = document.createElement("span");
      promptSpan.className = "consolePrompt";
      promptSpan.textContent = promptText;
      line.appendChild(promptSpan);
    }

    const input = document.createElement("input");
    input.className = "consoleInput";
    input.type = "text";
    input.autocomplete = "off";
    input.spellcheck = false;
    line.appendChild(input);

    consoleEl.appendChild(line);
    consoleEl.scrollTop = consoleEl.scrollHeight;
    input.focus();

    const commit = (value: string) => {
      const echo = document.createElement("span");
      echo.className = "consoleEcho";
      echo.textContent = value;
      line.removeChild(input);
      line.appendChild(echo);
      next.resolve(value);
      activeInput = null;
      cancelActive = null;
      showNextInput();
    };
    cancelActive = () => commit("");

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commit(input.value ?? "");
      }
      if (e.key === "Escape") {
        e.preventDefault();
        commit("");
      }
    });
  }

  function requestConsoleInput(prompt = ""): Promise<string> {
    return new Promise((resolve) => {
      inputQueue.push({ prompt, resolve });
      if (!activeInput) showNextInput();
    });
  }

  (window as any).__inscribeReadline = (prompt?: string) =>
    requestConsoleInput(prompt ? String(prompt) : "");

  function cancelActiveInput() {
    if (cancelActive) cancelActive();
  }

  return { requestInput: requestConsoleInput, cancelActiveInput };
}

export function rewriteInputCalls(source: string) {
  const isIdentChar = (ch: string) => /[A-Za-z0-9_]/.test(ch);
  const isSpace = (ch: string) => /\s/.test(ch);
  const readPrevToken = (idx: number) => {
    let j = idx - 1;
    while (j >= 0 && isSpace(source[j])) j--;
    if (j < 0) return "";
    let end = j;
    while (j >= 0 && isIdentChar(source[j])) j--;
    return source.slice(j + 1, end + 1);
  };

  let i = 0;
  let out = "";
  let changed = false;
  let state: "normal" | "single" | "double" | "triple_single" | "triple_double" | "comment" =
    "normal";

  const startsWithAt = (str: string) => source.startsWith(str, i);

  while (i < source.length) {
    const ch = source[i];

    if (state === "comment") {
      out += ch;
      if (ch === "\n") state = "normal";
      i += 1;
      continue;
    }

    if (state === "single") {
      out += ch;
      if (ch === "\\" && i + 1 < source.length) {
        out += source[i + 1];
        i += 2;
        continue;
      }
      if (ch === "'") state = "normal";
      i += 1;
      continue;
    }

    if (state === "double") {
      out += ch;
      if (ch === "\\" && i + 1 < source.length) {
        out += source[i + 1];
        i += 2;
        continue;
      }
      if (ch === '"') state = "normal";
      i += 1;
      continue;
    }

    if (state === "triple_single") {
      if (startsWithAt("'''")) {
        out += "'''";
        i += 3;
        state = "normal";
        continue;
      }
      out += ch;
      i += 1;
      continue;
    }

    if (state === "triple_double") {
      if (startsWithAt('"""')) {
        out += '"""';
        i += 3;
        state = "normal";
        continue;
      }
      out += ch;
      i += 1;
      continue;
    }

    if (ch === "#") {
      out += ch;
      state = "comment";
      i += 1;
      continue;
    }
    if (startsWithAt("'''")) {
      out += "'''";
      i += 3;
      state = "triple_single";
      continue;
    }
    if (startsWithAt('"""')) {
      out += '"""';
      i += 3;
      state = "triple_double";
      continue;
    }
    if (ch === "'") {
      out += ch;
      state = "single";
      i += 1;
      continue;
    }
    if (ch === '"') {
      out += ch;
      state = "double";
      i += 1;
      continue;
    }

    if (startsWithAt("input")) {
      const prev = i > 0 ? source[i - 1] : "";
      if (prev && (isIdentChar(prev) || prev === ".")) {
        out += ch;
        i += 1;
        continue;
      }

      let j = i + 5;
      while (j < source.length && isSpace(source[j])) j++;
      if (source[j] !== "(") {
        out += ch;
        i += 1;
        continue;
      }

      const prevToken = readPrevToken(i);
      const needsAwait = prevToken !== "await";
      out += `${needsAwait ? "await " : ""}__import__("js").__inscribeReadline(`;
      i = j + 1;
      changed = true;
      continue;
    }

    out += ch;
    i += 1;
  }

  return { code: out, changed };
}
