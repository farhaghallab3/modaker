/**
 * App ↔ DB enum mapping. The app uses hyphenated values ("needs-review",
 * "juz-amma"); Prisma enum members can't contain "-", so the DB stores "_".
 */
export function toDbEnum<T extends string>(v: T): string {
  return v.replace(/-/g, "_");
}

export function fromDbEnum<T extends string>(v: string): T {
  return v.replace(/_/g, "-") as T;
}
