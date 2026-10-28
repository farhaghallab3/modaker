"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { SourceRef, TranslationEntry } from "@/lib/types";

/**
 * Lazily loads the approved English translation of a surah (never generated).
 * One request per surah per page lifetime, shared by every consumer.
 */
type TranslationData = { surah: number; byKey: Map<string, TranslationEntry>; source: SourceRef };
const cache = new Map<number, Promise<TranslationData>>();

function load(surah: number): Promise<TranslationData> {
  let p = cache.get(surah);
  if (!p) {
    p = api.translation(surah).then(({ entries, source }) => ({ surah, source, byKey: new Map(entries.map((e) => [e.key, e])) }));
    p.catch(() => cache.delete(surah)); // allow retry after failure
    cache.set(surah, p);
  }
  return p;
}

export function useAyahTranslation(surah: number, enabled = true) {
  const [loaded, setData] = useState<TranslationData | null>(null);
  const data = loaded?.surah === surah ? loaded : null;
  const [error, setError] = useState<Error | null>(null);
  const [nonce, setNonce] = useState(0);
  const loading = enabled && !data && !error;

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    setError(null);
    load(surah)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e as Error));
    return () => {
      alive = false;
    };
  }, [surah, enabled, nonce]);

  const retry = useCallback(() => setNonce((n) => n + 1), []);
  return { data, error, loading, retry };
}
