/**
 * Native push channel — STUB for the future mobile app.
 *
 * Plan:
 *  - The app registers its device token via POST /api/v1/notifications/subscribe
 *    with { platform: "fcm" | "apns", token } (stored in PushSubscription.endpoint).
 *  - Android: FCM HTTP v1 (POST https://fcm.googleapis.com/v1/projects/{id}/messages:send,
 *    OAuth2 service-account token). iOS: APNs HTTP/2 with a .p8 key (or FCM for both).
 *  - Payload mirrors PushPayload (title/body/href) with `data.href` for deep links.
 *  - Prune tokens on UNREGISTERED (FCM) / 410 (APNs), like the web channel.
 * Until implemented this channel reports 0 deliveries and never throws.
 */
import type { AppNotification } from "@/lib/types";
import type { ChannelResult, NotificationChannel } from "./channel";

export class MobilePushChannel implements NotificationChannel {
  readonly id = "mobile-push";

  async send(_userId: string, _n: AppNotification): Promise<ChannelResult> {
    return { channel: this.id, delivered: 0, error: "not_implemented" };
  }
}
