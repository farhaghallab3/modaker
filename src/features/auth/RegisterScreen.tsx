"use client";

import { SignUp } from "@clerk/nextjs";
import { clerkEnabled } from "@/lib/auth/clerk-config";
import { AuthUnavailable } from "./AuthParts";

/** Create an account with Google or email — Clerk verifies the email before it is used. */
export function RegisterScreen() {
  return (
    <>
      {clerkEnabled ? (
        <SignUp routing="path" path="/register" signInUrl="/login" fallbackRedirectUrl="/onboarding" signInFallbackRedirectUrl="/dashboard" />
      ) : (
        <AuthUnavailable />
      )}
    </>
  );
}
