"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Button, cn, EmptyState } from "@/components/ui/primitives";
import { relativeTime } from "@/features/shared/format";
import { useApp } from "@/lib/store/AppProvider";
import { derivedReminders } from "@/lib/store/selectors";
import type { AppNotification, NotificationKind } from "@/lib/types";

const KIND_ICON: Record<NotificationKind, IconName> = {
  "daily-wird": "leaf",
  "review-due": "review",
  "welcome-back": "lamp",
  "goal-complete": "checkCircle",
  streak: "flame",
};

/**
 * Notifications list: today's live reminders (derived from progress, cannot be
 * dismissed — they disappear once done) followed by stored notifications.
 * Reused by /notifications; `limit` + `compact` suit small surfaces.
 */
export function NotificationPanel({ limit, compact = false }: { limit?: number; compact?: boolean }) {
  const { state, actions } = useApp();
  const reminders = useMemo(() => derivedReminders(state), [state]);
  const stored = useMemo(
    () => [...state.notifications].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit),
    [state.notifications, limit],
  );
  const unread = state.notifications.filter((x) => !x.read).length;

  if (!reminders.length && !stored.length) {
    return (
      <EmptyState
        icon="bell"
        title="لا تنبيهات الآن"
        body="سنذكّرك بوردك ومراجعاتك في وقتها. يمكنك ضبط التذكيرات من الإعدادات."
        action={
          <Link href="/settings" className="text-sm font-medium text-olive underline underline-offset-4 hover:text-forest">
            إعدادات التذكير
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-8">
      {reminders.length ? (
        <section aria-labelledby="np-today">
          <h2 id="np-today" className="text-xs font-medium text-muted mb-3">
            تذكيرات اليوم
          </h2>
          <ul className="space-y-2">
            {reminders.map((r) => (
              <li key={r.id}>
                <ReminderRow item={r} compact={compact} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {stored.length ? (
        <section aria-labelledby="np-all">
          <div className="flex items-center justify-between gap-3 mb-1">
            <h2 id="np-all" className="text-xs font-medium text-muted">
              كل التنبيهات
            </h2>
            {unread ? (
              <Button variant="quiet" size="sm" icon="check" onClick={actions.markAllNotificationsRead}>
                تعليم الكل كمقروء
              </Button>
            ) : null}
          </div>
          <ul className="divide-y divide-line">
            {stored.map((item) => (
              <li key={item.id}>
                <StoredRow item={item} compact={compact} onRead={() => actions.markNotificationRead(item.id)} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function KindIcon({ kind, tone }: { kind: NotificationKind; tone: "forest" | "soft" | "muted" }) {
  return (
    <span
      className={cn(
        "grid place-items-center size-10 shrink-0 rounded-xl",
        tone === "forest" ? "bg-forest text-sand" : tone === "soft" ? "bg-olive-100 text-olive" : "bg-parchment text-muted",
      )}
      aria-hidden
    >
      <Icon name={KIND_ICON[kind] ?? "bell"} size={19} />
    </span>
  );
}

function ReminderRow({ item, compact }: { item: AppNotification; compact: boolean }) {
  const content = (
    <>
      <KindIcon kind={item.kind} tone="forest" />
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-forest">{item.title}</span>
        <span className={cn("block text-sm text-muted leading-6", compact && "truncate")}>{item.body}</span>
      </span>
      {item.href ? <Icon name="forward" size={18} className="text-muted self-center" /> : null}
    </>
  );
  const cls = "flex gap-3 rounded-2xl bg-cream/70 ring-1 ring-sand/25 p-3.5 transition-colors";
  return item.href ? (
    <Link href={item.href} className={cn(cls, "hover:bg-cream")}>
      {content}
    </Link>
  ) : (
    <div className={cls}>{content}</div>
  );
}

function StoredRow({ item, compact, onRead }: { item: AppNotification; compact: boolean; onRead: () => void }) {
  const body = (
    <>
      <KindIcon kind={item.kind} tone={item.read ? "muted" : "soft"} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className={cn("truncate", item.read ? "text-ink/75" : "font-semibold text-forest")}>{item.title}</span>
          {!item.read ? (
            <>
              <span className="size-2 shrink-0 rounded-full bg-terracotta" aria-hidden />
              <span className="sr-only">(غير مقروء)</span>
            </>
          ) : null}
        </span>
        <span className={cn("block text-sm text-muted leading-6", compact && "truncate")}>{item.body}</span>
        <time dateTime={item.createdAt} className="block text-[0.72rem] text-muted/80 mt-0.5">
          {relativeTime(item.createdAt)}
        </time>
      </span>
    </>
  );

  return (
    <div className="flex items-start gap-2 py-3.5">
      {item.href ? (
        <Link href={item.href} onClick={onRead} className="flex flex-1 min-w-0 gap-3 rounded-xl -m-1 p-1 hover:bg-parchment/60">
          {body}
        </Link>
      ) : (
        <div className="flex flex-1 min-w-0 gap-3">{body}</div>
      )}
      {!item.read ? (
        <button
          type="button"
          onClick={onRead}
          className="shrink-0 h-8 rounded-lg px-2.5 text-xs text-muted hover:bg-parchment hover:text-forest"
          aria-label={`تعليم «${item.title}» كمقروء`}
        >
          تمّت القراءة
        </button>
      ) : null}
    </div>
  );
}
