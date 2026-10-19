"use client";

import { ButtonLink } from "@/components/ui/primitives";
import { useApp } from "@/lib/store/AppProvider";

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
      <ButtonLink href={href} size="sm" iconEnd="forward">
        متابعة رحلتك
      </ButtonLink>
    </div>
  );
}
