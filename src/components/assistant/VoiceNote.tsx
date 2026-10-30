"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { toArabicDigits } from "@/lib/quran/surahs";

const clock = (s: number) => `${toArabicDigits(Math.floor(s / 60))}:${toArabicDigits(String(Math.floor(s % 60)).padStart(2, "0"))}`;

/** The learner's question as a voice note (like a chat app): play it back, and see what was understood from it. */
export function VoiceNote({ url, seconds, heard }: { url: string; seconds: number; heard: string }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(0);

  useEffect(() => {
    const a = new Audio(url);
    audio.current = a;
    a.ontimeupdate = () => setAt(a.currentTime);
    a.onplay = () => setPlaying(true);
    a.onpause = () => setPlaying(false);
    a.onended = () => {
      setPlaying(false);
      setAt(0);
    };
    return () => {
      a.pause();
      a.ontimeupdate = a.onplay = a.onpause = a.onended = null;
    };
  }, [url]);

  const progress = Math.min(1, at / Math.max(1, seconds));
  // a fixed, gentle "waveform" (decorative): bars of varying height
  const bars = [6, 10, 14, 9, 16, 12, 7, 13, 18, 11, 8, 15, 10, 6, 12, 16, 9, 13, 7, 11];

  return (
    <div className="max-w-[85%]">
      <div className="flex items-center gap-3 rounded-2xl rounded-se-md bg-olive-100 px-3 py-2 text-forest">
        <button
          type="button"
          onClick={() => (playing ? audio.current?.pause() : void audio.current?.play())}
          aria-label={playing ? "إيقاف رسالتك الصوتية" : "استمع لرسالتك الصوتية"}
          className="grid size-9 shrink-0 place-items-center rounded-full bg-forest text-cream hover:bg-forest-700"
        >
          <Icon name={playing ? "pause" : "play"} size={16} />
        </button>
        <span className="flex h-6 items-center gap-[3px]" aria-hidden>
          {bars.map((h, i) => (
            <span
              key={i}
              style={{ height: h }}
              className={i / bars.length < progress ? "w-[3px] rounded-full bg-forest" : "w-[3px] rounded-full bg-forest/30"}
            />
          ))}
        </span>
        <span className="num text-xs text-forest/80">{clock(playing || at ? at : seconds)}</span>
        <Icon name="mic" size={14} className="text-olive" />
      </div>
      <p className="mt-1 px-1 text-end text-[0.72rem] leading-5 text-muted">
        <span className="sr-only">رسالة صوتية. </span>فهمتُ منك: «{heard}»
      </p>
    </div>
  );
}
