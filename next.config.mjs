import path from "node:path";
import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  // Microphone is needed for recitation; everything else is denied.
  { key: "Permissions-Policy", value: "microphone=(self), camera=(), geolocation=()" },
];

/**
 * Developer-only tools (STT benchmark, clip recorder) live in files named `page.dev.tsx` / `route.dev.ts`.
 * They are routes ONLY when DEV_TOOLS=1 is set; otherwise those files are not routes and are not compiled into
 * the build at all, so a normal production build cannot reach or bundle them.
 */
const pageExtensions = ["tsx", "ts", "jsx", "js", ...(process.env.DEV_TOOLS === "1" ? ["dev.tsx", "dev.ts"] : [])];

const nextConfig = {
  reactStrictMode: true,
  pageExtensions,
  // Pin the workspace root; a stray lockfile in the home directory otherwise confuses Next's inference.
  outputFileTracingRoot: path.dirname(fileURLToPath(import.meta.url)),
  images: {
    remotePatterns: [{ protocol: "https", hostname: "i.ytimg.com" }],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
