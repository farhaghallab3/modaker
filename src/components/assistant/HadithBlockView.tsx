import type { AnswerBlock } from "@/lib/types";
import { Icon } from "@/components/ui/Icon";

type HadithBlock = Extract<AnswerBlock, { type: "hadith" }>;

export function hadithBlocks(blocks: AnswerBlock[] | undefined): HadithBlock[] {
  return (blocks ?? []).filter((b): b is HadithBlock => b.type === "hadith");
}

const SAFE_URL = /^https:\/\/hadeethenc\.com\//;

/**
 * The source's own fields, verbatim and labelled: الحديث / الدرجة / العزو / المرجع, with the source name and a link to the exact page.
 * Nothing here is generated; the text of the quotation is never mixed with assistant prose.
 */
export function HadithPanel({ items }: { items: HadithBlock[] }) {
  return (
    <div className="space-y-4">
      {items.map((h, i) => (
        <article key={h.id ?? i} className="rounded-2xl bg-parchment/60 ring-1 ring-line p-4 space-y-3" aria-label="حديث من موسوعة الأحاديث النبوية">
          {h.title ? <p className="text-xs text-muted">{h.title}</p> : null}
          <section>
            <p className="text-xs font-medium text-muted mb-1">الحديث</p>
            <blockquote className="font-display text-lg leading-9 text-forest whitespace-pre-line">{h.text}</blockquote>
          </section>
          <dl className="grid gap-2 text-sm">
            <div>
              <dt className="inline text-xs font-medium text-muted">الدرجة: </dt>
              <dd className="inline font-medium text-forest">{h.grade}</dd>
            </div>
            {h.attribution ? (
              <div>
                <dt className="inline text-xs font-medium text-muted">العزو: </dt>
                <dd className="inline">{h.attribution}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-xs font-medium text-muted">المرجع:</dt>
              <dd className="whitespace-pre-line leading-6">{h.reference}</dd>
            </div>
          </dl>
          <p className="text-xs text-muted">
            المصدر:{" "}
            {h.url && SAFE_URL.test(h.url) ? (
              <a href={h.url} target="_blank" rel="noreferrer noopener" className="font-medium text-forest underline decoration-line underline-offset-4 hover:decoration-olive">
                {h.sourceTitle ?? "موسوعة الأحاديث النبوية – HadeethEnc"}
                <Icon name="link" size={13} className="inline ms-1 align-[-0.1em] text-muted" />
                <span className="sr-only"> (يفتح في نافذة جديدة)</span>
              </a>
            ) : (
              <span>{h.sourceTitle ?? "موسوعة الأحاديث النبوية – HadeethEnc"}</span>
            )}
          </p>
        </article>
      ))}
    </div>
  );
}
