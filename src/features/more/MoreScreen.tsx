"use client";

import Link from "next/link";
import { Page, PageHeader } from "@/components/layout/PageHeader";
import { Icon, type IconName } from "@/components/ui/Icon";
import { useApp } from "@/lib/store/AppProvider";
import { derivedReminders } from "@/lib/store/selectors";
import { toArabicDigits } from "@/lib/quran/surahs";

interface Entry {
  href: string;
  label: string;
  description: string;
  icon: IconName;
}

const GROUPS: { title: string; items: Entry[] }[] = [
  {
    title: "افهم",
    items: [
      { href: "/stories", label: "قصص القرآن", description: "القصص فصلًا فصلًا مع آياتها وتفسيرها", icon: "scroll" },
      { href: "/videos", label: "المرئيات", description: "مقاطع مختارة مرتبطة بما تحفظ", icon: "video" },
      { href: "/assistant", label: "اسأل مُدّكِر", description: "إجابات من مصادر معتمدة مع مراجعها", icon: "lamp" },
    ],
  },
  {
    title: "رحلتك",
    items: [
      { href: "/progress", label: "التقدم", description: "ما حفظته، وثباتك، ودقة تسميعك", icon: "chart" },
      { href: "/goals", label: "الأهداف", description: "وردك اليومي ومحطتك القادمة", icon: "target" },
    ],
  },
  {
    title: "الحساب",
    items: [
      { href: "/notifications", label: "التنبيهات", description: "تذكيرات الورد والمراجعة", icon: "bell" },
      { href: "/settings", label: "الإعدادات", description: "الملف والتذكيرات والخصوصية", icon: "settings" },
    ],
  },
];

export function MoreScreen() {
  const { state } = useApp();
  const unread = state.notifications.filter((n) => !n.read).length + derivedReminders(state).length;

  return (
    <Page narrow>
      <PageHeader title="المزيد" />
      <div className="space-y-9">
        {GROUPS.map((g) => (
          <section key={g.title} aria-label={g.title}>
            <h2 className="text-xs font-medium text-muted mb-2 px-1">{g.title}</h2>
            <ul className="rounded-[var(--radius-card)] bg-white/70 ring-1 ring-line divide-y divide-line overflow-hidden">
              {g.items.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="flex items-center gap-4 px-4 py-4 transition-colors hover:bg-parchment/60">
                    <span className="grid place-items-center size-10 shrink-0 rounded-xl bg-olive-100 text-olive" aria-hidden>
                      <Icon name={item.icon} size={20} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-forest">{item.label}</span>
                      <span className="block text-xs text-muted mt-0.5 truncate">{item.description}</span>
                    </span>
                    {item.href === "/notifications" && unread ? (
                      <span className="min-w-6 h-6 px-1.5 grid place-items-center rounded-full bg-terracotta text-cream text-xs num">
                        {toArabicDigits(unread)}
                        <span className="sr-only"> تنبيهات جديدة</span>
                      </span>
                    ) : null}
                    <Icon name="forward" size={18} className="text-muted" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Page>
  );
}
