"use client";

import { Icon } from "@/components/ui/Icon";

/** Only allow same-origin, path-only redirects. */
export function safeNext(raw: string | null): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return null;
  return raw;
}

/** Shown instead of the Clerk form while Clerk keys are not configured on this server. */
export function AuthUnavailable() {
  return (
    <div className="w-full animate-rise">
      <h1 className="font-display text-4xl leading-tight text-forest">تسجيل الدخول</h1>
      <div role="status" className="mt-6 flex items-start gap-2.5 rounded-2xl bg-sand-100 px-4 py-3 text-sm leading-7 text-sand-800">
        <Icon name="info" size={18} className="mt-1" />
        <p>تسجيل الدخول وإنشاء الحسابات غير مفعّلين على هذا الخادم بعد. حاول مرة أخرى لاحقًا.</p>
      </div>
    </div>
  );
}
