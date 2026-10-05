"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Button, cn, Spinner } from "@/components/ui/primitives";
import type { SpeechErrorCode } from "@/lib/recitation/speech";
import { clockLabel } from "@/lib/review/labels";
import type { RecitationRecorderController } from "./useRecitationRecorder";

/**
 * The microphone area of the recitation screen: big round mic button,
 * live timer + level meter + optional interim transcript while recording,
 * "إنهاء التسميع" / cancel, and dedicated error states.
 */
export function RecitationRecorder({
  rec,
  disabled,
  footer,
}: {
  rec: RecitationRecorderController;
  disabled?: boolean;
  /** extra content under the button in the idle state (e.g. dev simulation) */
  footer?: ReactNode;
}) {
  const { phase } = rec;
  const recording = phase === "recording";
  const busy = phase === "starting" || phase === "transcribing";

  // Esc cancels an active recording
  const cancel = rec.cancel;
  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [recording, cancel]);

  if (phase === "error" && rec.error) {
    return <RecorderError code={rec.error.code} message={rec.error.message} rec={rec} footer={footer} />;
  }

  if (rec.checked && !rec.supported) {
    return <RecorderError code="unsupported" rec={rec} footer={footer} />;
  }

  const statusText =
    phase === "starting"
      ? "نطلب إذن الميكروفون…"
      : recording
        ? "نستمع إليك… تلُ بتأنٍّ وبصوت واضح"
        : phase === "transcribing"
          ? rec.recognizer?.id === "server-upload"
            ? "نحوّل التسجيل إلى نص…"
            : "نُنهي الاستماع…"
          : "";

  return (
    <div className="flex flex-col items-center text-center">
      <p className="sr-only" aria-live="assertive">
        {recording ? "بدأ التسجيل" : phase === "transcribing" ? "انتهى التسجيل، جارٍ المعالجة" : ""}
      </p>

      {/* ── Mic button ─────────────────────────────────────────── */}
      <div className="relative grid place-items-center size-44 sm:size-48">
        {recording ? (
          <>
            <span aria-hidden className="absolute inset-3 rounded-full bg-olive/25 motion-safe:animate-breathe" />
            <LevelHalo subscribe={rec.subscribeLevel} />
          </>
        ) : null}
        <button
          type="button"
          onClick={recording ? () => void rec.stop() : () => void rec.start()}
          disabled={disabled || busy || !rec.checked}
          aria-label={recording ? "إنهاء التسميع" : "ابدأ التسميع"}
          className={cn(
            "relative grid place-items-center size-32 sm:size-36 rounded-full text-cream transition-[background-color,transform,box-shadow] duration-200",
            "shadow-[0_10px_30px_-10px_rgb(40_54_24/0.55)] focus-visible:outline-offset-4",
            recording ? "bg-terracotta hover:bg-terracotta-600" : "bg-forest hover:bg-forest-700 dark:bg-olive dark:hover:bg-olive-600 motion-safe:active:scale-95",
            "disabled:opacity-60",
          )}
        >
          {busy ? <Spinner className="size-7 border-[3px]" /> : <Icon name={recording ? "stop" : "mic"} size={recording ? 36 : 44} />}
        </button>
      </div>

      <p className="mt-2 font-semibold text-forest text-lg">{recording ? "إنهاء التسميع" : busy ? " " : "ابدأ التسميع"}</p>

      <p className="mt-1 min-h-6 text-sm text-muted" aria-live="polite">
        {statusText}
      </p>

      {recording ? (
        <div className="mt-4 w-full max-w-sm animate-rise">
          <div className="flex items-center justify-center gap-4">
            <span className="inline-flex items-center gap-2 text-forest">
              <span aria-hidden className="size-2 rounded-full bg-terracotta motion-safe:animate-pulse" />
              <span className="num text-xl font-semibold" role="timer" aria-label="مدة التسجيل">
                {clockLabel(rec.elapsed)}
              </span>
            </span>
            <LevelBars subscribe={rec.subscribeLevel} />
          </div>

          {rec.recognizer?.streamsInterim ? (
            <p
              lang="ar"
              className="mt-4 min-h-14 rounded-2xl bg-parchment/60 px-4 py-3 text-[0.95rem] leading-8 text-muted/80 line-clamp-3"
              aria-label="النص المسموع حتى الآن"
            >
              {rec.interim ? <bdi>{lastWords(rec.interim, 24)}</bdi> : <span className="text-muted/60">سيظهر ما نسمعه هنا…</span>}
            </p>
          ) : (
            <p className="mt-4 text-xs text-muted">نحوّل التسجيل إلى نص بعد الانتهاء.</p>
          )}

          <div className="mt-5 flex justify-center gap-2">
            <Button variant="primary" icon="stop" onClick={() => void rec.stop()}>
              إنهاء التسميع
            </Button>
            <Button variant="quiet" onClick={rec.cancel}>
              إلغاء
            </Button>
          </div>
          <p className="mt-2 text-[0.7rem] text-muted/70 hidden [@media(hover:hover)]:block">اضغط Esc للإلغاء</p>
        </div>
      ) : phase === "idle" && footer ? (
        <div className="mt-4 w-full">{footer}</div>
      ) : null}
    </div>
  );
}

function lastWords(text: string, n: number) {
  const ws = text.split(/\s+/).filter(Boolean);
  return (ws.length > n ? "… " : "") + ws.slice(-n).join(" ");
}

/** Halo whose size follows the live mic level — updated via refs, no re-renders. */
function LevelHalo({ subscribe }: { subscribe: (cb: (l: number) => void) => () => void }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(
    () =>
      subscribe((l) => {
        if (ref.current) ref.current.style.transform = `scale(${0.78 + l * 0.32})`;
      }),
    [subscribe],
  );
  return (
    <span
      ref={ref}
      aria-hidden
      className="absolute inset-0 rounded-full bg-olive-100 ring-1 ring-olive/20 transition-transform duration-75"
      style={{ transform: "scale(0.78)" }}
    />
  );
}

const BAR_SHAPE = [0.55, 0.8, 1, 0.8, 0.55];

function LevelBars({ subscribe }: { subscribe: (cb: (l: number) => void) => () => void }) {
  const refs = useRef<(HTMLSpanElement | null)[]>([]);
  useEffect(
    () =>
      subscribe((l) => {
        refs.current.forEach((el, i) => {
          if (el) el.style.transform = `scaleY(${Math.max(0.12, Math.min(1, l * BAR_SHAPE[i] * 1.25))})`;
        });
      }),
    [subscribe],
  );
  return (
    <span className="inline-flex items-center gap-1 h-7" role="img" aria-label="مؤشر مستوى الصوت">
      {BAR_SHAPE.map((_, i) => (
        <span
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          className="w-1.5 h-full rounded-full bg-olive origin-center transition-transform duration-75"
          style={{ transform: "scaleY(0.12)" }}
        />
      ))}
    </span>
  );
}

// ── Error states ──────────────────────────────────────────────────────────
const ERRORS: Record<SpeechErrorCode, { icon: IconName; title: string; body: ReactNode }> = {
  "permission-denied": {
    icon: "micOff",
    title: "لم يُسمح باستخدام الميكروفون",
    body: (
      <>
        <p>يحتاج التسميع إلى إذن الميكروفون. لتفعيله:</p>
        <ol className="mt-2 space-y-1 text-start list-decimal ps-5">
          <li>اضغط رمز القفل أو الإعدادات بجوار عنوان الموقع في المتصفح.</li>
          <li>اختر «الميكروفون» ثم «السماح».</li>
          <li>أعد تحميل الصفحة ثم اضغط «ابدأ التسميع».</li>
        </ol>
        <p className="mt-2 text-xs">على iPhone وiPad: الإعدادات ← Safari ← الميكروفون ← السماح.</p>
      </>
    ),
  },
  "no-microphone": {
    icon: "micOff",
    title: "لم نجد ميكروفونًا",
    body: "وصّل سماعة بميكروفون أو تحقّق من إعدادات الصوت في جهازك، ثم أعد المحاولة.",
  },
  "mic-busy": {
    icon: "micOff",
    title: "الميكروفون مشغول",
    body: "يبدو أن تطبيقًا آخر يستخدم الميكروفون. أغلقه ثم أعد المحاولة.",
  },
  unsupported: {
    icon: "info",
    title: "متصفحك لا يدعم التسجيل",
    body: "جرّب أحدث إصدار من Chrome أو Edge أو Safari، وتأكد أن الصفحة مفتوحة عبر اتصال آمن (https).",
  },
  network: {
    icon: "wifiOff",
    title: "لا يوجد اتصال بالإنترنت",
    body: "يحتاج تحويل التلاوة إلى نص إلى اتصال. تحقّق من الشبكة ثم أعد المحاولة؛ تقدّمك محفوظ.",
  },
  "stt-unavailable": {
    icon: "alert",
    title: "خدمة التعرّف على التلاوة غير متاحة الآن",
    body: "تعذّر تحويل التسجيل إلى نص في هذه اللحظة. حاول بعد قليل.",
  },
  "rate-limited": {
    icon: "clock",
    title: "محاولات كثيرة متتالية",
    body: "خذ استراحة قصيرة ثم أعد المحاولة بعد بضع دقائق.",
  },
  "too-long": {
    icon: "clock",
    title: "التسجيل أطول من المسموح",
    body: "جرّب تسميع مقطع أقصر.",
  },
  "range-too-large": {
    icon: "layers",
    title: "المقطع طويل",
    body: "يمكن تسميع ٣٠ آية كحدّ أقصى في الجلسة الواحدة.",
  },
  "unsupported-format": {
    icon: "info",
    title: "صيغة التسجيل غير مدعومة",
    body: "جرّب متصفحًا آخر مثل Chrome أو Safari.",
  },
  "no-speech": {
    icon: "volume",
    title: "لم نسمع تلاوة واضحة",
    body: "اقترب من الميكروفون، واختر مكانًا هادئًا، وتلُ بصوت مسموع ثم أعد المحاولة.",
  },
  unknown: {
    icon: "alert",
    title: "تعذّر إكمال التسجيل",
    body: "حدث خطأ غير متوقع. أعد المحاولة.",
  },
};

function RecorderError({
  code,
  message,
  rec,
  footer,
}: {
  code: SpeechErrorCode;
  message?: string;
  rec: RecitationRecorderController;
  footer?: ReactNode;
}) {
  const e = ERRORS[code] ?? ERRORS.unknown;
  const altLabel = rec.recognizer?.id === "server-upload" ? "استخدم التعرّف من المتصفح" : "أرسل التسجيل إلى الخادم";
  const serverMsg = code === "stt-unavailable" && message && /[؀-ۿ]/.test(message) ? message : null;
  return (
    <div role="alert" className="mx-auto max-w-md flex flex-col items-center text-center animate-rise">
      <span
        className={cn(
          "grid place-items-center size-16 rounded-full mb-4",
          code === "no-speech" ? "bg-sand-100 text-sand-700" : "bg-terracotta-50 text-terracotta",
        )}
      >
        <Icon name={e.icon} size={28} />
      </span>
      <h3 className="font-display text-2xl text-forest">{e.title}</h3>
      <div className="mt-2 text-sm leading-7 text-muted">{serverMsg ?? e.body}</div>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {code !== "unsupported" || rec.supported ? (
          <Button icon="mic" onClick={() => (rec.reset(), void rec.start())}>
            أعد المحاولة
          </Button>
        ) : null}
        {(code === "stt-unavailable" || code === "unsupported-format" || code === "network") && rec.canSwitch ? (
          <Button variant="ghost" onClick={rec.switchRecognizer}>
            {altLabel}
          </Button>
        ) : null}
        {rec.supported ? (
          <Button variant="quiet" onClick={rec.reset}>
            رجوع
          </Button>
        ) : null}
      </div>
      {footer ? <div className="mt-4 w-full">{footer}</div> : null}
    </div>
  );
}
