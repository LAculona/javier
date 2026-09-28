/**
 * Acceso seguro a localStorage: en modo privado, con cookies bloqueadas o
 * con la cuota llena el acceso puede lanzar excepciones, y la app debe
 * seguir funcionando igualmente.
 */
export function readStorage<T>(key: string, parse: (raw: unknown) => T | null): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return null;
    return parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function readString(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeString(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* sin persistencia disponible: se mantiene solo en memoria */
  }
}

export const STORAGE_KEYS = {
  tasks: 'focusly:tasks:v1',
  theme: 'focusly:theme',
} as const;
