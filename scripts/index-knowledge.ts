/**
 * Build the semantic index (pgvector) over APPROVED sources only.
 *
 *   npx tsx scripts/index-knowledge.ts [--source tafsir:muyassar] [--reset] [--batch 64]
 *
 *  1. Upserts KnowledgeSource rows from src/server/rag/sources.ts.
 *  2. Chunks TafsirEntry rows of approved tafsir sources (long entries are split
 *     on sentence boundaries) and curated story intros/chapter summaries
 *     (source "muzakkir-curated", flagged editorial — never shown as tafsir).
 *  3. Embeds only chunks not already indexed (sourceId + contentHash), inserts
 *     them, and ensures the HNSW cosine index exists.
 * Requires DATABASE_URL and EMBEDDING_PROVIDER=openai with OPENAI_API_KEY.
 */
import { getPrisma } from "@/server/db";
import { EMBEDDING_DIMENSIONS, getEmbeddingProvider } from "@/server/llm/provider";
import { chunkText, contentHash } from "@/server/rag/chunk";
import { ayahRefLabel } from "@/server/rag/retriever";
import { KNOWLEDGE_SOURCES } from "@/server/rag/sources";
import { log, parseArgs } from "./_util";

interface PendingChunk {
  sourceId: string;
  ref: string;
  ayahKey: string | null;
  surah: number | null;
  ayahFrom: number | null;
  ayahTo: number | null;
  text: string;
  hash: string;
}

const args = parseArgs();
const only = args.values.get("source");
const reset = args.flags.has("reset");
const batchSize = Number(args.values.get("batch") ?? 64);

async function main() {
  const embedder = getEmbeddingProvider();
  if (!embedder) {
    console.error("No embedding provider configured (EMBEDDING_PROVIDER=openai + OPENAI_API_KEY). Retrieval still works via TafsirRetriever.");
    process.exit(1);
  }
  if (embedder.dimensions !== EMBEDDING_DIMENSIONS) throw new Error("embedding dimensions must match vector(1536)");
  const prisma = await getPrisma();

  // 1. Source registry → DB
  for (const s of Object.values(KNOWLEDGE_SOURCES)) {
    const row = { title: s.title, publisher: s.publisher ?? null, url: s.url ?? null, kind: s.kind, approved: s.approved, editorial: Boolean(s.editorial) };
    await prisma.knowledgeSource.upsert({ where: { id: s.id }, create: { id: s.id, ...row }, update: row });
  }
  const targets = Object.values(KNOWLEDGE_SOURCES).filter(
    (s) => s.approved && (s.kind === "tafsir" || s.kind === "curated") && (!only || s.id === only),
  );
  if (reset) {
    for (const s of targets) await prisma.knowledgeChunk.deleteMany({ where: { sourceId: s.id } });
    log("reset: removed existing chunks for", targets.map((t) => t.id).join(", "));
  }

  // 2. Build chunks
  const pending: PendingChunk[] = [];
  for (const s of targets) {
    if (s.kind === "tafsir") {
      for (let surah = 1; surah <= 114; surah++) {
        const entries = await prisma.tafsirEntry.findMany({ where: { sourceId: s.id, surah }, orderBy: { ayah: "asc" } });
        for (const e of entries) {
          chunkText(e.text).forEach((text, i) => {
            pending.push({
              sourceId: s.id,
              ref: ayahRefLabel(surah, e.ayah),
              ayahKey: e.key,
              surah,
              ayahFrom: e.ayah,
              ayahTo: e.ayah,
              text,
              hash: contentHash(s.id, e.key, String(i), text),
            });
          });
        }
      }
    } else {
      const stories = await prisma.story.findMany({ include: { chapters: { include: { ayahRefs: true } } } });
      for (const st of stories) {
        if (st.intro) {
          pending.push({ sourceId: s.id, ref: `قصة: ${st.title}`, ayahKey: null, surah: st.surahs[0] ?? null, ayahFrom: null, ayahTo: null, text: st.intro, hash: contentHash(s.id, st.slug, "intro", st.intro) });
        }
        for (const c of st.chapters) {
          const r = c.ayahRefs[0];
          const ref = r ? `${st.title} — ${c.title} (${ayahRefLabel(r.surah, r.fromAyah, r.toAyah)})` : `${st.title} — ${c.title}`;
          const text = `${c.title}: ${c.summary}`;
          pending.push({ sourceId: s.id, ref, ayahKey: r ? `${r.surah}:${r.fromAyah}` : null, surah: r?.surah ?? null, ayahFrom: r?.fromAyah ?? null, ayahTo: r?.toAyah ?? null, text, hash: contentHash(s.id, st.slug, c.id, text) });
        }
      }
    }
  }
  log(`built ${pending.length} chunks from ${targets.map((t) => t.id).join(", ")}`);

  // 3. Skip already-indexed chunks, embed the rest
  const existing = new Set(
    (await prisma.knowledgeChunk.findMany({ where: { sourceId: { in: targets.map((t) => t.id) } }, select: { sourceId: true, contentHash: true } })).map(
      (c) => `${c.sourceId}|${c.contentHash}`,
    ),
  );
  const todo = pending.filter((c) => !existing.has(`${c.sourceId}|${c.hash}`));
  log(`${todo.length} new chunks to embed (${pending.length - todo.length} already indexed)`);

  for (let i = 0; i < todo.length; i += batchSize) {
    const batch = todo.slice(i, i + batchSize);
    const vectors = await embedder.embed(batch.map((c) => c.text));
    for (let k = 0; k < batch.length; k++) {
      const c = batch[k];
      const vec = `[${vectors[k].join(",")}]`;
      await prisma.$executeRawUnsafe(
        `INSERT INTO "KnowledgeChunk" (id, "sourceId", ref, "ayahKey", surah, "ayahFrom", "ayahTo", text, "contentHash", embedding, "createdAt")
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8, $9::vector, now())
         ON CONFLICT ("sourceId", "contentHash") DO NOTHING`,
        c.sourceId, c.ref, c.ayahKey, c.surah, c.ayahFrom, c.ayahTo, c.text, c.hash, vec,
      );
    }
    log(`embedded ${Math.min(i + batchSize, todo.length)}/${todo.length}`);
  }

  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS knowledge_chunk_embedding_hnsw ON "KnowledgeChunk" USING hnsw (embedding vector_cosine_ops)`,
  );
  await prisma.$disconnect();
  log("done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
