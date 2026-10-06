/**
 * Content governance: review workflow (separation of duties + audit), the demo / review-state
 * separation, and source-registry invariants. Pure logic — no database.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEMO_CONTENT_LABEL, isAssistantEligible, isPubliclyVisible, needsDemoNotice, REVIEW_STATES } from "../src/lib/content-state";
import { STORIES } from "../src/content/stories";
import { VIDEOS } from "../src/content/videos";
import { approvedSourceIds, isApproved, isSourceUsable, KNOWLEDGE_SOURCES } from "../src/server/rag/sources";
import { templatesPendingReview, TEMPLATES } from "../src/server/safety/templates";
import {
  applyTransition,
  decideTransition,
  strictSeparationEnabled,
  WorkflowError,
  type AuditEvent,
  type EntityState,
  type EntityType,
  type ReviewPatch,
  type WorkflowStore,
} from "../src/server/content/workflow";

const admin = { id: "u-admin", role: "admin" as const };
const reviewer = { id: "u-rev", role: "content_reviewer" as const };
const author = { id: "u-author", role: "content_reviewer" as const };
const plain = { id: "u-plain", role: "user" as const };

// ── demo vs review state ─────────────────────────────────────────────────

/** The only videos reviewed and approved so far (supplementary external viewing; see tests/videos-visibility.test.ts). */
const APPROVED_VIDEOS = ["v-mulk-fadl", "v-dhul-qarnayn", "v-musa-khidr", "v-qabil-habil"];

test("every video except the explicitly approved ones is demo AND draft; the six reviewed stories are published", () => {
  assert.ok(STORIES.length >= 6 && VIDEOS.length >= 1);
  for (const s of STORIES) {
    assert.equal(s.isDemo, false, s.slug);
    assert.equal(s.reviewState, "published", s.slug);
  }
  for (const x of VIDEOS.filter((v) => !APPROVED_VIDEOS.includes(v.id))) {
    assert.equal(x.isDemo, true, "seed content is demo");
    assert.equal(x.reviewState, "draft", "seed content is unreviewed");
    assert.equal(isAssistantEligible(x), false, "the assistant never treats it as knowledge");
    assert.equal(needsDemoNotice(x), true, "the UI labels it");
  }
  for (const id of APPROVED_VIDEOS) {
    const v = VIDEOS.find((x) => x.id === id)!;
    assert.equal(v.isDemo, false, id);
    assert.equal(v.reviewState, "published", id);
  }
});

test("demo and review state are independent properties", () => {
  assert.equal(isAssistantEligible({ isDemo: false, reviewState: "published" }), true);
  assert.equal(isAssistantEligible({ isDemo: true, reviewState: "published" }), false, "published demo is still not knowledge");
  for (const s of REVIEW_STATES.filter((s) => s !== "published")) assert.equal(isAssistantEligible({ isDemo: false, reviewState: s }), false, s);
  // visibility: demo content stays visible (labelled) in development; unpublished real content does not
  assert.equal(isPubliclyVisible({ isDemo: true, reviewState: "draft" }), true);
  assert.equal(isPubliclyVisible({ isDemo: false, reviewState: "draft" }), false);
  assert.equal(isPubliclyVisible({ isDemo: false, reviewState: "approved" }), false, "approved is not yet published");
  assert.equal(isPubliclyVisible({ isDemo: false, reviewState: "published" }), true);
  assert.equal(isPubliclyVisible({ isDemo: true, reviewState: "archived" }), false);
  assert.ok(DEMO_CONTENT_LABEL.includes("لم تتم مراجعته واعتماده بعد"));
});

// ── workflow decisions ───────────────────────────────────────────────────

const base = { authorId: author.id, isDemo: false, strict: true };

test("the happy path: author submits, reviewer approves, admin publishes", () => {
  assert.deepEqual(decideTransition({ ...base, from: "draft", to: "in_review", actor: author }), { ok: true, action: "submit" });
  assert.deepEqual(decideTransition({ ...base, from: "in_review", to: "approved", actor: reviewer }), { ok: true, action: "approve" });
  assert.deepEqual(decideTransition({ ...base, from: "approved", to: "published", actor: admin }), { ok: true, action: "publish" });
});

test("separation of duties: an author cannot approve or reject their own content (strict)", () => {
  for (const to of ["approved", "rejected"] as const) {
    const r = decideTransition({ ...base, from: "in_review", to, actor: author, note: "x" });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "self_review");
  }
  // even an admin author is blocked in strict mode…
  const adminAuthored = { ...base, authorId: admin.id };
  assert.equal(decideTransition({ ...adminAuthored, from: "in_review", to: "approved", actor: admin }).ok, false);
  // …but allowed in development (strict off); the audit log still records who did it
  assert.equal(decideTransition({ ...adminAuthored, strict: false, from: "in_review", to: "approved", actor: admin }).ok, true);
});

test("permissions: users do nothing; reviewers cannot publish or archive; only admins publish", () => {
  assert.equal(decideTransition({ ...base, from: "draft", to: "in_review", actor: plain }).ok, false);
  assert.equal(decideTransition({ ...base, from: "in_review", to: "approved", actor: plain }).ok, false);
  const pub = decideTransition({ ...base, from: "approved", to: "published", actor: reviewer });
  assert.equal(pub.ok, false);
  assert.equal(decideTransition({ ...base, from: "published", to: "archived", actor: reviewer }).ok, false);
  assert.equal(decideTransition({ ...base, from: "published", to: "archived", actor: admin }).ok, true);
});

test("invalid jumps are refused: nothing skips review", () => {
  for (const [from, to] of [["draft", "approved"], ["draft", "published"], ["in_review", "published"], ["rejected", "approved"], ["archived", "published"], ["published", "draft"]] as const) {
    const r = decideTransition({ ...base, from, to, actor: admin, note: "x" });
    assert.equal(r.ok, false, `${from}→${to}`);
    if (!r.ok) assert.equal(r.code, "invalid_transition");
  }
});

test("a rejection needs a note", () => {
  const r = decideTransition({ ...base, from: "in_review", to: "rejected", actor: reviewer });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, "note_required");
  assert.equal(decideTransition({ ...base, from: "in_review", to: "rejected", actor: reviewer, note: "المرجع غير دقيق" }).ok, true);
});

test("demo content can be submitted for review but can never be approved or published", () => {
  assert.equal(decideTransition({ ...base, isDemo: true, from: "draft", to: "in_review", actor: author }).ok, true);
  for (const [from, to] of [["in_review", "approved"], ["approved", "published"]] as const) {
    const r = decideTransition({ ...base, isDemo: true, strict: false, from, to, actor: admin });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "demo_content");
  }
});

test("strict separation defaults to on in production and off in development", () => {
  assert.equal(strictSeparationEnabled({ NODE_ENV: "production" }), true);
  assert.equal(strictSeparationEnabled({ NODE_ENV: "development" }), false);
  assert.equal(strictSeparationEnabled({ NODE_ENV: "production", CONTENT_STRICT_SEPARATION: "off" }), false);
  assert.equal(strictSeparationEnabled({ NODE_ENV: "development", CONTENT_STRICT_SEPARATION: "on" }), true);
});

// ── persistence + audit ──────────────────────────────────────────────────

class MemStore implements WorkflowStore {
  rows = new Map<string, EntityState & ReviewPatch>();
  events: AuditEvent[] = [];
  put(type: EntityType, id: string, s: EntityState) {
    this.rows.set(`${type}:${id}`, { ...s });
  }
  async load(type: EntityType, id: string) {
    return this.rows.get(`${type}:${id}`) ?? null;
  }
  async commit(type: EntityType, id: string, patch: ReviewPatch, event: AuditEvent) {
    const row = this.rows.get(`${type}:${id}`)!;
    this.rows.set(`${type}:${id}`, { ...row, ...patch });
    this.events.push(event);
  }
}

test("every transition writes an audit event with actor, role, from/to and note", async () => {
  const store = new MemStore();
  store.put("story", "s1", { reviewState: "draft", isDemo: false, authorId: author.id });
  const t0 = new Date("2026-10-05T10:00:00Z");

  await applyTransition(store, { type: "story", id: "s1", to: "in_review", actor: author, strict: true, now: t0 });
  await applyTransition(store, { type: "story", id: "s1", to: "approved", actor: reviewer, strict: true, now: t0, note: "مراجعة مكتملة" });
  await applyTransition(store, { type: "story", id: "s1", to: "published", actor: admin, strict: true, now: t0 });

  assert.deepEqual(store.events.map((e) => [e.action, e.fromState, e.toState, e.actorId, e.actorRole]), [
    ["submit", "draft", "in_review", "u-author", "content_reviewer"],
    ["approve", "in_review", "approved", "u-rev", "content_reviewer"],
    ["publish", "approved", "published", "u-admin", "admin"],
  ]);
  const row = store.rows.get("story:s1")!;
  assert.equal(row.reviewState, "published");
  assert.equal(row.reviewerId, "u-rev", "who approved is recorded on the content");
  assert.equal(row.publishedAt, t0);
  assert.equal(store.events[1].note, "مراجعة مكتملة");
});

test("a refused transition changes nothing and writes no audit event", async () => {
  const store = new MemStore();
  store.put("video", "v1", { reviewState: "in_review", isDemo: false, authorId: author.id });
  await assert.rejects(applyTransition(store, { type: "video", id: "v1", to: "approved", actor: author, strict: true }), (e: unknown) => e instanceof WorkflowError && e.code === "self_review");
  assert.equal(store.rows.get("video:v1")!.reviewState, "in_review");
  assert.equal(store.events.length, 0);
  await assert.rejects(applyTransition(store, { type: "video", id: "missing", to: "approved", actor: admin }), (e: unknown) => e instanceof WorkflowError && e.code === "not_found");
});

test("demo rows cannot be published even by an admin with strict mode off (development)", async () => {
  const store = new MemStore();
  store.put("story", "demo", { reviewState: "approved", isDemo: true, authorId: null });
  await assert.rejects(applyTransition(store, { type: "story", id: "demo", to: "published", actor: admin, strict: false }), (e: unknown) => e instanceof WorkflowError && e.code === "demo_content");
  assert.equal(store.events.length, 0);
});

// ── source registry invariants ───────────────────────────────────────────

test("planned sources are inert: nothing disabled, draft, or unreviewed is usable", () => {
  for (const s of Object.values(KNOWLEDGE_SOURCES)) {
    assert.equal(isSourceUsable(s), s.enabled && (s.reviewState === "approved" || s.reviewState === "published"), s.id);
    if (!s.enabled) assert.equal(isApproved(s.id), false, s.id);
  }
  for (const id of ["king-fahd-complex:quran", "quranenc:translations", "dorar:hadith-verification", "jamhara:terminology", "tafsir:ibn-kathir"]) {
    assert.equal(isApproved(id), false, `${id} is planned only`);
    assert.equal(KNOWLEDGE_SOURCES[id].licenseVerified, false, `${id} terms not yet verified`);
  }
});

test("the editorial/demo source can never be used by the assistant", () => {
  const s = KNOWLEDGE_SOURCES["muzakkir-curated"];
  assert.equal(s.editorial, true);
  assert.equal(isApproved(s.id), false);
  assert.ok(!approvedSourceIds().includes(s.id));
});

test("only the current, already-in-use sources are usable", () => {
  assert.deepEqual(approvedSourceIds().sort(), ["hadeethenc:hadith", "quran-com:uthmani", "tafsir:muyassar", "tanzil:uthmani"]);
  // the one approved hadith source: terms reviewed (verbatim use + attribution), used only via the dedicated hadith provider
  assert.equal(KNOWLEDGE_SOURCES["hadeethenc:hadith"].kind, "hadith");
  assert.equal(KNOWLEDGE_SOURCES["hadeethenc:hadith"].licenseVerified, true);
});

test("the King Fahd Complex source is registered as the future canonical text but is not switched on", () => {
  const s = KNOWLEDGE_SOURCES["king-fahd-complex:quran"];
  assert.equal(s.tier, 1);
  assert.equal(s.enabled, false);
  assert.equal(s.reviewState, "draft");
  assert.match(s.description, /QURAN-SOURCE-MIGRATION-PLAN/);
});

test("registry metadata is complete for every source", () => {
  for (const s of Object.values(KNOWLEDGE_SOURCES)) {
    assert.ok([1, 2, 3, 4].includes(s.tier), s.id);
    assert.ok(s.authorityType && s.languages.length > 0, s.id);
    assert.equal(typeof s.apiAvailable, "boolean");
    assert.equal(typeof s.requiresHumanReview, "boolean");
  }
});

test("Level C wording is marked as pending scholarly review; owner-provided texts are marked as such", () => {
  assert.equal(TEMPLATES.sensitiveC.approval, "pending_scholarly_review");
  assert.equal(TEMPLATES.referralD.approval, "owner_provided");
  assert.equal(TEMPLATES.abstain.approval, "owner_provided");
  assert.ok(templatesPendingReview().some((t) => t.id === TEMPLATES.sensitiveC.id));
  assert.equal(TEMPLATES.abstain.text, "لا تتوفر لدي مادة موثوقة كافية للإجابة عن هذا السؤال.");
});

// ── learner-facing visibility: unreviewed content is hidden, never relabelled ──
import { isLearnerVisible } from "../src/lib/content-state";
import { getStory, storiesForSurah, visibleStories } from "../src/content/stories";
import { getVideo, videosForStory, videosForSurah, visibleVideos } from "../src/content/videos";

test("learners see only reviewed, published, non-demo content", () => {
  assert.equal(isLearnerVisible({ isDemo: false, reviewState: "published" }), true);
  assert.equal(isLearnerVisible({ isDemo: true, reviewState: "published" }), false);
  for (const s of REVIEW_STATES.filter((s) => s !== "published")) assert.equal(isLearnerVisible({ isDemo: false, reviewState: s }), false, s);
});

test("every story and video that is not reviewed stays hidden from the accessors the UI uses", () => {
  assert.ok(visibleStories().every(isLearnerVisible));
  assert.ok(visibleVideos().every(isLearnerVisible));
  for (const s of STORIES.filter((s) => !isLearnerVisible(s))) {
    assert.equal(getStory(s.slug), undefined, s.slug);
    assert.ok(!storiesForSurah(s.surahs[0]).some((x) => x.slug === s.slug));
    assert.ok(!videosForStory(s.slug).some((v) => !isLearnerVisible(v)));
  }
  for (const v of VIDEOS.filter((v) => !isLearnerVisible(v))) {
    assert.equal(getVideo(v.id), undefined, v.id);
    if (v.surah) assert.ok(!videosForSurah(v.surah).some((x) => x.id === v.id));
  }
});
