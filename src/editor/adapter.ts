export interface EditorAdapter {
  getValue(): string;
  setValue(value: string): void;
  focus(): void;
}

interface EditorOptions {
  initialValue: string;
}

export function createEditor(host: HTMLElement, options: EditorOptions): EditorAdapter {
  const textarea = document.createElement("textarea");
  textarea.className = "editor";
  textarea.value = options.initialValue;
  host.appendChild(textarea);

  return {
    getValue: () => textarea.value,
    setValue: (value) => {
      textarea.value = value;
    },
    focus: () => {
      textarea.focus();
    }
  };
}
