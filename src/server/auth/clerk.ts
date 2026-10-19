/**
 * Clerk is the identity provider (Google + email sign-in, verification, password reset).
 * Our database keeps its own `User` row for app data; it is linked to the Clerk user by
 * `clerkId` and created the first time that user reaches the API.
 */
import { getPrisma, hasDatabase } from "../db";

export function isClerkConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
}

/** The signed-in Clerk user id for this request, or null. Requires clerkMiddleware (src/middleware.ts). */
export async function currentClerkUser(): Promise<{ clerkId: string; sessionId: string | null } | null> {
  if (!isClerkConfigured()) return null;
  const { auth } = await import("@clerk/nextjs/server");
  const { userId, sessionId } = await auth();
  return userId ? { clerkId: userId, sessionId: sessionId ?? null } : null;
}

/**
 * Local user id for a Clerk user, creating (or linking by email) the row on first sight.
 * Clerk has already verified the email (Google, or Clerk's email code).
 */
export async function localUserIdFor(clerkId: string): Promise<string | null> {
  if (!hasDatabase()) return null;
  const prisma = await getPrisma();
  const linked = await prisma.user.findUnique({ where: { clerkId }, select: { id: true } });
  if (linked) return linked.id;

  const { clerkClient } = await import("@clerk/nextjs/server");
  const cu = await (await clerkClient()).users.getUser(clerkId);
  const primary = cu.emailAddresses.find((e) => e.id === cu.primaryEmailAddressId) ?? cu.emailAddresses[0];
  const email = primary?.emailAddress?.trim().toLowerCase();
  if (!email) return null;
  const name = [cu.firstName, cu.lastName].filter(Boolean).join(" ").trim() || email.split("@")[0];

  const byEmail = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (byEmail) {
    // An account from before Clerk with the same (now verified) email: link it, keep its data.
    await prisma.user.update({ where: { id: byEmail.id }, data: { clerkId, passwordHash: null } });
    return byEmail.id;
  }
  try {
    const created = await prisma.user.create({
      data: { email, clerkId, profile: { create: { name } }, notificationPreference: { create: {} } },
      select: { id: true },
    });
    return created.id;
  } catch (e) {
    // Two first requests at once: the other one created it.
    if ((e as { code?: string }).code === "P2002") {
      return (await prisma.user.findUnique({ where: { clerkId }, select: { id: true } }))?.id ?? null;
    }
    throw e;
  }
}
