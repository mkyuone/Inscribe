export interface DraftStore {
  load(): string | null;
  save(value: string): void;
}

export function createDraftStore(key: string): DraftStore {
  return {
    load: () => {
      return localStorage.getItem(key);
    },
    save: (value) => {
      localStorage.setItem(key, value);
    }
  };
}
