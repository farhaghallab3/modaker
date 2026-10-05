/**
 * Password hashing with scrypt (node:crypto). Stored format:
 *   scrypt$<N>$<r>$<p>$<salt b64url>$<hash b64url>
 * Parameters are stored per hash so they can be raised later without
 * invalidating existing accounts (see needsRehash).
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";

const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;
const SALT_BYTES = 16;

function scrypt(password: string, salt: Buffer, keylen: number, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCb(password.normalize("NFKC"), salt, keylen, { ...opts, maxmem: 64 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await scrypt(password, salt, KEYLEN, { N, r: R, p: P });
  return ["scrypt", N, R, P, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, "base64url");
  try {
    const actual = await scrypt(password, Buffer.from(saltB64, "base64url"), expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function needsRehash(stored: string): boolean {
  const [, n, r, p] = stored.split("$");
  return Number(n) < N || Number(r) !== R || Number(p) !== P;
}

/** A dummy hash used to equalise timing when the email does not exist. */
let dummy: string | null = null;
export async function dummyVerify(password: string): Promise<void> {
  dummy ??= await hashPassword("timing-equaliser");
  await verifyPassword(password, dummy);
}
