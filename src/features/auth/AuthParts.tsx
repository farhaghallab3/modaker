"use client";

import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { useApp } from "@/lib/store/AppProvider";

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
        <p>تسجيل الدخول وإنشاء الحسابات غير مفعّلين على هذا الخادم بعد. يمكنك تجربة مُدّكِر دون حساب في الوقت الحالي.</p>
      </div>
    </div>
  );
}

/** "جرّب دون حساب" — loads the demo learner and opens the dashboard. */
export function DemoLink() {
  const { actions } = useApp();
  const router = useRouter();
  return (
    <div className="mt-8 flex w-full items-center gap-4 text-sm text-muted">
      <span className="h-px flex-1 bg-line" />
      <button
        type="button"
        onClick={() => {
          actions.startDemo();
          router.push("/dashboard");
        }}
        className="inline-flex items-center gap-1.5 rounded-lg px-1 text-forest underline-offset-4 hover:underline"
      >
        <Icon name="leaf" size={16} className="text-olive" />
        جرّب دون حساب
      </button>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}
