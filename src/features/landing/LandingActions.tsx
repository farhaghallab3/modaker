"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, ButtonLink, cn } from "@/components/ui/primitives";
import { useApp } from "@/lib/store/AppProvider";

/** Starts the seeded demo and goes straight to the dashboard. */
export function DemoButton({
  className,
  variant = "ghost",
  size = "sm",
  children = "جرّب النسخة التجريبية",
}: {
  className?: string;
  variant?: "ghost" | "primary" | "secondary" | "quiet";
  size?: "sm" | "md" | "lg";
  children?: React.ReactNode;
}) {
  const { actions } = useApp();
  const router = useRouter();
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      onClick={() => {
        actions.startDemo();
        router.push("/dashboard");
      }}
    >
      {children}
    </Button>
  );
}

/** Header actions: signed-in learners get a way back to their dashboard. */
export function LandingHeaderActions() {
  const { state, ready } = useApp();
  const signedIn = ready && !!state.session && !!state.profile?.onboarded;

  if (signedIn) {
    return (
      <ButtonLink href="/dashboard" size="sm" iconEnd="forward">
        متابعة رحلتك
      </ButtonLink>
    );
  }

  return (
    <div className="flex items-center gap-1 sm:gap-2">
      <Link
        href="/login"
        className={cn("inline-flex h-9 items-center rounded-xl px-3 text-sm text-forest transition-colors hover:bg-parchment")}
      >
        تسجيل الدخول
      </Link>
      <DemoButton className="hidden sm:inline-flex" />
    </div>
  );
}
