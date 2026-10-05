"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState, type ReactNode } from "react";
import { Page, PageHeader } from "@/components/layout/PageHeader";
import { Icon } from "@/components/ui/Icon";
import { Badge, Button, cn, ConfirmationModal, Field, inputClass, Segmented, Spinner, Toggle } from "@/components/ui/primitives";
import { useApp } from "@/lib/store/AppProvider";
import { useTheme, type ThemePreference } from "@/lib/theme";
import type { ExperienceLevel, NotificationPreferences } from "@/lib/types";
import { usePushSubscription } from "./usePushSubscription";

const LEVELS: { value: ExperienceLevel; label: string }[] = [
  { value: "beginner", label: "مبتدئ" },
  { value: "intermediate", label: "متوسط" },
  { value: "advanced", label: "متقدم" },
];

const FREQUENCIES: { value: NotificationPreferences["frequency"]; label: string }[] = [
  { value: "daily", label: "كل يوم" },
  { value: "weekdays", label: "أيام العمل" },
  { value: "custom", label: "أيام أختارها" },
];

const THEMES: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "فاتح" },
  { value: "dark", label: "داكن" },
  { value: "system", label: "حسب الجهاز" },
];

const DAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"]; // 0 = Sunday

function Section({ id, title, description, children }: { id?: string; title: string; description?: string; children: ReactNode }) {
  const hid = useId();
  return (
    <section id={id} aria-labelledby={hid} className="grid gap-5 border-t hairline py-9 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-12 scroll-mt-20">
      <div>
        <h2 id={hid} className="font-display text-2xl text-forest">
          {title}
        </h2>
        {description ? <p className="mt-1 text-sm leading-6 text-muted">{description}</p> : null}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

export function SettingsScreen() {
  const { state, actions } = useApp();
  const router = useRouter();
  const prefs = state.notificationPrefs;
  const profile = state.profile;
  const [name, setName] = useState(profile?.name ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const push = usePushSubscription();
  const theme = useTheme();
  const timeId = useId();

  useEffect(() => setName(profile?.name ?? ""), [profile?.name]);
  const nameDirty = name.trim() !== (profile?.name ?? "") && name.trim().length > 0;

  function saveName() {
    if (nameDirty) actions.updateProfile({ name: name.trim() });
  }

  function toggleDay(d: number) {
    const set = new Set(prefs.customDays);
    if (set.has(d)) set.delete(d);
    else set.add(d);
    if (set.size === 0) return; // keep at least one day
    actions.updatePrefs({ customDays: [...set].sort((a, b) => a - b) });
  }

  async function signOut() {
    setSigningOut(true);
    await actions.signOut();
    router.replace("/login");
  }

  async function deleteAll() {
    await actions.deleteAllData();
    router.replace("/");
  }

  return (
    <Page narrow>
      <PageHeader title="الإعدادات" description="خصّص مُدّكِر ليناسب وقتك وطريقتك." />

      {/* ── Profile ─────────────────────────────────────────────── */}
      <Section title="ملفك" description="كيف نناديك، وأين أنت في رحلة الحفظ.">
        <div className="space-y-6">
          <Field label="الاسم">
            {(id) => (
              <div className="flex gap-2">
                <input
                  id={id}
                  className={inputClass}
                  value={name}
                  autoComplete="name"
                  onChange={(e) => setName(e.target.value)}
                  onBlur={saveName}
                  onKeyDown={(e) => e.key === "Enter" && saveName()}
                />
                {nameDirty ? (
                  <Button variant="secondary" onClick={saveName}>
                    حفظ
                  </Button>
                ) : null}
              </div>
            )}
          </Field>
          {profile?.email ? (
            <p className="text-sm text-muted">
              البريد الإلكتروني: <span className="text-ink" dir="ltr">{profile.email}</span>
              {state.demo ? <Badge tone="sand" className="ms-2">نسخة تجريبية</Badge> : null}
            </p>
          ) : null}
          <div>
            <p className="text-sm font-medium text-forest mb-2">مستواك</p>
            <Segmented
              label="مستواك"
              options={LEVELS}
              value={profile?.level ?? "beginner"}
              onChange={(level) => actions.updateProfile({ level })}
            />
          </div>
        </div>
      </Section>

      {/* ── Appearance ──────────────────────────────────────────── */}
      <Section title="المظهر" description="الوضع الداكن أريح للعين في القراءة والحفظ ليلًا.">
        <Segmented label="مظهر التطبيق" options={THEMES} value={theme.preference} onChange={theme.setPreference} />
      </Section>

      {/* ── Reminders ───────────────────────────────────────────── */}
      <Section id="reminders" title="التذكيرات" description="تذكير لطيف واحد في وقته خير من تنبيهات كثيرة.">
        <div className="divide-y divide-line">
          <Toggle
            label="تذكير الورد اليومي"
            description="إن لم تحفظ وردك بعد في الوقت الذي تختاره"
            checked={prefs.dailyReminder}
            onChange={(v) => actions.updatePrefs({ dailyReminder: v })}
          />
          <Toggle
            label="تذكير المراجعة"
            description="حين يحين موعد مراجعة مقطع حفظته"
            checked={prefs.reviewReminder}
            onChange={(v) => actions.updatePrefs({ reviewReminder: v })}
          />
          <div className="flex flex-wrap items-center justify-between gap-3 py-4">
            <label htmlFor={timeId} className="text-sm font-medium text-forest">
              الوقت المفضّل
            </label>
            <input
              id={timeId}
              type="time"
              value={prefs.preferredTime}
              onChange={(e) => e.target.value && actions.updatePrefs({ preferredTime: e.target.value })}
              className={cn(inputClass, "w-36 text-center")}
              dir="ltr"
            />
          </div>
          <div className="py-4 space-y-3">
            <p className="text-sm font-medium text-forest">التكرار</p>
            <Segmented label="تكرار التذكير" options={FREQUENCIES} value={prefs.frequency} onChange={(frequency) => actions.updatePrefs({ frequency })} />
            {prefs.frequency === "custom" ? (
              <div role="group" aria-label="أيام التذكير" className="flex flex-wrap gap-2 pt-1">
                {DAYS.map((d, i) => {
                  const on = prefs.customDays.includes(i);
                  return (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleDay(i)}
                      className={cn(
                        "h-9 rounded-full px-3.5 text-sm transition-colors",
                        on ? "bg-olive text-cream" : "bg-white ring-1 ring-inset ring-line text-muted hover:text-forest",
                      )}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
          <PushControl push={push} />
        </div>
      </Section>

      {/* ── Privacy ─────────────────────────────────────────────── */}
      <Section title="الخصوصية" description="صوتك وتقدّمك ملكك.">
        <div className="divide-y divide-line">
          <Toggle
            label="الاحتفاظ بتسجيلات التسميع"
            description="مغلق افتراضيًا"
            checked={state.privacy.keepRecordings}
            onChange={(v) => actions.updatePrivacy({ keepRecordings: v, retentionDays: v ? state.privacy.retentionDays || 30 : 0 })}
          />
          {state.privacy.keepRecordings ? (
            <div className="flex flex-wrap items-center justify-between gap-3 py-4">
              <p className="text-sm font-medium text-forest">تُحذف تلقائيًا بعد</p>
              <Segmented
                label="مدة الاحتفاظ بالتسجيلات"
                options={[
                  { value: 7, label: "٧ أيام" },
                  { value: 30, label: "٣٠ يومًا" },
                  { value: 90, label: "٩٠ يومًا" },
                ]}
                value={state.privacy.retentionDays}
                onChange={(retentionDays) => actions.updatePrivacy({ retentionDays })}
              />
            </div>
          ) : null}
          <p className="flex gap-2.5 py-4 text-sm leading-7 text-muted">
            <Icon name="shield" size={18} className="mt-1 shrink-0 text-olive" />
            <span>
              لا نحتفظ بتسجيلاتك الصوتية افتراضيًا؛ يُحوَّل صوتك إلى نص لمطابقته بالآيات ثم يُحذف التسجيل مباشرة. وإن فعّلت الاحتفاظ،
              تُحذف التسجيلات تلقائيًا بعد المدة التي تختارها، ويمكنك حذفها مع بقية بياناتك في أي وقت.
            </span>
          </p>
        </div>
      </Section>

      {/* ── Account ─────────────────────────────────────────────── */}
      <Section title="الحساب">
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-forest">تسجيل الخروج</p>
              <p className="text-xs text-muted mt-0.5">يبقى تقدّمك محفوظًا لتعود إليه.</p>
            </div>
            <Button variant="ghost" icon="logout" onClick={signOut} loading={signingOut}>
              تسجيل الخروج
            </Button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-terracotta-50/60 px-4 py-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-terracotta">حذف كل بياناتي</p>
              <p className="text-xs text-muted mt-0.5 leading-5">يحذف الحساب والتقدّم والتسجيلات نهائيًا من جهازك ومن خوادمنا.</p>
            </div>
            <Button variant="danger" icon="trash" onClick={() => setConfirmDelete(true)}>
              حذف البيانات
            </Button>
          </div>
        </div>
      </Section>

      <ConfirmationModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => void deleteAll()}
        title="حذف كل بياناتك؟"
        body="سيُحذف حسابك وتقدّمك في الحفظ والمراجعة وتسجيلاتك نهائيًا، ولا يمكن التراجع عن ذلك."
        confirmLabel="نعم، احذف كل شيء"
        tone="danger"
      />
    </Page>
  );
}

function PushControl({ push }: { push: ReturnType<typeof usePushSubscription> }) {
  const { status, busy, error, enable, disable } = push;
  const copy: Record<typeof status, string> = {
    checking: "نتحقق من دعم متصفحك…",
    unsupported: "متصفحك لا يدعم تنبيهات الويب. ستصلك التذكيرات داخل التطبيق.",
    "not-configured": "تنبيهات المتصفح غير متاحة في هذه النسخة بعد. ستصلك التذكيرات داخل التطبيق.",
    denied: "التنبيهات محظورة لهذا الموقع. يمكنك السماح بها من إعدادات المتصفح (رمز القفل بجوار العنوان)، ثم العودة هنا.",
    off: "تصلك التذكيرات حتى والتطبيق مغلق.",
    on: "مفعّلة على هذا الجهاز.",
  };
  return (
    <div className="py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-forest flex items-center gap-2">
            تنبيهات المتصفح
            {status === "on" ? <Badge>مفعّلة</Badge> : null}
          </p>
          <p className="text-xs text-muted mt-0.5 leading-5" aria-live="polite">
            {status === "checking" ? <Spinner className="me-1.5 size-3 align-[-0.15em]" /> : null}
            {copy[status]}
          </p>
        </div>
        {status === "off" ? (
          <Button variant="secondary" icon="bell" onClick={() => void enable()} loading={busy}>
            تفعيل
          </Button>
        ) : status === "on" ? (
          <Button variant="quiet" onClick={() => void disable()} loading={busy}>
            إيقاف
          </Button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-xs text-terracotta">
          {error}
        </p>
      ) : null}
    </div>
  );
}
