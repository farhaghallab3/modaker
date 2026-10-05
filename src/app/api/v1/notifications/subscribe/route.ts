/**
 * POST   /api/v1/notifications/subscribe  { subscription: PushSubscriptionJSON }  → { ok: true }
 *        (native apps later: { platform: "fcm" | "apns", token })
 * DELETE /api/v1/notifications/subscribe  { endpoint }                         → { ok: true }
 * Requires a signed-in account (reminders are computed from server-side state).
 */
import { z } from "zod";
import { requireSession } from "@/server/auth";
import { getPrisma } from "@/server/db";
import { apiError } from "@/server/errors";
import { assertSameOrigin, json, readJson, route } from "@/server/http";
import { webPushConfigured } from "@/server/notifications/web-push";

export const runtime = "nodejs";

const webSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url().max(2048).refine((u) => u.startsWith("https://")),
    expirationTime: z.number().nullable().optional(),
    keys: z.object({ p256dh: z.string().min(16).max(256), auth: z.string().min(8).max(64) }),
  }),
});
const nativeSchema = z.object({ platform: z.enum(["fcm", "apns"]), token: z.string().min(16).max(4096) });
const bodySchema = z.union([webSchema, nativeSchema]);

export const POST = route(async (req) => {
  assertSameOrigin(req);
  const { userId } = await requireSession(req);
  const body = await readJson(req, bodySchema, 16 * 1024);
  const prisma = await getPrisma();
  const userAgent = req.headers.get("user-agent")?.slice(0, 255) ?? null;

  if ("subscription" in body) {
    if (!webPushConfigured()) throw apiError(503, "push_not_configured");
    const { endpoint, keys } = body.subscription;
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { userId, platform: "web", endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent },
      update: { userId, p256dh: keys.p256dh, auth: keys.auth, userAgent, failureCount: 0 },
    });
  } else {
    await prisma.pushSubscription.upsert({
      where: { endpoint: body.token },
      create: { userId, platform: body.platform, endpoint: body.token, userAgent },
      update: { userId, platform: body.platform, userAgent, failureCount: 0 },
    });
  }
  await prisma.notificationPreference.upsert({
    where: { userId },
    create: { userId, pushEnabled: true },
    update: { pushEnabled: true },
  });
  return json({ ok: true as const });
});

export const DELETE = route(async (req) => {
  assertSameOrigin(req);
  const { userId } = await requireSession(req);
  const { endpoint } = await readJson(req, z.object({ endpoint: z.string().min(1).max(4096) }), 8 * 1024);
  const prisma = await getPrisma();
  await prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
  return json({ ok: true as const });
});
