import { Suspense } from "react";
import { VideoLibraryScreen } from "@/features/videos/VideoLibraryScreen";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <VideoLibraryScreen />
    </Suspense>
  );
}
