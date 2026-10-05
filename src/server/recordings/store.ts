/**
 * Voice-recording retention (privacy-first).
 *
 * Default: RECORDING_RETENTION_DAYS=0 → audio is transcribed in memory and
 * discarded; nothing is written anywhere. Audio is persisted ONLY when BOTH
 * the server allows it (RECORDING_RETENTION_DAYS > 0) AND the signed-in user
 * opted in (UserProfile.keepRecordings). Stored files get an expiry and are
 * removed by purgeExpiredRecordings() (called from the cron route) and on
 * account deletion.
 *
 * The local-filesystem store is for single-server deployments; implement
 * `RecordingStore` over S3/R2/GCS (with server-side encryption + lifecycle
 * rules matching the retention) for anything larger.
 */
import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../env";
import { extensionFor } from "../stt/mime";

export interface RecordingStore {
  put(userId: string, audio: ArrayBuffer, mimeType: string): Promise<string>;
  delete(key: string): Promise<void>;
  deleteUser(userId: string): Promise<void>;
}

const SAFE = /^[A-Za-z0-9_-]+$/;

export class LocalRecordingStore implements RecordingStore {
  constructor(private root = path.resolve(env.recordingsDir())) {}

  async put(userId: string, audio: ArrayBuffer, mimeType: string): Promise<string> {
    if (!SAFE.test(userId)) throw new Error("invalid user id");
    const dir = path.join(this.root, userId);
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const key = `${userId}/${randomUUID()}.${extensionFor(mimeType)}`;
    await writeFile(path.join(this.root, key), Buffer.from(audio), { mode: 0o600 });
    return key;
  }

  async delete(key: string): Promise<void> {
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) return; // never escape the root
    await rm(full, { force: true });
  }

  async deleteUser(userId: string): Promise<void> {
    if (!SAFE.test(userId)) return;
    await rm(path.join(this.root, userId), { recursive: true, force: true });
  }
}

let store: RecordingStore | null = null;
export function getRecordingStore(): RecordingStore {
  return (store ??= new LocalRecordingStore());
}

/** Whether audio for this user may be kept, and until when. */
export async function retentionFor(userId: string | null): Promise<Date | null> {
  const days = env.recordingRetentionDays();
  if (!userId || days <= 0) return null;
  const { getPrisma } = await import("../db");
  const prisma = await getPrisma();
  const profile = await prisma.userProfile.findUnique({ where: { userId }, select: { keepRecordings: true } });
  if (!profile?.keepRecordings) return null;
  return new Date(Date.now() + days * 86_400_000);
}

/** Delete audio whose retention has expired. Returns the number purged. */
export async function purgeExpiredRecordings(now = new Date()): Promise<number> {
  const { getPrisma } = await import("../db");
  const prisma = await getPrisma();
  const s = getRecordingStore();
  let purged = 0;
  for (;;) {
    const batch = await prisma.recitationSession.findMany({
      where: { audioStorageKey: { not: null }, audioExpiresAt: { lte: now } },
      select: { id: true, audioStorageKey: true },
      take: 200,
    });
    if (!batch.length) break;
    for (const row of batch) {
      if (row.audioStorageKey) await s.delete(row.audioStorageKey).catch((e) => console.warn("[recordings] delete failed", e));
    }
    await prisma.recitationSession.updateMany({
      where: { id: { in: batch.map((b) => b.id) } },
      data: { audioStorageKey: null, audioMimeType: null, audioExpiresAt: null },
    });
    purged += batch.length;
  }
  return purged;
}
