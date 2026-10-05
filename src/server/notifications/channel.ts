/** Delivery channel abstraction: in-app (DB), web push, native push (later). */
import type { AppNotification } from "@/lib/types";

export interface ChannelResult {
  channel: string;
  /** devices/rows the notification reached */
  delivered: number;
  /** true when the in-app record already existed (dedupe hit) */
  duplicate?: boolean;
  error?: string;
}

export interface SendOptions {
  dedupeKey?: string;
}

export interface NotificationChannel {
  readonly id: string;
  send(userId: string, notification: AppNotification, opts?: SendOptions): Promise<ChannelResult>;
}

/** Payload shape the service worker (public/sw.js) expects. */
export interface PushPayload {
  id: string;
  kind: AppNotification["kind"];
  title: string;
  body: string;
  href: string;
}

export function toPushPayload(n: AppNotification): PushPayload {
  return { id: n.id, kind: n.kind, title: n.title, body: n.body, href: n.href ?? "/" };
}
