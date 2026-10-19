/**
 * Per-account copies of progress on this device (used when progress is not stored on the
 * server, i.e. NEXT_PUBLIC_DATA_MODE is not "api").
 *
 * Sign-in itself is handled by Clerk; this only makes sure several people (or the demo)
 * can share one browser without overwriting each other's progress:
 *   muzakkir:account:<email> → { userId, state }
 * Records written before Clerk (they also carried a password hash) are read the same way,
 * so earlier device accounts keep their progress when the same email signs in with Clerk.
 */
import type { UserState } from "./state";

const PREFIX = "muzakkir:account:";

interface DeviceRecord {
  userId?: string;
  /** Last saved progress of this account. */
  state: UserState | null;
}

const key = (email: string) => PREFIX + email.trim().toLowerCase();

function read(email: string): DeviceRecord | null {
  try {
    const raw = window.localStorage.getItem(key(email));
    return raw ? (JSON.parse(raw) as DeviceRecord) : null;
  } catch {
    return null;
  }
}

/** The progress this device holds for an account (signed-out copy), or null. */
export function loadDeviceState(email: string): UserState | null {
  return read(email)?.state ?? null;
}

/** Keeps the signed-in account's own copy of its progress up to date. */
export function saveDeviceAccountState(state: UserState): void {
  const email = state.session?.email;
  if (!email || state.demo) return;
  try {
    window.localStorage.setItem(key(email), JSON.stringify({ userId: state.session!.userId, state: { ...state, session: null } } satisfies DeviceRecord));
  } catch {
    /* storage full or blocked — progress still lives in memory */
  }
}

export function removeDeviceAccount(email: string): void {
  try {
    window.localStorage.removeItem(key(email));
  } catch {
    /* ignore */
  }
}
