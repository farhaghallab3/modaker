"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/components/ui/primitives";
import { api, ApiError } from "@/lib/api";
import { AI_DISCLOSURE } from "@/lib/brand";
import { getSurahMeta, toArabicDigits } from "@/lib/quran/surahs";
import { uid } from "@/lib/store/state";
import type { AssistantAnswer, ChatMessage } from "@/lib/types";
import { AnswerView } from "./AnswerView";
import { useVoiceQuestion, VoiceButton } from "./VoiceQuestion";

export interface AssistantContext {
  surah?: number;
  ayah?: number;
  storySlug?: string;
}

export const ASSISTANT_SUGGESTIONS = [
  "اشرح لي الآية ٢ من سورة الفاتحة",
  "احكِ لي قصة أصحاب الكهف",
  "اختبرني في سورة مريم",
  "ما معنى هذه الكلمة؟",
] as const;

/** AI disclosure (PDF: transparency) + the sourcing promise. Shown in the page and the side sheet. */
export const ASSISTANT_DISCLAIMER = `${AI_DISCLOSURE} يذكر مُدّكِر مرجع كل إجابة.`;

/** Suggestions when the learner is on a specific ayah: «هذه الآية» is resolved from the context chip. */
export const AYAH_SUGGESTIONS = ["اشرح لي هذه الآية ببساطة", "ما معنى هذه الآية؟", "لماذا نزلت هذه الآية؟"] as const;

export function contextLabelFor(context?: AssistantContext): string | null {
  if (!context?.surah) return null;
  const name = `سورة ${getSurahMeta(context.surah)?.nameAr ?? ""}`;
  return context.ayah ? `الآية ${toArabicDigits(context.ayah)} من ${name}` : name;
}

const MAX_LEN = 1000;

function failureAnswer(e: unknown): AssistantAnswer {
  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  if (e instanceof ApiError && (e.code === "rate_limited" || e.status === 429)) {
    return {
      kind: "unavailable",
      text: "أرسلت أسئلة كثيرة في وقت قصير. خذ استراحة يسيرة، ثم عاود السؤال بعد دقائق.",
      citations: [],
      provider: "client:rate_limited",
    };
  }
  if (offline || (e instanceof TypeError && !(e instanceof ApiError))) {
    return {
      kind: "unavailable",
      text: "يبدو أنك غير متصل الآن. تحقّق من الاتصال ثم أعد المحاولة.",
      citations: [],
      provider: "client:offline",
    };
  }
  if (e instanceof ApiError && e.code === "quran_source_unavailable") {
    return {
      kind: "unavailable",
      text: "تعذّر الوصول إلى مصدر النصوص الموثّق الآن، فلم أستطع الإجابة. حاول مرة أخرى بعد قليل.",
      citations: [],
      provider: "quran-source",
    };
  }
  return {
    kind: "unavailable",
    text: "حدث خلل أثناء البحث في المصادر. لم أُجب حتى لا أقول بغير علم — أعد المحاولة بعد قليل.",
    citations: [],
    provider: "client:error",
  };
}

/**
 * Grounded assistant conversation.
 * - "page": flows with the document; the composer sticks above the mobile bottom nav.
 * - "sheet": fills its container (drawer), with its own scroll area.
 */
export function AIChat({
  context,
  variant = "page",
  header,
  onClearContext,
  className,
}: {
  context?: AssistantContext;
  variant?: "page" | "sheet";
  /** Rendered above the conversation (e.g. a context picker). */
  header?: ReactNode;
  onClearContext?: () => void;
  className?: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const hintId = useId();
  const sheet = variant === "sheet";

  const [voiceNote, setVoiceNote] = useState(false);
  const voice = useVoiceQuestion({
    // the existing upload needs a valid ayah range; the audio is a QUESTION, so only the surah/ayah validity matters
    range: { surah: context?.surah ?? 1, from: context?.ayah ?? 1, to: context?.ayah ?? 1 },
    onText: (t) => {
      setDraft(t.slice(0, MAX_LEN));
      setVoiceNote(true);
      requestAnimationFrame(() => inputRef.current?.focus());
    },
  });
  const contextLabel = contextLabelFor(context);
  const suggestions = context?.ayah ? AYAH_SUGGESTIONS : ASSISTANT_SUGGESTIONS;

  // keep the latest exchange in view
  useEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (sheet && scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: reduce ? "auto" : "smooth" });
    } else if (!sheet && messages.length) {
      endRef.current?.scrollIntoView({ block: "end", behavior: reduce ? "auto" : "smooth" });
    }
  }, [messages, pending, sheet]);

  const ask = useCallback(
    async (question: string) => {
      const q = question.trim().slice(0, MAX_LEN);
      if (!q || pending) return;
      const now = new Date().toISOString();
      setMessages((m) => [...m, { id: uid("q"), role: "user", content: q, createdAt: now }]);
      setDraft("");
      setPending(true);
      let answer: AssistantAnswer;
      try {
        answer = await api.ask(q, context);
      } catch (e) {
        answer = failureAnswer(e);
      }
      setMessages((m) => [
        ...m,
        { id: uid("a"), role: "assistant", content: answer.text, answer, createdAt: new Date().toISOString() },
      ]);
      setPending(false);
    },
    [context, pending],
  );

  /** Re-ask the question that produced a failed answer, replacing the failure. */
  function retry(answerId: string) {
    const i = messages.findIndex((m) => m.id === answerId);
    const question = messages
      .slice(0, i)
      .reverse()
      .find((m) => m.role === "user")?.content;
    if (!question) return;
    setMessages((m) => m.filter((x, k) => x.id !== answerId && !(k === i - 1 && x.role === "user")));
    void ask(question);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void ask(draft);
    }
  }

  function autosize(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  useEffect(() => {
    if (inputRef.current && !draft) inputRef.current.style.height = "";
  }, [draft]);

  const empty = messages.length === 0 && !pending;

  return (
    <div className={cn("flex flex-col", sheet ? "h-full min-h-0" : "min-h-[calc(100dvh-16rem)]", className)}>
      {header}

      <div
        ref={scrollRef}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label="المحادثة مع مُدّكِر"
        className={cn("flex-1", sheet ? "min-h-0 overflow-y-auto overscroll-contain px-5 sm:px-6 py-6" : "py-4")}
      >
        {empty ? (
          <Welcome onPick={(s) => void ask(s)} contextLabel={contextLabel} items={suggestions} />
        ) : (
          <ol className="space-y-8">
            {messages.map((m) =>
              m.role === "user" ? (
                <li key={m.id} className="flex justify-end animate-rise">
                  <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-se-md bg-olive-100 px-4 py-2.5 text-[0.95rem] leading-7 text-forest">
                    <span className="sr-only">سؤالك: </span>
                    {m.content}
                  </p>
                </li>
              ) : (
                <li key={m.id} className="flex gap-3 animate-rise">
                  <Seal />
                  <div className="min-w-0 flex-1">
                    <span className="sr-only">إجابة مُدّكِر: </span>
                    {m.answer ? (
                      <AnswerView
                        answer={m.answer}
                        idPrefix={m.id}
                        onRetry={m.answer.kind === "unavailable" ? () => retry(m.id) : undefined}
                      />
                    ) : (
                      <p className="leading-8">{m.content}</p>
                    )}
                  </div>
                </li>
              ),
            )}
            {pending ? (
              <li className="flex gap-3 items-center" aria-busy="true">
                <Seal searching />
                <p className="text-sm text-muted">يبحث في المصادر الموثوقة…</p>
              </li>
            ) : null}
          </ol>
        )}
        <div ref={endRef} className="scroll-mb-56" aria-hidden />
      </div>

      <div
        className={cn(
          "bg-paper/95 backdrop-blur",
          sheet ? "border-t hairline px-4 sm:px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]" : "sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] lg:bottom-0 z-10 pt-3 pb-4 border-t hairline",
        )}
      >
        {contextLabel ? (
          <div className="mb-2 flex items-center gap-2 text-xs text-muted">
            <Icon name="bookmark" size={14} className="text-olive" />
            <span>
              تسأل في سياق <span className="font-medium text-forest">{contextLabel}</span>
            </span>
            {onClearContext ? (
              <button type="button" onClick={onClearContext} className="ms-1 rounded-md px-1.5 text-muted underline underline-offset-4 hover:text-forest">
                إزالة
              </button>
            ) : null}
          </div>
        ) : null}
        {!empty ? <Suggestions onPick={(s) => void ask(s)} disabled={pending} compact items={suggestions} /> : null}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void ask(draft);
          }}
          className="flex items-end gap-2 rounded-2xl bg-white ring-1 ring-line focus-within:ring-2 focus-within:ring-olive p-1.5 ps-4 transition-shadow"
        >
          <label htmlFor={`${hintId}-input`} className="sr-only">
            اكتب سؤالك
          </label>
          <textarea
            id={`${hintId}-input`}
            ref={inputRef}
            rows={1}
            value={draft}
            maxLength={MAX_LEN}
            onChange={(e) => {
              setVoiceNote(false);
              setDraft(e.target.value);
              autosize(e.target);
            }}
            onKeyDown={onKeyDown}
            placeholder="اسأل عن آية أو سورة أو قصة…"
            aria-describedby={hintId}
            className="min-h-10 flex-1 resize-none bg-transparent py-2 text-[0.95rem] leading-6 text-ink placeholder:text-muted/70 focus:outline-none"
          />
          {voice.supported ? <VoiceButton state={voice.state} onStart={() => void voice.start()} onStop={voice.stop} disabled={pending} /> : null}
          <button
            type="submit"
            disabled={!draft.trim() || pending}
            aria-label="إرسال السؤال"
            className="grid place-items-center size-10 shrink-0 rounded-xl bg-forest text-cream transition-colors hover:bg-forest-700 dark:bg-olive dark:hover:bg-olive-600 disabled:bg-sage dark:disabled:bg-sage disabled:text-muted"
          >
            <Icon name="send" size={18} />
          </button>
        </form>
        {voice.state === "recording" ? (
          <p role="status" className="mt-2 text-xs text-terracotta">
            نستمع إلى سؤالك… اضغط زر الإيقاف عند الانتهاء.
          </p>
        ) : voice.state === "transcribing" ? (
          <p role="status" className="mt-2 text-xs text-muted">
            نحوّل صوتك إلى نص…
          </p>
        ) : voice.error ? (
          <p role="alert" className="mt-2 text-xs text-terracotta">
            {voice.error}
          </p>
        ) : voiceNote && draft.trim() ? (
          <p role="status" className="mt-2 text-xs leading-5 text-ink/80">
            هذا ما فهمناه من صوتك، وقد يخطئ التعرّف على الكلام. راجع النص وصحّحه إن لزم، ثم اضغط إرسال.
          </p>
        ) : null}
        <p id={hintId} className="sr-only">
          اضغط Enter للإرسال، و Shift مع Enter لسطر جديد.
        </p>
        <p className="mt-2 flex items-start gap-1.5 text-[0.72rem] leading-5 text-muted">
          <Icon name="shield" size={13} className="mt-0.5 text-olive" />
          {ASSISTANT_DISCLAIMER}
        </p>
      </div>
    </div>
  );
}

function Seal({ searching = false }: { searching?: boolean }) {
  return (
    <span className="relative mt-0.5 grid place-items-center size-8 shrink-0 rounded-xl bg-forest text-sand" aria-hidden>
      {searching ? <span className="absolute inset-0 rounded-xl bg-olive animate-breathe" /> : null}
      <Icon name="lamp" size={16} className="relative" />
    </span>
  );
}

function Welcome({ onPick, contextLabel, items }: { onPick: (s: string) => void; contextLabel: string | null; items: readonly string[] }) {
  return (
    <div className="flex flex-col items-center text-center py-6 sm:py-10">
      <span className="grid place-items-center size-14 rounded-2xl bg-forest text-sand shadow-[var(--shadow-soft)]">
        <Icon name="lamp" size={26} />
      </span>
      <h2 className="mt-5 font-display text-2xl sm:text-3xl text-forest">بماذا أُعينك اليوم؟</h2>
      <p className="mt-2 max-w-sm text-sm leading-7 text-muted">
        اسأل عن معنى آية، أو قصة قرآنية، أو اطلب اختبارًا في حفظك
        {contextLabel ? ` من ${contextLabel}` : ""}. ستجد مع كل إجابة مصدرها.
      </p>
      <Suggestions onPick={onPick} className="mt-6 justify-center" items={items} />
    </div>
  );
}

function Suggestions({
  onPick,
  disabled,
  compact = false,
  className,
  items = ASSISTANT_SUGGESTIONS,
}: {
  onPick: (s: string) => void;
  disabled?: boolean;
  compact?: boolean;
  className?: string;
  items?: readonly string[];
}) {
  return (
    <div
      role="group"
      aria-label="اقتراحات"
      className={cn(
        "flex gap-2",
        compact ? "mb-2 overflow-x-auto -mx-1 px-1 pb-1 [scrollbar-width:none]" : "flex-wrap",
        className,
      )}
    >
      {items.map((s) => (
        <button
          key={s}
          type="button"
          disabled={disabled}
          onClick={() => onPick(s)}
          className={cn(
            "shrink-0 rounded-full ring-1 ring-inset ring-line bg-white/70 text-forest transition-colors hover:bg-olive-100 hover:ring-olive/30 disabled:opacity-50",
            compact ? "h-8 px-3 text-xs" : "h-10 px-4 text-sm",
          )}
        >
          {s}
        </button>
      ))}
    </div>
  );
}
