"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Light/dark theme. The resolved theme lives on <html data-theme="light|dark">; all
 * colour tokens in globals.css switch from there, so components need no changes.
 * The preference is a per-device setting kept in localStorage (not synced state).
 */
export type ThemePreference = "light" | "dark" | "system";
export const THEME_STORAGE_KEY = "muzakkir:theme";

/**
 * Runs before first paint (inlined in the root layout) so the page never flashes the
 * wrong theme, and keeps following the OS while the preference is "system".
 */
export const themeInitScript = `(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)},d=document.documentElement,m=window.matchMedia("(prefers-color-scheme: dark)");function a(){var p=localStorage.getItem(k);if(p!=="light"&&p!=="dark")p=m.matches?"dark":"light";d.dataset.theme=p;}a();m.addEventListener("change",a);window.addEventListener("storage",function(e){if(e.key===k)a();});}catch(e){document.documentElement.dataset.theme="light";}})();`;

function readPreference(): ThemePreference {
  try {
    const p = localStorage.getItem(THEME_STORAGE_KEY);
    return p === "light" || p === "dark" ? p : "system";
  } catch {
    return "system";
  }
}

function resolve(pref: ThemePreference): "light" | "dark" {
  if (pref !== "system") return pref;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function useTheme() {
  const [preference, setPref] = useState<ThemePreference>("system");

  useEffect(() => setPref(readPreference()), []);

  const setPreference = useCallback((pref: ThemePreference) => {
    try {
      if (pref === "system") localStorage.removeItem(THEME_STORAGE_KEY);
      else localStorage.setItem(THEME_STORAGE_KEY, pref);
    } catch {
      /* storage unavailable: still apply for this session */
    }
    const root = document.documentElement;
    // Cross-fade colours only while switching, never on ordinary interactions.
    root.classList.add("theme-transition");
    root.dataset.theme = resolve(pref);
    window.setTimeout(() => root.classList.remove("theme-transition"), 400);
    setPref(pref);
  }, []);

  return { preference, setPreference };
}
