/**
 * Continuous listening across screens: when a surah (or a Mushaf page) finishes playing, the player moves to the
 * next one and keeps going. The next screen picks the hand-over up from session storage (this tab only).
 */
const KEY = "modaker:continue-audio";

/** Before moving on: "surah:2" or "page:3", and the last ayah played (so an ayah split across pages is not repeated). */
export function markContinue(target: string, lastKey?: string) {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify({ target, lastKey: lastKey ?? null, at: Date.now() }));
  } catch {
    /* storage blocked: playback just stops at the end */
  }
}

/** On the next screen: was playback handed over to it (within the last minute)? Consumed once. */
export function takeContinue(target: string): { lastKey: string | null } | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { target?: string; lastKey?: string | null; at?: number };
    if (v.target !== target) return null;
    window.sessionStorage.removeItem(KEY);
    return typeof v.at === "number" && Date.now() - v.at < 60_000 ? { lastKey: v.lastKey ?? null } : null;
  } catch {
    return null;
  }
}
