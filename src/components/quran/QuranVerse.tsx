import { toArabicDigits } from "@/lib/quran/surahs";
import type { Ayah } from "@/lib/types";
import { cn } from "@/lib/cn";

/**
 * Renders verified Quran text exactly as received from the provider,
 * followed by an ayah-number marker. Never pass text that didn't come from
 * the Quran provider.
 */
export function QuranVerse({
  ayah,
  className,
  hidden = false,
  highlight,
  as: As = "p",
}: {
  ayah: Ayah;
  className?: string;
  /** memorization mode: hide the text but keep layout */
  hidden?: boolean;
  highlight?: "ok" | "warn" | "error";
  as?: "p" | "span";
}) {
  return (
    <As
      lang="ar"
      dir="rtl"
      className={cn(
        "quran-text transition-[filter,opacity] duration-300",
        hidden && "blur-[7px] opacity-40 select-none",
        highlight === "warn" && "bg-sand-100/60 rounded-xl",
        highlight === "error" && "bg-terracotta-50 rounded-xl",
        className,
      )}
      aria-hidden={hidden || undefined}
    >
      {ayah.textUthmani}
      <span className="ayah-marker" aria-label={`الآية ${ayah.ayah}`}>
        {toArabicDigits(ayah.ayah)}
      </span>
    </As>
  );
}

/** Small citation line for the verified source of any Quran/tafsir content. */
export function SourceLine({ title, url }: { title: string; url?: string }) {
  return (
    <p className="text-[0.72rem] text-muted inline-flex items-center gap-1.5">
      <span className="size-1.5 rounded-full bg-olive" aria-hidden />
      المصدر:{" "}
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" className="underline decoration-line underline-offset-4 hover:text-forest">
          {title}
        </a>
      ) : (
        title
      )}
    </p>
  );
}
