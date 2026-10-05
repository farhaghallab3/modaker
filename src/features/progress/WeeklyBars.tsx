import { cn } from "@/lib/cn";
import { n } from "@/features/shared/format";

export interface DayBar {
  date: string;
  weekday: string;
  memorized: number;
  reviewed: number;
  isToday: boolean;
}

/**
 * Seven-day activity bars (memorized + reviewed ayahs). Pure divs: each bar
 * carries its own accessible label; the visual height is decorative.
 */
export function WeeklyBars({ days, className }: { days: DayBar[]; className?: string }) {
  const max = Math.max(1, ...days.map((d) => d.memorized + d.reviewed));
  const total = days.reduce((a, d) => a + d.memorized + d.reviewed, 0);
  return (
    <figure className={className}>
      <ul className="flex h-40 items-end justify-between gap-2 sm:gap-4" aria-label={`نشاط آخر سبعة أيام: ${n(total)} آية بين حفظ ومراجعة`}>
        {days.map((d) => {
          const value = d.memorized + d.reviewed;
          const h = value ? Math.max(8, (value / max) * 100) : 0;
          return (
            <li key={d.date} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
              <span className="sr-only">
                {d.isToday ? "اليوم" : d.weekday}: حفظ {n(d.memorized)}، مراجعة {n(d.reviewed)}
              </span>
              <span className={cn("text-[0.7rem] num", value ? "text-muted" : "text-transparent")} aria-hidden>
                {n(value)}
              </span>
              <span className="relative flex w-full max-w-10 flex-1 items-end" aria-hidden>
                <span className={cn("absolute inset-0 rounded-xl", d.isToday ? "bg-sage" : "bg-olive-100/60")} />
                <span
                  className={cn(
                    "relative flex w-full flex-col overflow-hidden rounded-xl transition-[height] duration-500",
                    d.isToday && "ring-2 ring-forest ring-offset-2 ring-offset-paper",
                  )}
                  style={{ height: `${h}%` }}
                >
                  {d.memorized ? <span className="w-full bg-sand" style={{ height: `${(d.memorized / value) * 100}%` }} /> : null}
                  {d.reviewed ? <span className={cn("w-full flex-1", d.isToday ? "bg-forest dark:bg-sand" : "bg-olive")} /> : null}
                </span>
              </span>
              <span className={cn("text-xs", d.isToday ? "font-semibold text-forest" : "text-muted")} aria-hidden>
                {d.isToday ? "اليوم" : d.weekday}
              </span>
            </li>
          );
        })}
      </ul>
      <figcaption className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-sand" aria-hidden />
          حفظ جديد
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-olive" aria-hidden />
          مراجعة
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm ring-2 ring-forest" aria-hidden />
          اليوم
        </span>
      </figcaption>
    </figure>
  );
}
