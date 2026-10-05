/**
 * Import approved tafsir from Quran.com API v4.
 *
 *   npx tsx scripts/import-tafsir.ts                          # التفسير الميسر → PostgreSQL
 *   npx tsx scripts/import-tafsir.ts --source ibn-kathir
 *   npx tsx scripts/import-tafsir.ts --source all --json-only # → data/tafsir/{slug}/{n}.json
 *   --surah 1-10   limit surahs
 *
 * Only sources registered as approved in src/server/rag/sources.ts can be imported.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { QuranComProvider } from "@/server/quran/quran-com";
import { KNOWLEDGE_SOURCES, TAFSIR_SOURCE_IDS, type TafsirSlug } from "@/server/rag/sources";
import { log, mapLimit, parseArgs, surahList } from "./_util";

const args = parseArgs();
const jsonOnly = args.flags.has("json-only");
const sourceArg = args.values.get("source") ?? "muyassar";
const slugs: TafsirSlug[] = sourceArg === "all" ? ["muyassar", "ibn-kathir"] : [sourceArg as TafsirSlug];
const surahs = surahList(args.values.get("surah"));
const outRoot = path.resolve(args.values.get("out") ?? process.env.TAFSIR_JSON_DIR ?? "data/tafsir");

async function main() {
  for (const slug of slugs) {
    const src = KNOWLEDGE_SOURCES[TAFSIR_SOURCE_IDS[slug] ?? ""];
    if (!src?.approved || src.kind !== "tafsir") {
      console.error(`Unknown or unapproved tafsir source "${slug}". Allowed: muyassar, ibn-kathir.`);
      process.exit(1);
    }
  }

  const qc = new QuranComProvider(process.env.QURAN_COM_API ?? "https://api.quran.com/api/v4");
  const prisma = jsonOnly ? null : await (await import("@/server/db")).getPrisma();
  let failed = 0;

  for (const slug of slugs) {
    const src = KNOWLEDGE_SOURCES[TAFSIR_SOURCE_IDS[slug]];
    log(`importing ${src.title} (${src.id}) → ${jsonOnly ? outRoot : "database"}`);
    if (prisma) {
      const row = { slug, title: src.title, publisher: src.publisher ?? "", url: src.url ?? null, language: src.language, quranComId: src.quranComTafsirId ?? null, approved: src.approved };
      await prisma.tafsirSource.upsert({ where: { id: src.id }, create: { id: src.id, ...row }, update: row });
    } else {
      await mkdir(path.join(outRoot, slug), { recursive: true });
    }

    await mapLimit(surahs, 3, async (n) => {
      try {
        const entries = await qc.getTafsir(n, slug);
        if (!entries.length) throw new Error("no entries returned");
        if (prisma) {
          await prisma.$transaction([
            prisma.tafsirEntry.deleteMany({ where: { sourceId: src.id, surah: n } }),
            prisma.tafsirEntry.createMany({
              data: entries.map((e) => ({ sourceId: src.id, surah: n, ayah: Number(e.key.split(":")[1]), key: e.key, text: e.text })),
              skipDuplicates: true,
            }),
          ]);
        } else {
          await writeFile(path.join(outRoot, slug, `${n}.json`), JSON.stringify(entries));
        }
        log(`✓ ${slug} surah ${n}: ${entries.length} entries`);
      } catch (e) {
        failed++;
        log(`✗ ${slug} surah ${n}: ${(e as Error).message}`);
      }
    });
  }

  if (prisma) await prisma.$disconnect();
  if (failed) {
    console.error(`${failed} surah import(s) failed — re-run to retry.`);
    process.exit(1);
  }
  log("done. Next: npm run kb:index (embeddings for semantic search).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
