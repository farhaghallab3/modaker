import { BRAND, BRAND_ASSETS } from "@/lib/brand";

/**
 * Official mark (provided asset, never redrawn) + the name set in Amiri.
 * `tone="auto"` follows the active theme (forest mark on light, gold mark on dark) via CSS,
 * so it never mismatches during hydration. `tone="onDark"` is for brand-forest panels.
 */
export function Logo({
  compact = false,
  tone = "auto",
  showName = true,
}: {
  compact?: boolean;
  tone?: "auto" | "onDark";
  showName?: boolean;
}) {
  const h = compact ? "h-8" : "h-10";
  // The visible name already labels the logo; the mark only carries alt text when it stands alone.
  const alt = showName ? "" : BRAND.name;
  const { markLight: light, markDark: dark } = BRAND_ASSETS;
  // Fixed lockup order (mark, then name) as in the official brand board — never mirrored by RTL.
  return (
    <span className="inline-flex items-center gap-2.5 select-none" dir="ltr">
      {tone === "auto" ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- tiny static brand asset */}
          <img src={light.src} width={light.width} height={light.height} alt={alt} className={`brand-mark-light ${h} w-auto shrink-0`} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={dark.src} width={dark.width} height={dark.height} alt={alt} className={`brand-mark-dark ${h} w-auto shrink-0`} />
        </>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={dark.src} width={dark.width} height={dark.height} alt={alt} className={`${h} w-auto shrink-0`} />
      )}
      {showName ? (
        <span
          lang="ar"
          dir="rtl"
          className={`font-display font-bold leading-none ${tone === "onDark" ? "text-cream" : "text-forest"}`}
          style={{ fontSize: compact ? 22 : 26 }}
        >
          {BRAND.name}
        </span>
      ) : null}
    </span>
  );
}
