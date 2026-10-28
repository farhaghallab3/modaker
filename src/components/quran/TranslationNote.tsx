"use client";

import { Button, cn } from "@/components/ui/primitives";
import type { TranslationEntry } from "@/lib/types";
import { SourceLine } from "./QuranVerse";

/**
 * The approved English translation of an ayah's meaning, verbatim and with its
 * source. Content comes only from api.translation — never written here.
 */
export function TranslationNote({
  entry,
  loading,
  error,
  onRetry,
  className,
  showSource = true,
}: {
  entry?: TranslationEntry | null;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  className?: string;
  showSource?: boolean;
}) {
  return (
    <div
      className={cn("rounded-2xl bg-parchment/50 px-4 py-3 border-s-2 border-sand/50 animate-rise", className)}
      aria-live="polite"
      aria-busy={loading || undefined}
    >
      <p className="text-[0.7rem] font-semibold text-olive mb-1.5">ترجمة المعاني بالإنجليزية</p>
      {loading ? (
        <div className="space-y-2 py-1" aria-label="جارٍ تحميل الترجمة">
          <div className="skeleton h-3.5 w-11/12" />
          <div className="skeleton h-3.5 w-7/12" />
        </div>
      ) : error ? (
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
          تعذّر تحميل الترجمة من المصدر.
          {onRetry ? (
            <Button variant="quiet" size="sm" onClick={onRetry} className="h-7 px-2">
              إعادة المحاولة
            </Button>
          ) : null}
        </div>
      ) : entry ? (
        <>
          <p dir="ltr" lang="en" className="text-[0.95rem] leading-7 text-ink/85 text-left">
            {entry.text}
          </p>
          {entry.footnotes ? (
            <details dir="ltr" lang="en" className="mt-1.5 text-left text-xs text-muted">
              <summary className="cursor-pointer select-none">Footnotes</summary>
              <p className="mt-1 whitespace-pre-line leading-6">{entry.footnotes}</p>
            </details>
          ) : null}
          {showSource ? (
            <div className="mt-2">
              <SourceLine title={entry.source.title} url={entry.source.url} />
            </div>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-muted">لا تتوفر ترجمة لهذه الآية في المصدر.</p>
      )}
    </div>
  );
}
