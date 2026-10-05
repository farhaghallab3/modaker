"use client";

import { ErrorState } from "@/components/ui/primitives";

/** Shown whenever verified Quran text can't be loaded. Never a fallback text. */
export const SOURCE_UNAVAILABLE = "تعذّر تحميل النص من المصدر الموثّق";

export function VerseSkeleton({ lines = 6 }: { lines?: number }) {
  return (
    <div className="space-y-7 py-2" aria-busy="true" aria-label="جارٍ تحميل الآيات">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="space-y-3">
          <div className="skeleton h-7" style={{ width: `${96 - ((i * 23) % 30)}%` }} />
          {i % 2 === 0 ? <div className="skeleton h-7" style={{ width: `${55 + ((i * 13) % 30)}%` }} /> : null}
        </div>
      ))}
    </div>
  );
}

export function SourceError({ onRetry }: { onRetry: () => void }) {
  return (
    <ErrorState
      title={SOURCE_UNAVAILABLE}
      body="لا نعرض نصًا بديلًا. تحقّق من اتصالك ثم أعد المحاولة."
      onRetry={onRetry}
      icon="wifiOff"
    />
  );
}

