"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { ButtonLink } from "@/components/ui/primitives";
import { BRAND } from "@/lib/brand";
import { buildCoachFacts, coachInput, templateMessage, type CoachActionId } from "@/lib/coach/facts";
import { useApp } from "@/lib/store/AppProvider";

interface CoachResponse {
  source: "ai" | "template";
  message: string | null;
  primary: CoachActionId;
  secondary: CoachActionId | null;
}

/** Small stable hash of the model's input so the same learner state is not re-requested during a session. */
function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/**
 * «مُدّكِر معك اليوم» — the AI starts the session. Facts (resume point, due/weak reviews, today's portion) come
 * from the learner's persisted state and the actions/routes are computed on this device; the AI only phrases a
 * short message and picks among those actions. If it is unavailable or its answer fails validation, the
 * deterministic template is shown — the card always works and never shows a technical error.
 */
export function CoachCard() {
  const { state, ready } = useApp();
  const facts = useMemo(() => buildCoachFacts(state), [state]);
  const input = useMemo(() => coachInput(facts), [facts]);
  const key = useMemo(() => `coach:${hash(JSON.stringify(input))}`, [input]);

  const [result, setResult] = useState<CoachResponse | null>(null);
  const [pending, setPending] = useState(true);
  const seq = useRef(0);

  useEffect(() => {
    if (!ready) return;
    const mine = ++seq.current;
    try {
      const cached = sessionStorage.getItem(key);
      if (cached) {
        setResult(JSON.parse(cached) as CoachResponse);
        setPending(false);
        return;
      }
    } catch {
      /* storage unavailable: just ask */
    }
    setPending(true);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 10_000);
    fetch("/api/v1/coach", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ facts: input }), signal: ctl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<CoachResponse>) : null))
      .catch(() => null)
      .then((r) => {
        if (mine !== seq.current) return;
        const out: CoachResponse = r ?? { source: "template", message: null, primary: facts.recommended[0], secondary: facts.recommended[1] ?? null };
        setResult(out);
        setPending(false);
        try {
          if (r) sessionStorage.setItem(key, JSON.stringify(out));
        } catch {
          /* ignore */
        }
      })
      .finally(() => clearTimeout(timer));
    return () => ctl.abort();
  }, [ready, key, input, facts.recommended]);

  const message = result?.message ?? templateMessage(facts);
  const primary = facts.actions.find((a) => a.id === (result?.primary ?? facts.recommended[0]));
  const secondaryId = result ? result.secondary : (facts.recommended[1] ?? null);
  const secondary = secondaryId ? facts.actions.find((a) => a.id === secondaryId && a.id !== primary?.id) : undefined;
  const speak = useSpeech(message);

  return (
    <section aria-label={`${BRAND.name} معك اليوم`} className="relative mb-6 overflow-hidden rounded-[var(--radius-card)] bg-cream ring-1 ring-sand/30 px-5 py-5 sm:px-7 sm:py-6 animate-rise">
      <div aria-hidden className="pattern-girih absolute inset-0 opacity-[0.06]" />
      <div className="relative">
        <div className="flex flex-wrap items-center gap-2">
          <span className="grid size-8 place-items-center rounded-full bg-forest text-sand" aria-hidden>
            <Icon name="lamp" size={17} />
          </span>
          <h2 className="font-display text-2xl text-forest">{BRAND.name} معك اليوم ✨</h2>
          {result?.source === "ai" && !pending ? (
            <span className="rounded-full bg-olive-100 px-2.5 py-0.5 text-xs text-olive-600" title="رسالة كتبها مساعد ذكي بناءً على حالة حفظك الفعلية">
              مساعد ذكي
            </span>
          ) : null}
        </div>

        {pending ? (
          <div role="status" aria-live="polite" className="mt-3 space-y-2">
            <p className="text-sm text-muted">{BRAND.name} يجهّز خطة اليوم من واقع حفظك…</p>
            <div className="skeleton h-4 w-11/12 rounded-lg" />
            <div className="skeleton h-4 w-8/12 rounded-lg" />
          </div>
        ) : (
          <p className="mt-3 text-[1.05rem] leading-8 text-ink/90" aria-live="polite">
            {message}
          </p>
        )}

        {!pending && primary ? (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <ButtonLink href={primary.href} icon={ICON[primary.id]}>
              {primary.label}
            </ButtonLink>
            {secondary ? (
              <ButtonLink href={secondary.href} variant="ghost" icon={ICON[secondary.id]}>
                {secondary.label}
              </ButtonLink>
            ) : null}
            {speak.available ? (
              <button type="button" onClick={speak.toggle} aria-pressed={speak.speaking} className="ms-auto inline-flex items-center gap-1.5 rounded-xl px-3 h-9 text-sm text-muted hover:text-forest hover:bg-parchment">
                <Icon name="volume" size={16} />
                {speak.speaking ? "إيقاف" : "اسمعها"}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

const ICON = { "fix-weak": "review", review: "review", memorize: "play", recite: "mic", read: "mushaf" } as const;

/** Browser speech synthesis — shown only when an Arabic voice exists. Never blocks the card. */
function useSpeech(text: string) {
  const [available, setAvailable] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const check = () => setAvailable(window.speechSynthesis.getVoices().some((v) => v.lang.toLowerCase().startsWith("ar")));
    check();
    window.speechSynthesis.addEventListener?.("voiceschanged", check);
    return () => {
      window.speechSynthesis.removeEventListener?.("voiceschanged", check);
      window.speechSynthesis.cancel();
    };
  }, []);
  return {
    available,
    speaking,
    toggle() {
      const synth = window.speechSynthesis;
      if (speaking) {
        synth.cancel();
        setSpeaking(false);
        return;
      }
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "ar-SA";
      u.voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith("ar")) ?? null;
      u.onend = () => setSpeaking(false);
      u.onerror = () => setSpeaking(false);
      setSpeaking(true);
      synth.speak(u);
    },
  };
}
