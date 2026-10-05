/**
 * In-app channel: a Notification row per message. The row doubles as the
 * dedupe record (unique userId+dedupeKey), so it is always written first.
 */
import type { AppNotification } from "@/lib/types";
import { getPrisma } from "../db";
import { toDbEnum } from "../user/mappers";
import type { ChannelResult, NotificationChannel, SendOptions } from "./channel";

export class InAppChannel implements NotificationChannel {
  readonly id = "in-app";

  async send(userId: string, n: AppNotification, opts: SendOptions = {}): Promise<ChannelResult> {
    const prisma = await getPrisma();
    try {
      await prisma.notification.create({
        data: {
          userId,
          kind: toDbEnum(n.kind) as never,
          title: n.title,
          body: n.body,
          href: n.href ?? null,
          dedupeKey: opts.dedupeKey ?? null,
          deliveredVia: [this.id],
        },
      });
      return { channel: this.id, delivered: 1 };
    } catch (e) {
      if ((e as { code?: string }).code === "P2002") return { channel: this.id, delivered: 0, duplicate: true };
      throw e;
    }
  }

  async markDelivered(userId: string, dedupeKey: string, channels: string[]) {
    const prisma = await getPrisma();
    await prisma.notification.updateMany({ where: { userId, dedupeKey }, data: { deliveredVia: { push: channels } } });
  }
}
