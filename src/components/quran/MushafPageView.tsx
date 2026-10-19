"use client";

import { useEffect, useState } from "react";
import { cn } from "@/components/ui/primitives";
import { qcfFontFamily, type MushafLine, type MushafPage, type MushafWord } from "@/lib/quran/mushaf";
import { getSurahMeta } from "@/lib/quran/surahs";

/** Load a QCF page font once per session (FontFace API); resolves when it can render. */
const loading = new Map<string, Promise<void>>();
export function loadQcfFont(page: number, url: string): Promise<void> {
  const family = qcfFontFamily(page);
  let p = loading.get(family);
  if (!p) {
    const face = new FontFace(family, `url(${url}) format("woff2")`, { display: "block" });
    p = face.load().then((f) => {
      document.fonts.add(f);
    });
    p.catch(() => loading.delete(family)); // let a later visit retry
    loading.set(family, p);
  }
  return p;
}

function useFonts(page: MushafPage): "loading" | "ready" | "error" {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => {
    let alive = true;
    setState("loading");
    const fonts = [loadQcfFont(page.page, page.fontUrl)];
    if (page.basmala) fonts.push(loadQcfFont(1, page.basmala.fontUrl));
    Promise.all(fonts)
      .then(() => alive && setState("ready"))
      .catch(() => alive && setState("error"));
    return () => {
      alive = false;
    };
  }, [page]);
  return state;
}

/**
 * One page of the Madinah Mushaf: 15 justified lines in that page's King Fahd Complex font.
 * Words are buttons (their plain text is the accessible name); `activeAyah` highlights the ayah
 * being recited, `selected` the tapped word.
 */
export function MushafPageView({
  page,
  activeAyah,
  selected,
  onWord,
}: {
  page: MushafPage;
  activeAyah?: string | null;
  selected?: string | null;
  onWord?: (w: MushafWord) => void;
}) {
  const fonts = useFonts(page);
  const opening = page.page <= 2;

  if (fonts === "error") {
    return <p className="py-16 text-center text-sm text-terracotta">تعذّر تحميل خط المصحف. تحقّق من اتصالك ثم أعد المحاولة.</p>;
  }

  return (
    <div
      dir="rtl"
      lang="ar"
      className={cn("mushaf-page relative mx-auto w-full max-w-[34rem] [container-type:inline-size]", opening && "py-[8cqw]")}
      aria-busy={fonts === "loading" || undefined}
    >
      {page.lines.map((line) => (
        <Line key={line.n} line={line} page={page} ready={fonts === "ready"} opening={opening} activeAyah={activeAyah} selected={selected} onWord={onWord} />
      ))}
    </div>
  );
}

function Line({
  line,
  page,
  ready,
  opening,
  activeAyah,
  selected,
  onWord,
}: {
  line: MushafLine;
  page: MushafPage;
  ready: boolean;
  opening: boolean;
  activeAyah?: string | null;
  selected?: string | null;
  onWord?: (w: MushafWord) => void;
}) {
  const rowClass = "flex h-[9.4cqw] items-center";

  if (line.kind === "surah-header") {
    const meta = getSurahMeta(line.surah);
    return (
      <div className={cn(rowClass, "justify-center")}>
        <div className="flex h-[7.6cqw] w-full items-center justify-center rounded-[1.6cqw] border-[0.35cqw] border-double border-olive/60 bg-olive-100/50">
          <span className="font-display text-[4.4cqw] leading-none text-forest">سورة {meta?.nameAr}</span>
        </div>
      </div>
    );
  }

  if (line.kind === "basmala") {
    return (
      <div className={cn(rowClass, "justify-center gap-[1.2cqw]")} style={{ fontFamily: qcfFontFamily(1) }} aria-label={page.basmala?.words.map((w) => w.text).join(" ")}>
        {ready ? page.basmala?.words.map((w) => <span key={w.id} aria-hidden className="mushaf-glyph text-[5.6cqw]">{w.glyph}</span>) : <Placeholder />}
      </div>
    );
  }

  if (line.kind === "blank") return <div className={rowClass} aria-hidden />;

  return (
    <div
      className={cn(rowClass, opening ? "justify-center gap-[1.6cqw]" : "justify-between")}
      style={{ fontFamily: qcfFontFamily(page.page) }}
    >
      {ready
        ? line.words.map((w) => {
            const ayahKey = `${w.surah}:${w.ayah}`;
            return (
              <button
                key={w.id}
                type="button"
                onClick={() => onWord?.(w)}
                aria-label={w.type === "end" ? `نهاية الآية ${w.ayah}` : w.text}
                className={cn(
                  "mushaf-glyph rounded-[0.8cqw] px-[0.15cqw] text-[5.6cqw] leading-none text-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-olive",
                  activeAyah === ayahKey && "bg-sand-100 text-forest",
                  selected === w.id && "bg-olive-100 text-forest",
                  w.type === "end" && "text-olive",
                )}
              >
                {w.glyph}
              </button>
            );
          })
        : <Placeholder />}
    </div>
  );
}

function Placeholder() {
  return <span aria-hidden className="h-[2.4cqw] w-full animate-pulse rounded-full bg-parchment" />;
}
