"use client";

import { Button, cn } from "@/components/ui/primitives";
import type { TafsirEntry } from "@/lib/types";
import { SourceLine } from "./QuranVerse";

/**
 * A verified tafsir excerpt (التفسير الميسر) under an ayah, always with its
 * source. Content comes only from api.tafsir — never written here.
 */
export function TafsirNote({
  entry,
  loading,
  error,
  onRetry,
  label = "المعنى",
  className,
  showSource = true,
}: {
  entry?: TafsirEntry | null;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  label?: string;
  className?: string;
  showSource?: boolean;
}) {
  return (
    <div
      className={cn("rounded-2xl bg-parchment/70 px-4 py-3.5 border-s-2 border-olive/40 animate-rise", className)}
      aria-live="polite"
      aria-busy={loading || undefined}
    >
      <p className="text-[0.7rem] font-semibold text-olive mb-1.5">{label}</p>
      {loading ? (
        <div className="space-y-2 py-1" aria-label="جارٍ تحميل التفسير">
          <div className="skeleton h-3.5 w-11/12" />
          <div className="skeleton h-3.5 w-8/12" />
        </div>
      ) : error ? (
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
          تعذّر تحميل التفسير من المصدر.
          {onRetry ? (
            <Button variant="quiet" size="sm" onClick={onRetry} className="h-7 px-2">
              إعادة المحاولة
            </Button>
          ) : null}
        </div>
      ) : entry ? (
        <>
          <p className="text-[0.95rem] leading-8 text-ink/85">{entry.text}</p>
          {showSource ? (
            <div className="mt-2">
              <SourceLine title={entry.source.title} url={entry.source.url} />
            </div>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-muted">لا يتوفر تفسير لهذه الآية في المصدر.</p>
      )}
    </div>
  );
}
