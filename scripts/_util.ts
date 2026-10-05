/** Small helpers shared by the CLI scripts (no dependencies). */

export interface Args {
  flags: Set<string>;
  values: Map<string, string>;
}

/** Parses `--flag`, `--key value` and `--key=value`. */
export function parseArgs(argv = process.argv.slice(2)): Args {
  const flags = new Set<string>();
  const values = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const eq = a.indexOf("=");
    if (eq > 0) values.set(a.slice(2, eq), a.slice(eq + 1));
    else if (argv[i + 1] && !argv[i + 1].startsWith("--")) values.set(a.slice(2), argv[++i]);
    else flags.add(a.slice(2));
  }
  return { flags, values };
}

/** "1,2,18" or "1-10" → [1,2,18] / [1..10]; default all 114. */
export function surahList(spec?: string): number[] {
  if (!spec) return Array.from({ length: 114 }, (_, i) => i + 1);
  const out = new Set<number>();
  for (const part of spec.split(",")) {
    const [a, b] = part.split("-").map(Number);
    for (let n = a; n <= (b || a); n++) if (n >= 1 && n <= 114) out.add(n);
  }
  return [...out].sort((x, y) => x - y);
}

/** Run `fn` over items with bounded concurrency, preserving order of results. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i], i);
      }
    }),
  );
  return results;
}

export function log(...a: unknown[]) {
  console.log(new Date().toISOString().slice(11, 19), ...a);
}
