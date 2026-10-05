/**
 * Quran text/tafsir provider abstraction. All verse text in the app flows
 * through a `QuranProvider` — never from the LLM, never from source code.
 *
 *   QURAN_PROVIDER=quran-com  → Quran.com API v4 at runtime (default)
 *   QURAN_PROVIDER=database   → PostgreSQL rows imported + checksummed
 *   QURAN_PROVIDER=json       → data/quran/*.json written by the import script
 *
 * Every implementation runs verifySurahText() and throws
 * QuranVerificationError / QuranSourceUnavailableError (→ 502 / 503).
 */
import { env } from "../env";
import type { QuranProvider } from "./common";
import { DatabaseQuranProvider } from "./database";
import { JsonCacheQuranProvider } from "./json-cache";
import { QuranComProvider } from "./quran-com";

export type { QuranProvider, TafsirSlug } from "./common";
export { QuranSourceUnavailableError, QuranVerificationError } from "../errors";

const g = globalThis as unknown as { __muzakkirQuran?: QuranProvider; __muzakkirQuranId?: string };

export function createQuranProvider(id = env.quranProvider()): QuranProvider {
  switch (id) {
    case "database":
      return new DatabaseQuranProvider();
    case "json":
      return new JsonCacheQuranProvider();
    case "quran-com":
      return new QuranComProvider();
    default:
      throw new Error(`Unknown QURAN_PROVIDER "${id}" (expected quran-com | database | json)`);
  }
}

/** Process-wide singleton so the in-memory caches are shared by all routes. */
export function getQuranProvider(): QuranProvider {
  const id = env.quranProvider();
  if (!g.__muzakkirQuran || g.__muzakkirQuranId !== id) {
    g.__muzakkirQuran = createQuranProvider(id);
    g.__muzakkirQuranId = id;
  }
  return g.__muzakkirQuran;
}

/** Test hook: inject a fake provider. */
export function setQuranProviderForTests(p: QuranProvider | undefined) {
  g.__muzakkirQuran = p;
  g.__muzakkirQuranId = p ? env.quranProvider() : undefined;
}
