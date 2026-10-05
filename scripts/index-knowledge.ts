/**
 * Build the semantic index (pgvector) over APPROVED sources only.
 *
 *   npx tsx scripts/index-knowledge.ts [--source tafsir:muyassar] [--reset] [--batch 64]
 *
 *  1. Syncs the source registry (src/server/rag/sources.ts → KnowledgeSource) without changing
 *     any source's enabled / review state.
 *  2. Chunks TafsirEntry rows of sources that are ENABLED and approved/published in the database.
 *     Chunks are verbatim imports, stored with full provenance (kind, author, language, url,
 *     origin, review state, import batch).
 *  3. Editorial story content is indexed ONLY when the story AND chapter are `published` and not
 *     demo. Demo stories (all of today's content) are never indexed — see src/lib/content-state.ts.
 *  4. Embeds only chunks not already indexed (sourceId + contentHash), inserts them, and ensures
 *     the HNSW cosine index exists.
 * Requires DATABASE_URL and EMBEDDING_PROVIDER=openai with OPENAI_API_KEY.
 */
import { getPrisma } from "@/server/db";
import { EMBEDDING_DIMENSIONS, getEmbeddingProvider } from "@/server/llm/provider";
import { chunkText, contentHash } from "@/server/rag/chunk";
import { syncSourceRegistry } from "@/server/rag/registry-sync";
import { ayahRefLabel, quranComUrl } from "@/server/rag/retriever";
import { KNOWLEDGE_SOURCES } from "@/server/rag/sources";
import { log, parseArgs } from "./_util";

interface PendingChunk {
  sourceId: string;
  ref: string;
  title: string;
  kind: string;
  author: string | null;
  url: string | null;
  origin: "imported" | "editorial";
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
const batchId = `idx-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "")}`;

async function main() {
  const embedder = getEmbeddingProvider();
  if (!embedder) {
    console.error("No embedding provider configured (EMBEDDING_PROVIDER=openai + OPENAI_API_KEY). Retrieval still works via TafsirRetriever.");
    process.exit(1);
  }
  if (embedder.dimensions !== EMBEDDING_DIMENSIONS) throw new Error("embedding dimensions must match vector(1536)");
  const prisma = await getPrisma();

  // 1. Registry → DB (metadata only; never flips enabled / reviewState).
  const sync = await syncSourceRegistry(prisma);
  if (sync.created.length) log(`registry: created ${sync.created.join(", ")}`);

  // 2. Which sources may be indexed? Decided by the DATABASE state, not by the code file.
  const usable = await prisma.knowledgeSource.findMany({
    where: { enabled: true, reviewState: { in: ["approved", "published"] }, ...(only ? { id: only } : {}) },
  });
  const targets = usable.filter((s) => s.kind === "tafsir" || s.kind === "curated");
  if (!targets.length) log("no enabled, approved tafsir/curated sources to index");
  if (reset) {
    for (const s of targets) await prisma.knowledgeChunk.deleteMany({ where: { sourceId: s.id } });
    log("reset: removed existing chunks for", targets.map((t) => t.id).join(", "));
  }

  // 3. Build chunks
  const pending: PendingChunk[] = [];
  for (const s of targets) {
    const def = KNOWLEDGE_SOURCES[s.id];
    if (s.kind === "tafsir") {
      for (let surah = 1; surah <= 114; surah++) {
        const entries = await prisma.tafsirEntry.findMany({ where: { sourceId: s.id, surah }, orderBy: { ayah: "asc" } });
        for (const e of entries) {
          chunkText(e.text).forEach((text, i) => {
            pending.push({
              sourceId: s.id,
              ref: ayahRefLabel(surah, e.ayah),
              title: `${s.title} — ${ayahRefLabel(surah, e.ayah)}`,
              kind: "tafsir",
              author: s.publisher,
              url: quranComUrl(surah, e.ayah),
              origin: "imported",
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
    } else if (def?.editorial) {
      // Editorial content: published AND not demo, at both story and chapter level.
      const stories = await prisma.story.findMany({
        where: { isDemo: false, reviewState: "published" },
        include: { chapters: { where: { isDemo: false, reviewState: "published" }, include: { ayahRefs: true } } },
      });
      log(`editorial: ${stories.length} published, non-demo stories eligible`);
      for (const st of stories) {
        if (st.intro) {
          pending.push({ sourceId: s.id, ref: `قصة: ${st.title}`, title: st.title, kind: "curated", author: s.publisher, url: null, origin: "editorial", ayahKey: null, surah: st.surahs[0] ?? null, ayahFrom: null, ayahTo: null, text: st.intro, hash: contentHash(s.id, st.slug, "intro", st.intro) });
        }
        for (const c of st.chapters) {
          const r = c.ayahRefs[0];
          const ref = r ? `${st.title} — ${c.title} (${ayahRefLabel(r.surah, r.fromAyah, r.toAyah)})` : `${st.title} — ${c.title}`;
          const text = `${c.title}: ${c.summary}`;
          pending.push({ sourceId: s.id, ref, title: `${st.title} — ${c.title}`, kind: "curated", author: s.publisher, url: null, origin: "editorial", ayahKey: r ? `${r.surah}:${r.fromAyah}` : null, surah: r?.surah ?? null, ayahFrom: r?.fromAyah ?? null, ayahTo: r?.toAyah ?? null, text, hash: contentHash(s.id, st.slug, c.id, text) });
        }
      }
    }
  }
  log(`built ${pending.length} chunks from ${targets.map((t) => t.id).join(", ") || "—"}`);

  // 4. Skip already-indexed chunks, embed the rest
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
      // Only content that already passed the checks above is inserted, and it is inserted as
      // published + not demo; everything else was filtered out before this point.
      await prisma.$executeRawUnsafe(
        `INSERT INTO "KnowledgeChunk"
           (id, "sourceId", ref, "ayahKey", surah, "ayahFrom", "ayahTo", text, "contentHash", embedding, "createdAt",
            title, kind, author, language, url, origin, "isDemo", "reviewState", "importBatchId")
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8, $9::vector, now(),
            $10, $11::"KnowledgeKind", $12, 'ar', $13, $14::"ContentOrigin", false, 'published'::"ReviewState", $15)
         ON CONFLICT ("sourceId", "contentHash") DO NOTHING`,
        c.sourceId, c.ref, c.ayahKey, c.surah, c.ayahFrom, c.ayahTo, c.text, c.hash, vec,
        c.title, c.kind, c.author, c.url, c.origin, batchId,
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
