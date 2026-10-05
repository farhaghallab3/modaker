/**
 * Account lifecycle: registration and full deletion.
 * Deletion removes stored audio first (files are outside the DB), then the
 * User row — every user-owned table cascades (sessions, progress, recitations,
 * conversations + citations, notifications, push subscriptions, …).
 */
import { getPrisma } from "../db";
import { getRecordingStore } from "../recordings/store";

export async function deleteAccount(userId: string): Promise<void> {
  const prisma = await getPrisma();
  const store = getRecordingStore();

  const withAudio = await prisma.recitationSession.findMany({
    where: { userId, audioStorageKey: { not: null } },
    select: { audioStorageKey: true },
  });
  for (const r of withAudio) if (r.audioStorageKey) await store.delete(r.audioStorageKey);
  await store.deleteUser(userId); // sweep any orphans in the user's folder

  await prisma.user.delete({ where: { id: userId } });
}
