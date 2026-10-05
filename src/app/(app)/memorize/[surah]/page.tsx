import type { Metadata } from "next";
import { Suspense } from "react";
import { MemorizeScreen } from "@/features/memorize/MemorizeScreen";
import { getSurahMeta } from "@/lib/quran/surahs";

export async function generateMetadata({ params }: { params: Promise<{ surah: string }> }): Promise<Metadata> {
  const meta = getSurahMeta(Number((await params).surah));
  return { title: meta ? `حفظ سورة ${meta.nameAr}` : "الحفظ" };
}

export default function MemorizePage() {
  return (
    <Suspense>
      <MemorizeScreen />
    </Suspense>
  );
}
