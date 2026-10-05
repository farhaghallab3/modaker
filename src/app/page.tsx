import type { Metadata } from "next";
import { LandingScreen } from "@/features/landing/LandingScreen";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: { absolute: BRAND.title },
};

export default function HomePage() {
  return <LandingScreen />;
}
