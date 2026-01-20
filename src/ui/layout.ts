interface AppShell {
  editorHost: HTMLDivElement;
  onRun(handler: () => void): void;
  onClear(handler: () => void): void;
  setOutput(value: string): void;
  setStatus(value: string): void;
}

export function createAppShell(root: HTMLElement): AppShell {
  root.innerHTML = "";

  const app = document.createElement("div");
  app.className = "app";

  const header = document.createElement("header");
  header.className = "app-header";
  header.innerHTML = `
    <div class="brand">
      <span class="brand-title">Inscribe</span>
      <span class="brand-sub">Local assets prototype</span>
    </div>
    <div class="toolbar">
      <button class="btn" data-action="run">Run</button>
      <button class="btn secondary" data-action="clear">Clear</button>
      <span class="status" data-role="status">Idle</span>
    </div>
  `;

  const main = document.createElement("main");
  main.className = "app-main";

  const editorHost = document.createElement("div");
  editorHost.className = "editor-host";

  const output = document.createElement("pre");
  output.className = "output";
  output.setAttribute("data-role", "output");

  main.append(editorHost, output);
  app.append(header, main);
  root.appendChild(app);

  const runButton = header.querySelector<HTMLButtonElement>("[data-action='run']");
  const clearButton = header.querySelector<HTMLButtonElement>("[data-action='clear']");
  const status = header.querySelector<HTMLSpanElement>("[data-role='status']");

  const onRunHandlers: Array<() => void> = [];
  const onClearHandlers: Array<() => void> = [];

  runButton?.addEventListener("click", () => {
    onRunHandlers.forEach((handler) => handler());
  });

  clearButton?.addEventListener("click", () => {
    onClearHandlers.forEach((handler) => handler());
  });

  return {
    editorHost,
    onRun: (handler) => {
      onRunHandlers.push(handler);
    },
    onClear: (handler) => {
      onClearHandlers.push(handler);
    },
    setOutput: (value) => {
      output.textContent = value;
    },
    setStatus: (value) => {
      if (status) {
        status.textContent = value;
      }
    }
  };
}
