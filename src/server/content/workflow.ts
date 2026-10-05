/**
 * Content review workflow (P1 foundation — no UI yet).
 *
 *   draft ──submit──▶ in_review ──approve──▶ approved ──publish──▶ published
 *     ▲                  │  └──reject──▶ rejected                     │
 *     └──────reopen──────┴──────────────────┘            archive ◀───┘ (from any state)
 *
 * Separation of duties:
 *   author   submits
 *   reviewer approves / rejects (never their own work when `strict`)
 *   admin    publishes and archives
 * In development `strict` is off, so an admin can walk content through every step while testing —
 * but EVERY transition writes an audit event with the actor and role, so what happened is always
 * reconstructable. In production `strict` is on by default.
 *
 * Demo content (`isDemo`) can never be approved or published; the demo flag has to be cleared
 * first, which is an explicit editorial act (the content has been rewritten and reviewed).
 *
 * The decision logic is pure (`decideTransition`); persistence goes through a small store
 * interface so the same code is unit-tested in memory and runs on Prisma in the app.
 */
import type { ReviewAction, Role as DbRole } from "@prisma/client";
import type { ReviewState } from "@/lib/content-state";

export type Role = DbRole;
export type EntityType = "story" | "story_chapter" | "video" | "knowledge_chunk" | "knowledge_source";

export interface Actor {
  id: string;
  role: Role;
}

export interface TransitionRequest {
  from: ReviewState;
  to: ReviewState;
  actor: Actor;
  /** Who wrote the content (null for imports / unknown). */
  authorId?: string | null;
  isDemo?: boolean;
  note?: string | null;
  /** Enforce "an author cannot approve their own content", even for admins. */
  strict: boolean;
}

export type TransitionDecision =
  | { ok: true; action: ReviewAction }
  | { ok: false; code: TransitionErrorCode; message: string };

export type TransitionErrorCode =
  | "not_allowed"
  | "invalid_transition"
  | "demo_content"
  | "self_review"
  | "note_required";

/** `from → to` → the audit action it represents. */
const GRAPH: Record<string, ReviewAction> = {
  "draft>in_review": "submit",
  "in_review>approved": "approve",
  "in_review>rejected": "reject",
  "in_review>draft": "reopen",
  "approved>published": "publish",
  "approved>in_review": "reopen",
  "rejected>draft": "reopen",
  "archived>draft": "reopen",
  "draft>archived": "archive",
  "in_review>archived": "archive",
  "approved>archived": "archive",
  "published>archived": "archive",
  "rejected>archived": "archive",
};

const isReviewer = (r: Role) => r === "content_reviewer" || r === "admin";

export function decideTransition(req: TransitionRequest): TransitionDecision {
  const action = GRAPH[`${req.from}>${req.to}`];
  if (!action) {
    return { ok: false, code: "invalid_transition", message: `Cannot move from ${req.from} to ${req.to}.` };
  }

  const { role, id } = req.actor;
  const deny = (message: string): TransitionDecision => ({ ok: false, code: "not_allowed", message });

  switch (action) {
    case "submit":
      // The author, or any reviewer/admin on their behalf. Plain users never.
      if (role === "user") return deny("Only staff can submit content for review.");
      break;
    case "approve":
    case "reject":
      if (!isReviewer(role)) return deny("Only a content reviewer or admin can review content.");
      if (req.strict && req.authorId && req.authorId === id) {
        return { ok: false, code: "self_review", message: "An author cannot review their own content." };
      }
      if (action === "reject" && !req.note?.trim()) {
        return { ok: false, code: "note_required", message: "A rejection needs a note explaining why." };
      }
      break;
    case "publish":
    case "archive":
      if (role !== "admin") return deny("Only an admin can publish or archive content.");
      break;
    case "reopen":
      if (!isReviewer(role)) return deny("Only a reviewer or admin can reopen content.");
      break;
  }

  if ((req.to === "approved" || req.to === "published") && req.isDemo) {
    return { ok: false, code: "demo_content", message: "Demo content cannot be approved or published; replace it with reviewed content first." };
  }
  return { ok: true, action };
}

// ── persistence boundary ─────────────────────────────────────────────────

export interface EntityState {
  reviewState: ReviewState;
  isDemo: boolean;
  authorId: string | null;
}

export interface AuditEvent {
  entityType: EntityType;
  entityId: string;
  action: ReviewAction;
  fromState: ReviewState;
  toState: ReviewState;
  actorId: string;
  actorRole: Role;
  note: string | null;
}

export interface WorkflowStore {
  load(type: EntityType, id: string): Promise<EntityState | null>;
  /** Must update the entity AND append the audit event atomically. */
  commit(type: EntityType, id: string, patch: ReviewPatch, event: AuditEvent): Promise<void>;
}

export interface ReviewPatch {
  reviewState: ReviewState;
  reviewerId?: string | null;
  reviewedAt?: Date | null;
  publishedAt?: Date | null;
  reviewNote?: string | null;
}

export class WorkflowError extends Error {
  constructor(
    public code: TransitionErrorCode | "not_found",
    message: string,
  ) {
    super(message);
  }
}

export interface ApplyInput {
  type: EntityType;
  id: string;
  to: ReviewState;
  actor: Actor;
  note?: string | null;
  strict?: boolean;
  now?: Date;
}

/** Strict separation is on in production unless explicitly disabled (CONTENT_STRICT_SEPARATION=off). */
export function strictSeparationEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const v = env.CONTENT_STRICT_SEPARATION?.toLowerCase();
  if (v === "on" || v === "true" || v === "1") return true;
  if (v === "off" || v === "false" || v === "0") return false;
  return env.NODE_ENV === "production";
}

export async function applyTransition(store: WorkflowStore, input: ApplyInput): Promise<{ action: ReviewAction; from: ReviewState; to: ReviewState }> {
  const entity = await store.load(input.type, input.id);
  if (!entity) throw new WorkflowError("not_found", `${input.type} ${input.id} not found`);

  const decision = decideTransition({
    from: entity.reviewState,
    to: input.to,
    actor: input.actor,
    authorId: entity.authorId,
    isDemo: entity.isDemo,
    note: input.note,
    strict: input.strict ?? strictSeparationEnabled(),
  });
  if (!decision.ok) throw new WorkflowError(decision.code, decision.message);

  const now = input.now ?? new Date();
  const patch: ReviewPatch = { reviewState: input.to, reviewNote: input.note?.trim() || null };
  if (decision.action === "approve" || decision.action === "reject") {
    patch.reviewerId = input.actor.id;
    patch.reviewedAt = now;
  }
  if (decision.action === "publish") patch.publishedAt = now;
  if (decision.action === "reopen" || decision.action === "archive") patch.publishedAt = null;

  await store.commit(input.type, input.id, patch, {
    entityType: input.type,
    entityId: input.id,
    action: decision.action,
    fromState: entity.reviewState,
    toState: input.to,
    actorId: input.actor.id,
    actorRole: input.actor.role,
    note: patch.reviewNote ?? null,
  });
  return { action: decision.action, from: entity.reviewState, to: input.to };
}
