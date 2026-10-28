"use client";

/**
 * Starts the tajweed check on the same recording that goes to the word check, so both run at once.
 * The recite screen picks the pending result up when the word result is shown. The Blob is not kept:
 * only the request holds it until the server answers.
 */
import { api } from "@/lib/api";
import type { TajweedResult } from "@/lib/recitation/tajweed-notes";
import type { AyahRange } from "@/lib/types";

let pending: Promise<TajweedResult | null> | null = null;
/** Recordings are sent only after the server said the checker is set up (prepareTajweedCheck). */
let enabled = false;
let asked: Promise<void> | null = null;

/** Asks once whether tajweed checking is on (this also wakes the free checker). Call when the recite screen opens. */
export function prepareTajweedCheck(): Promise<void> {
  asked ??= api
    .tajweedEnabled()
    .then((r) => {
      enabled = r.enabled === true;
    })
    .catch(() => {
      asked = null; // try again next time
    });
  return asked;
}

export function startTajweedCheck(audio: Blob, range: AyahRange): void {
  if (!enabled) {
    pending = null;
    return;
  }
  pending = api.tajweed(audio, range).catch((e: { status?: number }) => {
    if (e?.status === 503) enabled = false;
    return null;
  });
}

/** The check started for the last recording (null when none runs). Each result is handed out once. */
export function takeTajweedCheck(): Promise<TajweedResult | null> | null {
  const p = pending;
  pending = null;
  return p;
}

export function forgetTajweedCheck(): void {
  pending = null;
}
