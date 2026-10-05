import Link from "next/link";
import { Logo } from "@/components/layout/Logo";

/** Split layout: the form on the reading-start side, a calm forest panel beside it (desktop only). */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-paper lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
      <div className="flex min-h-dvh flex-col px-5 sm:px-8">
        <header className="flex h-20 items-center">
          <Link href="/" aria-label="مُدّكِر — الصفحة الرئيسية" className="rounded-xl">
            <Logo compact />
          </Link>
        </header>
        <main id="main" className="flex flex-1 items-center justify-center pb-16 pt-4">
          <div className="w-full max-w-sm">{children}</div>
        </main>
      </div>

      <aside aria-hidden className="relative hidden overflow-hidden bg-forest text-cream lg:block">
        <div className="pattern-girih absolute inset-0 opacity-[0.14]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,var(--color-forest)_85%)]" />
        <div className="relative flex h-full flex-col justify-between p-12">
          <Logo tone="onDark" />
          <div className="max-w-sm">
            <p className="font-display text-4xl leading-snug">القليل الدائم يثبُت، والمراجعة تحفظه.</p>
            <p className="mt-5 text-cream/65">يسمّعك · يذكّرك · يفهّمك · يراجعك</p>
          </div>
          <p className="text-sm text-cream/45">نص قرآني موثّق · تفسير من مصادر معتمدة</p>
        </div>
      </aside>
    </div>
  );
}
