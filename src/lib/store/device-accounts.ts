/**
 * Device-only accounts, used when the server has no database (`no_database`).
 *
 * Each account lives under its own key, by email, so several people (or the
 * demo) can use the same browser without overwriting each other:
 *   muzakkir:account:<email> → { userId, salt, hash, state }
 * The password is kept only as a PBKDF2-SHA256 hash (WebCrypto). This protects
 * the account on this browser only — real accounts need the server database.
 */
import type { UserState } from "./state";

const PREFIX = "muzakkir:account:";
const ITERATIONS = 100_000;

export interface DeviceAccount {
  userId: string;
  salt: string;
  hash: string;
  /** Last saved progress of this account (null until the first save). */
  state: UserState | null;
}

const key = (email: string) => PREFIX + email.trim().toLowerCase();

function read(email: string): DeviceAccount | null {
  try {
    const raw = window.localStorage.getItem(key(email));
    return raw ? (JSON.parse(raw) as DeviceAccount) : null;
  } catch {
    return null;
  }
}

function write(email: string, account: DeviceAccount): void {
  try {
    window.localStorage.setItem(key(email), JSON.stringify(account));
  } catch {
    /* storage full or blocked — the session still works in memory */
  }
}

const toB64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(password: string, salt: Uint8Array<ArrayBuffer>): Promise<string> {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password.normalize("NFKC")), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS }, material, 256);
  return toB64(bits);
}

export function hasDeviceAccount(email: string): boolean {
  return read(email) !== null;
}

/** Creates the account record. Caller checks `hasDeviceAccount` first. */
export async function createDeviceAccount(email: string, userId: string, password: string, state: UserState | null): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  write(email, { userId, salt: toB64(salt), hash: await derive(password, salt), state });
}

/** The account if the password matches, otherwise null. */
export async function verifyDeviceAccount(email: string, password: string): Promise<DeviceAccount | null> {
  const account = read(email);
  if (!account) return null;
  return (await derive(password, fromB64(account.salt))) === account.hash ? account : null;
}

/** Keeps the signed-in account's own copy of its progress up to date. */
export function saveDeviceAccountState(state: UserState): void {
  const email = state.session?.email;
  if (!email || state.demo) return;
  const account = read(email);
  if (account) write(email, { ...account, state: { ...state, session: null } });
}

export function removeDeviceAccount(email: string): void {
  try {
    window.localStorage.removeItem(key(email));
  } catch {
    /* ignore */
  }
}
