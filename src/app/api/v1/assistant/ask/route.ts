/**
 * POST /api/v1/assistant/ask  { question (≤ 1000 chars), context?: { surah?, ayah?, storySlug? } }
 *   → AssistantAnswer
 * Retrieval-grounded over approved sources; see src/server/rag/assistant.ts.
 * Signed-in users' Q&A is saved to ChatConversation (deleted with the account), EXCEPT personal-case
 * (Level D) questions, which are never persisted.
 */
import type { AssistantAnswer } from "@/lib/types";
import { optionalSession } from "@/server/auth";
import { clientIp, enforceRateLimit, json, readJson, route } from "@/server/http";
import { answerQuestion } from "@/server/rag/assistant";
import { toDbEnum } from "@/server/user/mappers";
import { shouldPersistExchange } from "@/server/safety/privacy";
import { askSchema } from "@/server/validation";

export const runtime = "nodejs";
export const maxDuration = 60;

export const POST = route(async (req) => {
  const session = await optionalSession(req);
  enforceRateLimit(req, "assistant", session?.userId);
  const { question, context } = await readJson(req, askSchema, 16 * 1024);

  const answer = await answerQuestion({ question, context, clientKey: session?.userId ?? `ip:${clientIp(req)}` });
  // Personal-case (Level D) questions are never stored — see src/server/safety/privacy.ts.
  if (session && shouldPersistExchange(answer)) await saveExchange(session.userId, question, answer).catch((e) => console.warn("[assistant] save failed:", e.message));
  return json(answer);
});

const CONVERSATION_IDLE_MS = 6 * 3600_000;

async function saveExchange(userId: string, question: string, answer: AssistantAnswer) {
  const { getPrisma } = await import("@/server/db");
  const prisma = await getPrisma();
  const recent = await prisma.chatConversation.findFirst({
    where: { userId, updatedAt: { gte: new Date(Date.now() - CONVERSATION_IDLE_MS) } },
    orderBy: { updatedAt: "desc" },
  });
  const conversation = recent ?? (await prisma.chatConversation.create({ data: { userId, title: question.slice(0, 80) } }));
  await prisma.$transaction([
    prisma.chatMessage.create({ data: { conversationId: conversation.id, role: "user", content: question } }),
    prisma.chatMessage.create({
      data: {
        conversationId: conversation.id,
        role: "assistant",
        content: answer.text,
        answerKind: toDbEnum(answer.kind) as never,
        provider: answer.provider,
        safetyLevel: answer.safetyLevel ?? null,
        answerType: answer.answerType ?? null,
        abstainReason: answer.abstainReason ?? null,
        generationUsed: answer.generation?.used ?? false,
        blocks: answer.blocks ? (JSON.parse(JSON.stringify(answer.blocks)) as never) : undefined,
        citations: { create: answer.citations.map((c) => ({ ...c, url: c.url ?? null })) },
      },
    }),
    prisma.chatConversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } }),
  ]);
}
