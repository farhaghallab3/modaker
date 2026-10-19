"use client";

import { SignIn } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";
import { clerkEnabled } from "@/lib/auth/clerk-config";
import { AuthUnavailable, safeNext } from "./AuthParts";

/** Sign in with Google or email — handled entirely by Clerk. */
export function LoginScreen() {
  const next = safeNext(useSearchParams().get("next"));
  return (
    <>
      {clerkEnabled ? (
        <SignIn routing="path" path="/login" signUpUrl="/register" fallbackRedirectUrl={next ?? "/dashboard"} signUpFallbackRedirectUrl="/onboarding" />
      ) : (
        <AuthUnavailable />
      )}
    </>
  );
}
