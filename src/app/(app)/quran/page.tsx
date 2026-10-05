import type { Metadata } from "next";
import { QuranBrowserScreen } from "@/features/quran/QuranBrowserScreen";

export const metadata: Metadata = { title: "المصحف" };

export default function QuranPage() {
  return <QuranBrowserScreen />;
}
