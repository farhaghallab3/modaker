/** GET /api/v1/quran/surahs → SurahMeta[] (metadata only, no verse text). */
import { SURAHS } from "@/lib/quran/surahs";
import { json, route } from "@/server/http";

export const runtime = "nodejs";

export const GET = route(async () =>
  json(SURAHS, { headers: { "cache-control": "public, max-age=86400, s-maxage=604800, immutable" } }),
);
