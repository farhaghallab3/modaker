"use client";

import { useSyncExternalStore } from "react";

// ── "Show the English translation under every ayah" (per device) ──

const KEY = "muzakkir:show-translation";
const listeners = new Set<() => void>();

function readStored(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setShowTranslation(on: boolean): void {
  try {
    window.localStorage.setItem(KEY, on ? "1" : "0");
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

/** Off on the server and before hydration. */
export function useShowTranslation(): boolean {
  return useSyncExternalStore(subscribe, readStored, () => false);
}
