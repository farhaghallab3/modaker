/**
 * Import the Quran text from a VERIFIED source, check it, and store it.
 *
 *   npx tsx scripts/import-quran.ts                       # Quran.com API v4 → PostgreSQL
 *   npx tsx scripts/import-quran.ts --json-only           # Quran.com → data/quran/{n}.json
 *   npx tsx scripts/import-quran.ts --tanzil quran-uthmani.txt [--json-only]
 *        (Tanzil "sura|aya|text" export, download from https://tanzil.net/download)
 *   --surah 1-10,18     limit to some surahs     --out dir   JSON output directory
 *
 * Every surah goes through verifySurahText(): ayah count vs. Hafs metadata,
 * sequential keys, non-empty Arabic text. A surah that fails is NOT imported
 * and the script exits non-zero. The SHA-256 checksum is stored alongside the
 * text and re-verified whenever it is served.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getSurahMeta, globalAyahIndex } from "@/lib/quran/surahs";
import type { Ayah, SurahText } from "@/lib/types";
import { QuranComProvider } from "@/server/quran/quran-com";
import { verifySurahText, ayahChecksum } from "@/server/quran/verification";
import type { SurahJsonFile } from "@/server/quran/json-cache";
import { sourceRef } from "@/server/rag/sources";
import { log, mapLimit, parseArgs, surahList } from "./_util";

const args = parseArgs();
const jsonOnly = args.flags.has("json-only");
const tanzilPath = args.values.get("tanzil");
const outDir = path.resolve(args.values.get("out") ?? process.env.QURAN_JSON_DIR ?? "data/quran");
const surahs = surahList(args.values.get("surah"));

async function loadTanzil(file: string): Promise<Map<number, Ayah[]>> {
  const raw = await readFile(file, "utf8");
  const bySurah = new Map<number, Ayah[]>();
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const [s, a, ...rest] = line.split("|");
    const surah = Number(s);
    const ayah = Number(a);
    if (!Number.isInteger(surah) || !Number.isInteger(ayah)) continue;
    const list = bySurah.get(surah) ?? [];
    list.push({ surah, ayah, key: `${surah}:${ayah}`, textUthmani: rest.join("|").trim() });
    bySurah.set(surah, list);
  }
  return bySurah;
}

async function main() {
  log(`source=${tanzilPath ? `tanzil:${tanzilPath}` : "quran.com"} target=${jsonOnly ? outDir : "database"} surahs=${surahs.length}`);

  let tanzil: Map<number, Ayah[]> | null = null;
  if (tanzilPath) tanzil = await loadTanzil(tanzilPath);
  const qc = new QuranComProvider(process.env.QURAN_COM_API ?? "https://api.quran.com/api/v4");

  const fetchSurah = async (n: number): Promise<SurahText> => {
    if (tanzil) {
      const ayahs = (tanzil.get(n) ?? []).sort((x, y) => x.ayah - y.ayah);
      return { meta: getSurahMeta(n)!, ayahs, source: sourceRef("tanzil:uthmani") };
    }
    return qc.getSurah(n); // verifies internally too
  };

  const prisma = jsonOnly ? null : await (await import("@/server/db")).getPrisma();
  if (jsonOnly) await mkdir(outDir, { recursive: true });

  const failures: string[] = [];
  await mapLimit(surahs, tanzil ? 8 : 3, async (n) => {
    let text: SurahText;
    try {
      text = await fetchSurah(n);
    } catch (e) {
      failures.push(`${n}: ${(e as Error).message}`);
      log(`✗ surah ${n}: ${(e as Error).message}`);
      return;
    }
    const v = verifySurahText(text);
    if (!v.ok) {
      failures.push(`${n}: ${v.problems.slice(0, 3).join("; ")}`);
      log(`✗ surah ${n} failed verification:`, v.problems.slice(0, 3));
      return;
    }
    // Never persist runtime-only fields.
    const ayahs = text.ayahs.map(({ audioUrl: _audio, ...a }) => a);

    if (jsonOnly) {
      const file: SurahJsonFile = { ...text, ayahs, checksum: v.checksum, fetchedAt: new Date().toISOString() };
      await writeFile(path.join(outDir, `${n}.json`), JSON.stringify(file));
    } else {
      await prisma!.$transaction([
        prisma!.ayah.deleteMany({ where: { surahNumber: n } }),
        prisma!.surah.upsert({
          where: { number: n },
          create: { ...metaRow(text), checksum: v.checksum },
          update: { ...metaRow(text), checksum: v.checksum, importedAt: new Date() },
        }),
        prisma!.ayah.createMany({
          data: ayahs.map((a) => ({
            surahNumber: n,
            number: a.ayah,
            key: a.key,
            globalIndex: globalAyahIndex(n, a.ayah),
            textUthmani: a.textUthmani,
            textSimple: a.textSimple ?? null,
            page: a.page ?? null,
            juz: a.juz ?? null,
            sourceId: text.source.id,
            checksum: ayahChecksum(a),
          })),
        }),
      ]);
    }
    log(`✓ surah ${n} (${ayahs.length} ayahs) sha256=${v.checksum.slice(0, 12)}…`);
  });

  if (prisma) await prisma.$disconnect();
  if (failures.length) {
    console.error(`\n${failures.length} surah(s) NOT imported:\n  ${failures.join("\n  ")}`);
    process.exit(1);
  }
  log("done.");
}

function metaRow(text: SurahText) {
  const m = text.meta;
  return { number: m.number, nameAr: m.nameAr, nameEn: m.nameEn, ayahCount: m.ayahCount, revelation: m.revelation, sourceId: text.source.id };
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
