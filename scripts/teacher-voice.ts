/**
 * Records the teacher's fixed feedback sentences ONCE, at build time, into static files:
 *   public/teacher-voice/<key>.<wav|mp3> + manifest.json
 * so the recite page can play them instantly, even on a learner's first visit (no voice-service call at run time).
 *
 *   npx tsx scripts/teacher-voice.ts      (runs automatically before `npm run build`)
 *
 * Needs GEMINI_API_KEY or OPENAI_API_KEY at build time. Never fails the build: without a key, or on any error,
 * the page falls back to preparing the voice at run time.
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { TEACHER_PHRASES, teacherPhraseHash } from "@/lib/recitation/coach-feedback";
import { synthesizeSpeech, ttsEngine } from "@/server/tts/speech";
import { env } from "@/server/env";

const OUT = path.join(process.cwd(), "public", "teacher-voice");

async function main() {
  await rm(OUT, { recursive: true, force: true });
  if (!env.assistantTts() || !ttsEngine()) {
    console.log("[teacher-voice] no voice key at build time; skipped (the page will prepare the voice at run time).");
    return;
  }
  await mkdir(OUT, { recursive: true });
  const manifest: Record<string, { file: string; hash: string }> = {};
  for (const [key, text] of Object.entries(TEACHER_PHRASES)) {
    const { audio, contentType } = await synthesizeSpeech(text);
    const file = `${key}.${contentType === "audio/mpeg" ? "mp3" : "wav"}`;
    await writeFile(path.join(OUT, file), Buffer.from(audio));
    manifest[key] = { file, hash: teacherPhraseHash(text) };
    console.log(`[teacher-voice] ${file} (${Math.round(audio.byteLength / 1024)} KB)`);
  }
  await writeFile(path.join(OUT, "manifest.json"), JSON.stringify(manifest));
}

main().catch(async (e) => {
  console.warn("[teacher-voice] could not record the teacher's voice; the page will prepare it at run time:", (e as Error).message);
  await rm(OUT, { recursive: true, force: true }).catch(() => {});
});
