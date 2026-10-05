import type { Metadata } from "next";
import { ReviewScreen } from "@/features/review/ReviewScreen";

export const metadata: Metadata = { title: "المراجعة" };

export default function ReviewPage() {
  return <ReviewScreen />;
}
