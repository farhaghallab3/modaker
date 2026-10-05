"use client";
/**
 * DEV ONLY (STT_BENCHMARK=on, localhost). Records once, sends the identical blob to every model.
 * Ground truth is what you actually SAID (typed below) — never the Quran text. A model wins by being
 * literal, not by agreeing with the Quran. No scoring, no learner data, no audio stored.
 */
import { useRef, useState } from "react";

interface Fid { literal: boolean; spokenWords: number; matched: number; dropped: string[]; towardCanonical: string[]; otherWrong: string[]; silentlyCorrected: boolean }
interface Res {
  model: string;
  prompt: string;
  ok: boolean;
  latencyMs: number;
  raw?: string;
  normalized?: string;
  error?: string;
  evidence?: { segments?: { avgLogprob: number; noSpeechProb: number; compressionRatio: number }[]; words?: { text: string; probability: number }[]; note: string };
  fidelity?: Fid;
}
interface Run { case: string; spoken: string; canonical: string; results: Res[] }

const CASES = [
  { id: "1", label: "1 · صحيحة: اهدنا الصراط المستقيم", surah: 1, from: 6, to: 6, spoken: "اهدنا الصراط المستقيم", hint: "اقرأ الآية صحيحة." },
  { id: "2", label: "2 · كلمة خاطئة عمدًا في نفس العبارة", surah: 1, from: 6, to: 6, spoken: "اهدنا السراط المستقيم", hint: "غيّر كلمة عمدًا ثم اكتب في الحقل أدناه ما قلته فعلًا بالضبط." },
  { id: "3", label: "3 · توقف في المنتصف ثم صمت", surah: 1, from: 6, to: 6, spoken: "اهدنا الصراط", hint: "قل «اهدنا الصراط» ثم اصمت 3 ثوانٍ." },
  { id: "4", label: "4 · حذف كلمة", surah: 1, from: 6, to: 6, spoken: "اهدنا المستقيم", hint: "اقرأ بدون «الصراط»." },
  { id: "5", label: "5 · تكرار كلمة", surah: 1, from: 6, to: 6, spoken: "اهدنا الصراط الصراط المستقيم", hint: "كرّر «الصراط» مرتين." },
  { id: "6", label: "6 · إياك نعبد وإياك نستعين", surah: 1, from: 5, to: 5, spoken: "إياك نعبد وإياك نستعين", hint: "" },
  { id: "7", label: "7 · آية كاملة من الإخلاص", surah: 112, from: 1, to: 1, spoken: "قل هو الله أحد", hint: "" },
];

function verdict(f?: Fid): string {
  if (!f) return "—";
  if (f.literal) return "✔ حرفي";
  const parts: string[] = [];
  if (f.silentlyCorrected) parts.push("✘ صحّح/أكمل تلقائيًا إلى نص القرآن");
  if (f.towardCanonical.length) parts.push(`باتجاه القرآن (مضاف/مستبدل): ${f.towardCanonical.join(" ")}`);
  if (f.otherWrong.length) parts.push(`كلمات أخرى: ${f.otherWrong.join(" ")}`);
  if (f.dropped.length) parts.push(`لم تظهر: ${f.dropped.join(" ")}`);
  return "✘ " + parts.join(" | ");
}

export default function Bench() {
  const [c, setC] = useState(CASES[0]);
  const [spoken, setSpoken] = useState(CASES[0].spoken);
  const [experimental, setExperimental] = useState(false);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [rec, setRec] = useState(false);
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<Run | null>(null);
  const [log, setLog] = useState<Run[]>([]);
  const [err, setErr] = useState("");
  const mr = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  function take(b: Blob | null) {
    if (url) URL.revokeObjectURL(url);
    setBlob(b);
    setUrl(b ? URL.createObjectURL(b) : null);
    setOut(null);
  }

  async function start() {
    setErr("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const m = new MediaRecorder(stream);
      chunks.current = [];
      m.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      m.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        take(new Blob(chunks.current, { type: m.mimeType }));
      };
      m.start();
      mr.current = m;
      setRec(true);
    } catch {
      setErr("تعذّر الوصول إلى الميكروفون");
    }
  }
  function stop() {
    mr.current?.stop();
    setRec(false);
  }

  async function run() {
    if (!blob) return;
    setBusy(true);
    setErr("");
    const f = new FormData();
    f.append("audio", blob, "bench");
    f.append("surah", String(c.surah));
    f.append("from", String(c.from));
    f.append("to", String(c.to));
    f.append("spoken", spoken);
    if (experimental) f.append("experimental", "1");
    const r = await fetch("/api/dev/stt-benchmark", { method: "POST", body: f });
    setBusy(false);
    if (!r.ok) return setErr(`HTTP ${r.status}`);
    const j = await r.json();
    const run: Run = { case: c.label, spoken, canonical: j.canonical, results: j.results };
    setOut(run);
    setLog((l) => [...l, run]);
  }

  // Scoreboard over all logged runs, per model × prompt variant.
  const board = new Map<string, { n: number; literal: number; corrected: number; towardCanon: number; otherWrong: number; dropped: number; errors: number; ms: number }>();
  for (const run of log) {
    for (const r of run.results) {
      const k = `${r.model} · ${r.prompt === "none" ? "بدون prompt (الأساسي)" : "prompt عام (تجريبي)"}`;
      const b = board.get(k) ?? { n: 0, literal: 0, corrected: 0, towardCanon: 0, otherWrong: 0, dropped: 0, errors: 0, ms: 0 };
      b.n++;
      b.ms += r.latencyMs;
      if (!r.ok || !r.fidelity) b.errors++;
      else {
        if (r.fidelity.literal) b.literal++;
        if (r.fidelity.silentlyCorrected) b.corrected++;
        if (r.fidelity.towardCanonical.length) b.towardCanon++;
        if (r.fidelity.otherWrong.length) b.otherWrong++;
        if (r.fidelity.dropped.length) b.dropped++;
      }
      board.set(k, b);
    }
  }

  const table = (rows: Res[], title: string) =>
    rows.length === 0 ? null : (
      <div className="space-y-1">
        <h2 className="font-bold">{title}</h2>
        <table className="w-full border-collapse border text-start">
          <thead>
            <tr className="bg-gray-100">
              {["النموذج", "النص الخام (ما سمعه)", "المطبّع", "ms", "الحكم مقابل ما قلته فعلًا", "الأدلة / خطأ"].map((h) => (
                <th key={h} className="border p-1">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="align-top">
                <td className="border p-1">{r.model}</td>
                <td className="border p-1 text-base">{r.raw === "" ? "(فارغ)" : (r.raw ?? "—")}</td>
                <td className="border p-1">{r.normalized ?? ""}</td>
                <td className="border p-1">{r.latencyMs}</td>
                <td className={`border p-1 ${r.fidelity?.literal ? "bg-green-50" : "bg-red-50"}`}>{verdict(r.fidelity)}</td>
                <td className="border p-1">
                  {r.error ??
                    (r.evidence?.words
                      ? r.evidence.words.map((w) => `${w.text}:${w.probability}`).join(" ")
                      : r.evidence?.segments
                        ? r.evidence.segments.map((s) => `lp ${s.avgLogprob.toFixed(2)} ns ${s.noSpeechProb.toFixed(2)} cr ${s.compressionRatio.toFixed(2)}`).join("; ")
                        : r.evidence?.note)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );

  return (
    <main dir="rtl" className="mx-auto max-w-6xl space-y-5 p-6 text-sm">
      <h1 className="text-2xl font-bold">STT benchmark (تطوير فقط)</h1>
      <p>
        نفس ملف الصوت يُرسل لكل نموذج. <b>المعيار هو ما قلتَه فعلًا، لا نص القرآن</b>: النموذج الذي يصحّح خطأك أو يكمل الآية أو يضيف كلمة محذوفة يفشل. لا تقييم للمتعلّم ولا تخزين للصوت،
        ونص القرآن لا يُرسل لأي نموذج.
      </p>
      <div className="flex flex-wrap gap-2">
        {CASES.map((x) => (
          <button
            key={x.id}
            className={`rounded border px-3 py-1 ${c.id === x.id ? "bg-black text-white" : ""}`}
            onClick={() => {
              setC(x);
              setSpoken(x.spoken);
              take(null);
            }}
          >
            {x.label}
          </button>
        ))}
      </div>
      {c.hint && <p className="text-gray-600">{c.hint}</p>}
      <label className="flex items-center gap-2">
        ما قلتُه فعلًا (الحقيقة المرجعية):
        <input className="w-96 border px-2 py-1 text-base" value={spoken} onChange={(e) => setSpoken(e.target.value)} />
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={experimental} onChange={(e) => setExperimental(e.target.checked)} />
        أضف صفًا تجريبيًا منفصلًا: prompt عام عن القرآن (لاكتشاف هل يدفع النموذج للتصحيح نحو الآية). الاختبار الأساسي دائمًا بلا prompt.
      </label>
      <div className="flex flex-wrap items-center gap-3">
        {!rec ? (
          <button className="rounded bg-green-700 px-4 py-2 text-white" onClick={start}>● تسجيل</button>
        ) : (
          <button className="rounded bg-red-700 px-4 py-2 text-white" onClick={stop}>■ إيقاف</button>
        )}
        <input type="file" accept="audio/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) take(f); }} />
        {url && <audio controls src={url} />}
        <button disabled={!blob || busy || !spoken.trim()} className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-40" onClick={run}>
          {busy ? "جارٍ…" : "إرسال لكل النماذج"}
        </button>
      </div>
      {err && <p className="text-red-700">{err}</p>}
      {out && (
        <div className="space-y-4">
          <p>
            قلتُ: <b>{out.spoken}</b> — المرجع القرآني (للتحليل فقط، لم يُرسل): <span>{out.canonical}</span>
          </p>
          {table(out.results.filter((r) => r.prompt === "none"), "الاختبار الأساسي — بدون prompt")}
          {table(out.results.filter((r) => r.prompt !== "none"), "تجريبي منفصل — prompt عام عن القرآن")}
        </div>
      )}
      {board.size > 0 && (
        <div className="space-y-1">
          <h2 className="font-bold">لوحة النتائج التراكمية ({log.length} تسجيل)</h2>
          <table className="w-full border-collapse border text-start">
            <thead>
              <tr className="bg-gray-100">
                {["النموذج · النمط", "تجارب", "حرفي تمامًا", "صحّح كل شيء لنص القرآن", "أضاف/استبدل باتجاه القرآن", "كلمات أخرى خاطئة", "أسقط كلمات", "أخطاء API", "متوسط ms"].map((h) => (
                  <th key={h} className="border p-1">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...board.entries()].map(([k, b]) => (
                <tr key={k}>
                  <td className="border p-1">{k}</td>
                  <td className="border p-1">{b.n}</td>
                  <td className="border p-1">{b.literal}</td>
                  <td className="border p-1">{b.corrected}</td>
                  <td className="border p-1">{b.towardCanon}</td>
                  <td className="border p-1">{b.otherWrong}</td>
                  <td className="border p-1">{b.dropped}</td>
                  <td className="border p-1">{b.errors}</td>
                  <td className="border p-1">{Math.round(b.ms / b.n)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {log.length > 0 && (
        <details>
          <summary>JSON (كل التجارب — بلا صوت)</summary>
          <textarea readOnly className="h-64 w-full border p-1 font-mono text-xs" value={JSON.stringify(log, null, 1)} />
        </details>
      )}
    </main>
  );
}
