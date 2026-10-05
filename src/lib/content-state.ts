/**
 * Content state model — shared by the UI, the content scripts and the assistant.
 *
 *   isDemo       describes the NATURE of the content: placeholder copy that nobody has reviewed.
 *   reviewState  describes EDITORIAL APPROVAL: draft → in_review → approved → published
 *                (plus rejected / archived).
 *
 * They are independent. Demo content is shown in development with a visible notice, but it is
 * never "approved knowledge": the assistant and the knowledge base only ever see content that is
 * `published` AND not demo.
 */

export const REVIEW_STATES = ["draft", "in_review", "approved", "published", "rejected", "archived"] as const;
export type ReviewState = (typeof REVIEW_STATES)[number];

export interface ContentFlags {
  isDemo: boolean;
  reviewState: ReviewState;
}

/** Label shown wherever demo content appears. */
export const DEMO_CONTENT_LABEL = "محتوى تجريبي — لم تتم مراجعته واعتماده بعد";

/**
 * May a reader see this item in the app?
 *  - published, non-demo content: yes
 *  - demo content: yes, but only as clearly labelled development content
 *  - anything else (draft / in_review / approved-but-unpublished / rejected / archived): no
 */
export function isPubliclyVisible(c: ContentFlags): boolean {
  if (c.isDemo) return c.reviewState !== "archived" && c.reviewState !== "rejected";
  return c.reviewState === "published";
}

/** Must the UI show the "demo / not reviewed" notice for this item? */
export function needsDemoNotice(c: ContentFlags): boolean {
  return c.isDemo || c.reviewState !== "published";
}

/**
 * May this item be used as knowledge — indexed, retrieved, cited or summarised by the assistant?
 * Only reviewed-and-published, non-demo content qualifies.
 */
export function isAssistantEligible(c: ContentFlags): boolean {
  return !c.isDemo && c.reviewState === "published";
}
