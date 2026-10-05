import type { Metadata } from "next";
import { Suspense } from "react";
import { ReciteScreen } from "@/features/recite/ReciteScreen";

export const metadata: Metadata = { title: "التسميع" };

export default function RecitePage() {
  return (
    <Suspense>
      <ReciteScreen />
    </Suspense>
  );
}
