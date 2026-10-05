import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingSkeleton } from "@/components/ui/primitives";
import { LoginScreen } from "@/features/auth/LoginScreen";

export const metadata: Metadata = { title: "تسجيل الدخول" };

export default function LoginPage() {
  return (
    <Suspense fallback={<LoadingSkeleton lines={4} />}>
      <LoginScreen />
    </Suspense>
  );
}
