"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { AssistantLauncher } from "@/components/assistant/AssistantLauncher";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Badge, cn, Spinner } from "@/components/ui/primitives";
import { t } from "@/lib/i18n";
import { useOnline } from "@/lib/api";
import { useApp } from "@/lib/store/AppProvider";
import { derivedReminders } from "@/lib/store/selectors";
import { Logo } from "./Logo";

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  match?: (p: string) => boolean;
}

const PRIMARY: NavItem[] = [
  { href: "/dashboard", label: t("nav.home"), icon: "home" },
  { href: "/quran", label: t("nav.mushaf"), icon: "mushaf", match: (p) => p.startsWith("/quran") || p.startsWith("/memorize") },
  { href: "/recite", label: t("nav.recite"), icon: "mic" },
  { href: "/review", label: t("nav.review"), icon: "review" },
];

const SECONDARY: NavItem[] = [
  { href: "/stories", label: t("nav.stories"), icon: "scroll" },
  { href: "/videos", label: t("nav.videos"), icon: "video" },
  { href: "/assistant", label: t("nav.assistant"), icon: "chat" },
  { href: "/progress", label: t("nav.progress"), icon: "chart" },
  { href: "/goals", label: t("nav.goals"), icon: "target" },
];

const MORE_PATHS = ["/more", "/stories", "/videos", "/assistant", "/progress", "/goals", "/notifications", "/settings"];

function isActive(item: NavItem, path: string) {
  return item.match ? item.match(path) : path === item.href || path.startsWith(item.href + "/");
}

/** Routes that run full-bleed (focus modes) hide the chrome on mobile. */
function isFocusMode(path: string) {
  return path.startsWith("/memorize") || path === "/recite";
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const { state, ready } = useApp();
  const online = useOnline();

  // Route guard: signed-out → login; signed-in but not onboarded → onboarding.
  useEffect(() => {
    if (!ready) return;
    if (!state.session) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    else if (!state.profile?.onboarded) router.replace("/onboarding");
  }, [ready, state.session, state.profile?.onboarded, router, pathname]);

  if (!ready || !state.session || !state.profile?.onboarded) {
    return (
      <div className="min-h-dvh grid place-items-center text-olive">
        <Spinner className="size-6" />
      </div>
    );
  }

  const unread = state.notifications.filter((n) => !n.read).length + derivedReminders(state).length;
  const focus = isFocusMode(pathname);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[17rem_1fr]">
      {/* ── Desktop / tablet-landscape sidebar ─────────────────────── */}
      <aside className="hidden lg:flex flex-col sticky top-0 h-dvh border-e hairline bg-parchment/60 px-4 py-6">
        <Link href="/dashboard" className="px-3 mb-8 inline-flex" aria-label="مُدّكِر — الرئيسية">
          <Logo />
        </Link>
        <nav aria-label="التنقل الرئيسي" className="flex-1 overflow-y-auto">
          <ul className="space-y-1">
            {PRIMARY.map((item) => (
              <SideLink key={item.href} item={item} active={isActive(item, pathname)} />
            ))}
          </ul>
          <p className="px-3 mt-8 mb-2 text-xs font-medium text-muted">اكتشف</p>
          <ul className="space-y-1">
            {SECONDARY.map((item) => (
              <SideLink key={item.href} item={item} active={isActive(item, pathname)} />
            ))}
          </ul>
        </nav>
        <div className="border-t hairline pt-4 space-y-1">
          <SideLink
            item={{ href: "/notifications", label: t("nav.notifications"), icon: "bell" }}
            active={pathname.startsWith("/notifications")}
            count={unread}
          />
          <SideLink item={{ href: "/settings", label: t("nav.settings"), icon: "settings" }} active={pathname.startsWith("/settings")} />
          <div className="flex items-center gap-3 px-3 pt-3">
            <span className="grid place-items-center size-9 rounded-full bg-olive-100 text-forest font-semibold">
              {(state.profile.name || "؟").trim().charAt(0)}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-forest truncate">{state.profile.name || "أهلًا بك"}</p>
              <p className="text-xs text-muted truncate">{state.profile.email}</p>
            </div>
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex flex-col">
        {/* ── Mobile / tablet top bar ───────────────────────────────── */}
        {!focus ? (
          <header className="lg:hidden sticky top-0 z-30 flex items-center justify-between h-14 px-4 bg-paper/90 backdrop-blur border-b hairline">
            <Link href="/dashboard" aria-label="مُدّكِر — الرئيسية">
              <Logo compact />
            </Link>
            <div className="flex items-center gap-1">
              <Link
                href="/notifications"
                aria-label={`التنبيهات${unread ? ` (${unread} جديدة)` : ""}`}
                className="relative grid place-items-center size-10 rounded-xl text-forest hover:bg-parchment"
              >
                <Icon name="bell" size={21} />
                {unread ? <span className="absolute top-2 end-2 size-2 rounded-full bg-terracotta" /> : null}
              </Link>
            </div>
          </header>
        ) : null}

        {!online ? (
          <div role="status" className="flex items-center justify-center gap-2 bg-sand-100 text-sand-800 text-sm py-2 px-4">
            <Icon name="wifiOff" size={16} />
            أنت غير متصل. تقدّمك محفوظ على جهازك وسيُزامَن عند عودة الاتصال.
          </div>
        ) : null}

        <main id="main" className={cn("flex-1", focus ? "" : "pb-28 lg:pb-12")}>
          {children}
        </main>
      </div>

      {/* ── Mobile bottom navigation ───────────────────────────────── */}
      {!focus ? (
        <nav
          aria-label="التنقل السفلي"
          className="lg:hidden fixed inset-x-0 bottom-0 z-30 bg-paper/95 backdrop-blur border-t hairline pb-[env(safe-area-inset-bottom)]"
        >
          <ul className="grid grid-cols-5 h-16">
            {[...PRIMARY, { href: "/more", label: t("nav.more"), icon: "grid" as IconName, match: (p: string) => MORE_PATHS.some((m) => p.startsWith(m)) }].map(
              (item) => {
                const active = isActive(item, pathname);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "h-full flex flex-col items-center justify-center gap-1 text-[0.7rem] transition-colors",
                        active ? "text-forest font-semibold" : "text-muted",
                      )}
                    >
                      <span className={cn("grid place-items-center h-7 w-12 rounded-full transition-colors", active && "bg-olive-100")}>
                        <Icon name={item.icon} size={20} />
                      </span>
                      {item.label}
                    </Link>
                  </li>
                );
              },
            )}
          </ul>
        </nav>
      ) : null}

      {pathname.startsWith("/assistant") || focus ? null : <AssistantLauncher />}
    </div>
  );
}

function SideLink({ item, active, count }: { item: NavItem; active: boolean; count?: number }) {
  return (
    <li className="list-none">
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center gap-3 h-11 px-3 rounded-xl text-[0.95rem] transition-colors",
          active ? "bg-white text-forest font-semibold shadow-[var(--shadow-soft)]" : "text-ink/75 hover:bg-white/60 hover:text-forest",
        )}
      >
        <Icon name={item.icon} size={19} className={active ? "text-olive" : ""} />
        <span className="flex-1">{item.label}</span>
        {count ? (
          <span className="min-w-5 h-5 px-1.5 grid place-items-center rounded-full bg-terracotta text-cream text-[0.68rem] num">{count}</span>
        ) : null}
      </Link>
    </li>
  );
}
