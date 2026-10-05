/**
 * Persistence boundary for user data.
 *
 * The UI talks to a `UserDataRepository`, never to storage directly.
 *  - `LocalRepository`  → browser storage. Used for the demo and as an offline
 *                         cache; nothing leaves the device.
 *  - `ApiRepository`    → the versioned REST API (/api/v1/me/state), backed by
 *                         PostgreSQL. The mobile app uses the same endpoints.
 * Swap with NEXT_PUBLIC_DATA_MODE=api once the database is configured.
 */
import { EMPTY_STATE, type UserState } from "./state";

export interface UserDataRepository {
  load(): Promise<UserState | null>;
  save(state: UserState): Promise<void>;
  clear(): Promise<void>;
}

const KEY = "muzakkir:v1";

export class LocalRepository implements UserDataRepository {
  async load() {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as UserState;
      return parsed.version === 1 ? { ...EMPTY_STATE, ...parsed } : null;
    } catch {
      return null; // private mode / blocked storage → start fresh
    }
  }
  async save(state: UserState) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* storage full or blocked — state still lives in memory */
    }
  }
  async clear() {
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  }
}

export class ApiRepository implements UserDataRepository {
  constructor(private base = "/api/v1") {}
  async load() {
    const res = await fetch(`${this.base}/me/state`, { credentials: "include" });
    if (res.status === 401) return null;
    if (!res.ok) throw new Error(`load failed: ${res.status}`);
    return (await res.json()) as UserState;
  }
  async save(state: UserState) {
    await fetch(`${this.base}/me/state`, {
      method: "PUT",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(state),
    });
  }
  async clear() {
    await fetch(`${this.base}/me/state`, { method: "DELETE", credentials: "include" });
  }
}

export function createRepository(): UserDataRepository {
  return process.env.NEXT_PUBLIC_DATA_MODE === "api" ? new ApiRepository() : new LocalRepository();
}
