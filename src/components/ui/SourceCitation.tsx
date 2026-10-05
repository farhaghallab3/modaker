import { toArabicDigits } from "@/lib/quran/surahs";
import { Icon } from "./Icon";
import { cn } from "./primitives";

export interface CitationLike {
  title: string;
  /** e.g. "التفسير الميسر — مريم ٣٢" */
  ref?: string;
  excerpt?: string;
  url?: string;
  publisher?: string;
}

/**
 * Inline numbered marker (e.g. after a sentence in an assistant answer).
 * Links to the matching <SourceCitation id=…> list item.
 */
export function CitationMarker({ n, targetId, title }: { n: number; targetId: string; title?: string }) {
  return (
    <a
      href={`#${targetId}`}
      className="mx-0.5 inline-grid min-w-5 h-5 px-1 place-items-center rounded-md bg-olive-100 align-[0.15em] text-[0.68rem] font-semibold text-olive-600 no-underline transition-colors hover:bg-olive hover:text-cream num"
      aria-label={`المصدر ${toArabicDigits(n)}${title ? `: ${title}` : ""}`}
    >
      {toArabicDigits(n)}
    </a>
  );
}

/**
 * Numbered source entry for assistant answers and story reference lists.
 * Render inside an <ol>; `id` lets inline markers jump here.
 */
export function SourceCitation({
  n,
  citation,
  id,
  compact = false,
  className,
}: {
  n: number;
  citation: CitationLike;
  id?: string;
  compact?: boolean;
  className?: string;
}) {
  const external = citation.url && /^https?:\/\//.test(citation.url);
  return (
    <li id={id} className={cn("flex gap-3 scroll-mt-24 target:bg-sand-100/50 rounded-xl transition-colors", compact ? "py-2" : "py-3", className)}>
      <span
        className="mt-0.5 grid place-items-center size-6 shrink-0 rounded-full ring-1 ring-olive/30 text-[0.72rem] font-semibold text-olive num"
        aria-hidden
      >
        {toArabicDigits(n)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-6">
          {external ? (
            <a
              href={citation.url}
              target="_blank"
              rel="noreferrer noopener"
              className="font-medium text-forest underline decoration-line underline-offset-4 hover:decoration-olive"
            >
              {citation.title}
              <Icon name="link" size={13} className="inline ms-1 align-[-0.1em] text-muted" />
              <span className="sr-only"> (يفتح في نافذة جديدة)</span>
            </a>
          ) : (
            <span className="font-medium text-forest">{citation.title}</span>
          )}
          {citation.ref && citation.ref !== citation.title ? <span className="text-muted"> — {citation.ref}</span> : null}
        </p>
        {citation.publisher ? <p className="text-xs text-muted">{citation.publisher}</p> : null}
        {citation.excerpt && !compact ? (
          <p className="mt-1 text-[0.8rem] leading-6 text-muted line-clamp-3 border-s-2 border-sage ps-3">{citation.excerpt}</p>
        ) : null}
      </div>
    </li>
  );
}

/** Convenience wrapper: a titled, numbered list of sources. */
export function SourceList({
  items,
  idPrefix,
  title = "المصادر",
  compact,
  className,
}: {
  items: CitationLike[];
  idPrefix?: string;
  title?: string;
  compact?: boolean;
  className?: string;
}) {
  if (!items.length) return null;
  return (
    <div className={className}>
      {title ? <p className="text-xs font-medium text-muted mb-1">{title}</p> : null}
      <ol className="divide-y divide-line">
        {items.map((c, i) => (
          <SourceCitation key={`${c.title}-${i}`} n={i + 1} citation={c} id={idPrefix ? `${idPrefix}-${i + 1}` : undefined} compact={compact} />
        ))}
      </ol>
    </div>
  );
}
