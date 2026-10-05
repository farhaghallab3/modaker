import type { Metadata } from "next";
import { SurahScreen } from "@/features/quran/SurahScreen";
import { getSurahMeta } from "@/lib/quran/surahs";

export async function generateMetadata({ params }: { params: Promise<{ surah: string }> }): Promise<Metadata> {
  const meta = getSurahMeta(Number((await params).surah));
  return { title: meta ? `سورة ${meta.nameAr}` : "سورة" };
}

export default function SurahPage() {
  return <SurahScreen />;
}
