/** The reciter list (server-safe, in reciter-list.ts) and the learner's chosen reciter on this device. */
import { useSyncExternalStore } from "react";
import { DEFAULT_RECITER_ID, getReciter, type Reciter } from "./reciter-list";

export * from "./reciter-list";

// ── The learner's chosen reciter (per device; shared by every player on the page) ──

const KEY = "muzakkir:reciter";
const listeners = new Set<() => void>();

function readStored(): string {
  try {
    return window.localStorage.getItem(KEY) ?? DEFAULT_RECITER_ID;
  } catch {
    return DEFAULT_RECITER_ID;
  }
}

export function setReciterId(id: string): void {
  try {
    window.localStorage.setItem(KEY, getReciter(id).id);
  } catch {
    /* storage blocked — the choice lasts for this page only */
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => e.key === KEY && l();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

/** The chosen reciter; the default on the server and before hydration. */
export function useReciter(): Reciter {
  const id = useSyncExternalStore(subscribe, readStored, () => DEFAULT_RECITER_ID);
  return getReciter(id);
}
