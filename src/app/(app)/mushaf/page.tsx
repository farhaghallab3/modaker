"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { rememberedMushafPage } from "@/features/mushaf/MushafScreen";

/** /mushaf → the page the learner last read (page 1 the first time). */
export default function MushafIndex() {
  const router = useRouter();
  useEffect(() => router.replace(`/mushaf/${rememberedMushafPage()}`), [router]);
  return null;
}
