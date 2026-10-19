"use client";
/**
 * DEV ONLY. Records a clip, converts it to 16 kHz mono WAV in the browser, and saves it to a LOCAL folder
 * (CTC_CLIPS_DIR) with the ground truth of what was actually said. Nothing is sent to any model.
 */
import { useEffect, useRef, useState } from "react";

const SLOTS = [
  { cat: "correct", label: "صحيحة: اهدنا الصراط المستقيم", spoken: "اهدنا الصراط المستقيم", range: [1, 6, 6] },
  { cat: "correct", label: "صحيحة: إياك نعبد وإياك نستعين", spoken: "إياك نعبد وإياك نستعين", range: [1, 5, 5] },
  { cat: "correct", label: "صحيحة: قل هو الله أحد", spoken: "قل هو الله أحد", range: [112, 1, 1] },
  { cat: "substitution", label: "استبدال عمدي: اهدنا الطريق المستقيم", spoken: "اهدنا الطريق المستقيم", range: [1, 6, 6] },
  { cat: "stop-halfway", label: "توقف: اهدنا الصراط ثم صمت", spoken: "اهدنا الصراط", range: [1, 6, 6] },
  { cat: "omission", label: "حذف كلمة: اهدنا المستقيم", spoken: "اهدنا المستقيم", range: [1, 6, 6] },
  { cat: "repetition", label: "تكرار: اهدنا الصراط الصراط المستقيم", spoken: "اهدنا الصراط الصراط المستقيم", range: [1, 6, 6] },
  { cat: "non-quran", label: "كلام عربي عادي غير قرآني", spoken: "السلام عليكم كيف حالك اليوم", range: null },
  { cat: "silence", label: "صمت (5 ثوانٍ)", spoken: "", range: null },
  { cat: "noise", label: "ضجيج خلفية بلا كلام", spoken: "", range: null },
] as const;

async function toWav16k(blob: Blob): Promise<Blob> {
  const ctx = new AudioContext();
  const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
  await ctx.close();
  const len = Math.max(1, Math.round(decoded.duration * 16000));
  const off = new OfflineAudioContext(1, len, 16000);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start();
  const pcm = (await off.startRendering()).getChannelData(0);
  const buf = new ArrayBuffer(44 + pcm.length * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF"); v.setUint32(4, 36 + pcm.length * 2, true); w(8, "WAVE"); w(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 16000, true); v.setUint32(28, 32000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, "data"); v.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i])) * 0x7fff, true);
  return new Blob([buf], { type: "audio/wav" });
}

export default function ClipRecorder() {
  const [slot, setSlot] = useState(0);
  const [spoken, setSpoken] = useState<string>(SLOTS[0].spoken);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [rec, setRec] = useState(false);
  const [msg, setMsg] = useState("");
  const [saved, setSaved] = useState<{ id: string; category: string; spoken: string }[]>([]);
  const mr = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const s = SLOTS[slot];

  async function refresh() {
    const r = await fetch("/api/dev/clips");
    if (r.ok) setSaved((await r.json()).clips);
    else setMsg(`غير متاح (HTTP ${r.status}) — تأكد من STT_BENCHMARK=on و CTC_CLIPS_DIR`);
  }
  useEffect(() => { void refresh(); }, []);

  function take(b: Blob | null) {
    if (url) URL.revokeObjectURL(url);
    setBlob(b);
    setUrl(b ? URL.createObjectURL(b) : null);
  }
  async function start() {
    setMsg("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const m = new MediaRecorder(stream);
      chunks.current = [];
      m.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      m.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        take(await toWav16k(new Blob(chunks.current, { type: m.mimeType })));
      };
      m.start();
      mr.current = m;
      setRec(true);
    } catch {
      setMsg("تعذّر الوصول إلى الميكروفون");
    }
  }
  async function save() {
    if (!blob) return;
    const f = new FormData();
    f.append("audio", blob, "clip.wav");
    f.append("category", s.cat);
    f.append("spoken", spoken);
    if (s.range) { f.append("surah", String(s.range[0])); f.append("from", String(s.range[1])); f.append("to", String(s.range[2])); }
    const r = await fetch("/api/dev/clips", { method: "POST", body: f });
    setMsg(r.ok ? "تم الحفظ محليًا ✔" : `فشل الحفظ (HTTP ${r.status})`);
    if (r.ok) { take(null); void refresh(); }
  }

  return (
    <main dir="rtl" className="mx-auto max-w-3xl space-y-4 p-6 text-sm">
      <h1 className="text-2xl font-bold">تسجيل مقاطع الاختبار المحلي (تطوير فقط)</h1>
      <p>تُحفظ المقاطع كملفات WAV (16kHz) في مجلد محلي على جهازك فقط، ولا تُرسل لأي نموذج أو خدمة. الحقيقة المرجعية = ما قلتَه فعلًا.</p>
      <div className="flex flex-wrap gap-2">
        {SLOTS.map((x, i) => (
          <button key={i} className={`rounded border px-2 py-1 ${slot === i ? "bg-black text-white" : ""}`} onClick={() => { setSlot(i); setSpoken(x.spoken); take(null); }}>
            {i + 1}. {x.label}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2">ما قلتُه فعلًا:
        <input className="w-96 border px-2 py-1 text-base" value={spoken} onChange={(e) => setSpoken(e.target.value)} disabled={s.cat === "silence" || s.cat === "noise"} />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        {!rec ? <button className="rounded bg-green-700 px-4 py-2 text-white" onClick={start}>● تسجيل</button> : <button className="rounded bg-red-700 px-4 py-2 text-white" onClick={() => { mr.current?.stop(); setRec(false); }}>■ إيقاف</button>}
        {url && <audio controls src={url} />}
        <button disabled={!blob} className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-40" onClick={save}>حفظ محليًا</button>
      </div>
      {msg && <p>{msg}</p>}
      <h2 className="font-bold">المحفوظ ({saved.length})</h2>
      <ul className="list-disc pr-5">{saved.map((c) => <li key={c.id}>{c.category} — {c.spoken || "(بلا كلام)"}</li>)}</ul>
    </main>
  );
}
