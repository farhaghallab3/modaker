/** Shared checks for auth routes. */
import { hasDatabase } from "../db";
import { apiError } from "../errors";

/** Auth routes need PostgreSQL; the client falls back to device-only accounts on 503 no_database. */
export function requireDatabase(): void {
  if (!hasDatabase()) throw apiError(503, "no_database");
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
