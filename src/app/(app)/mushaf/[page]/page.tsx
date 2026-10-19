import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isValidPage } from "@/lib/quran/mushaf";
import { MushafScreen } from "@/features/mushaf/MushafScreen";

export async function generateMetadata({ params }: { params: Promise<{ page: string }> }): Promise<Metadata> {
  return { title: `المصحف — الصفحة ${(await params).page}` };
}

export default async function MushafPage({ params }: { params: Promise<{ page: string }> }) {
  const n = Number((await params).page);
  if (!isValidPage(n)) notFound();
  return <MushafScreen page={n} />;
}
