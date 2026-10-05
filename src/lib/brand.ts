/**
 * Official brand identity. The diacritics in the name are part of the brand and
 * must be preserved wherever the full name is displayed.
 */
export const BRAND = {
  name: "مُدّكِر",
  nameLatin: "Muddakir",
  title: "مُدّكِر — رفيقك الذكي لحفظ القرآن الكريم وفهمه",
  description: "احفظ، سمّع، افهم، وراجع القرآن بخطة تتذكر تقدمك وترافقك خطوة بخطوة.",
} as const;

/** Shown wherever the assistant appears (PDF: transparency about AI). Short and calm, not a warning. */
export const AI_DISCLOSURE = "مساعد ذكي يعتمد على مصادر إسلامية موثقة، وليس بديلاً عن العالم أو المفتي.";

/** Provided logo assets (public/brand). Marks are the symbol only; the name is set in Amiri beside them. */
export const BRAND_ASSETS = {
  /** Forest/olive mark for light surfaces. */
  markLight: { src: "/brand/logo-mark-light.png", width: 256, height: 225 },
  /** Gold mark for dark surfaces. */
  markDark: { src: "/brand/logo-mark-dark.png", width: 197, height: 172 },
  ogImage: { src: "/brand/og-image.png", width: 1200, height: 630 },
} as const;
