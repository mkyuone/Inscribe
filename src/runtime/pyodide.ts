type PyodideLoader = (config: { indexURL: string }) => Promise<unknown>;

interface PyodideOptions {
  indexURL: string;
}

interface PyodideRuntime {
  runPythonAsync(code: string): Promise<unknown>;
}

interface PyodideManager {
  run(code: string): Promise<string>;
}

export function createPyodideManager(options: PyodideOptions): PyodideManager {
  let runtime: PyodideRuntime | null = null;
  let loading: Promise<PyodideRuntime> | null = null;

  const loadRuntime = async () => {
    if (runtime) {
      return runtime;
    }

    if (!loading) {
      loading = loadPyodideScript().then((loader) =>
        loader({ indexURL: options.indexURL })
      ) as Promise<PyodideRuntime>;
    }

    runtime = await loading;
    return runtime;
  };

  return {
    run: async (code: string) => {
      try {
        const pyodide = await loadRuntime();
        const result = await pyodide.runPythonAsync(code);
        return formatResult(result);
      } catch (error) {
        return formatError(error);
      }
    }
  };
}

function loadPyodideScript(): Promise<PyodideLoader> {
  return new Promise((resolve, reject) => {
    const existing = window.loadPyodide as PyodideLoader | undefined;

    if (existing) {
      resolve(existing);
      return;
    }

    const script = document.createElement("script");
    script.src = "/vendor/pyodide/pyodide.js";
    script.defer = true;
    script.onload = () => {
      if (!window.loadPyodide) {
        reject(new Error("Pyodide loader not found after script load."));
        return;
      }
      resolve(window.loadPyodide as PyodideLoader);
    };
    script.onerror = () => reject(new Error("Failed to load Pyodide script."));
    document.head.appendChild(script);
  });
}

function formatResult(result: unknown): string {
  if (typeof result === "string") {
    return result;
  }

  if (result === undefined || result === null) {
    return "";
  }

  return JSON.stringify(result, null, 2);
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return `Error: ${error.message}`;
  }

  return "Error: Unable to run Python code.";
}

declare global {
  interface Window {
    loadPyodide?: PyodideLoader;
  }
}
