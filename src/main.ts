import "./styles/app.css";
import { createEditor } from "./editor/adapter";
import { createAppShell } from "./ui/layout";
import { createPyodideManager } from "./runtime/pyodide";
import { createDraftStore } from "./storage/drafts";

const appRoot = document.querySelector<HTMLDivElement>("#app");

if (!appRoot) {
  throw new Error("App root element not found.");
}

const shell = createAppShell(appRoot);
const draftStore = createDraftStore("inscribe-draft");
const editor = createEditor(shell.editorHost, {
  initialValue: draftStore.load() ?? "# Welcome to Inscribe\nprint('Hello from local assets!')"
});

const pyodide = createPyodideManager({
  indexURL: "/vendor/pyodide/"
});

shell.onRun(async () => {
  shell.setStatus("Running...");
  const code = editor.getValue();
  draftStore.save(code);
  const output = await pyodide.run(code);
  shell.setOutput(output);
  shell.setStatus("Idle");
});

shell.onClear(() => {
  shell.setOutput("");
});

shell.setStatus("Idle");
