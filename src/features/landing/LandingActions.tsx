"use client";

import { useRouter } from "next/navigation";
import { Button, ButtonLink } from "@/components/ui/primitives";
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

/**
 * Header actions. "متابعة رحلتك": signed-out visitors go to login (with a link to register);
 * signed-in learners go to their journey (onboarding first if they haven't finished it).
 */
export function LandingHeaderActions() {
  const { state, ready } = useApp();
  const signedIn = ready && !!state.session && !state.demo;
  const href = signedIn ? (state.profile?.onboarded ? "/dashboard" : "/onboarding") : "/login";

  return (
    <div className="flex items-center gap-1 sm:gap-2">
      {signedIn ? null : <DemoButton className="hidden sm:inline-flex" />}
      <ButtonLink href={href} size="sm" iconEnd="forward">
        متابعة رحلتك
      </ButtonLink>
    </div>
  );
}
