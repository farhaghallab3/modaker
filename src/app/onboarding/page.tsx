import type { Metadata } from "next";
import { OnboardingScreen } from "@/features/onboarding/OnboardingScreen";

export const metadata: Metadata = { title: "لنرتّب خطتك" };

export default function OnboardingPage() {
  return <OnboardingScreen />;
}
