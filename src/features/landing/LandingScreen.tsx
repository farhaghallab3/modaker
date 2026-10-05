/**
 * Public landing page. Rendered on the server (no hooks here) so it stays
 * fast and indexable; the only interactive bits live in LandingActions.
 *
 * Product visuals are composed from real UI primitives and show numbers and
 * surah names only — never Quran text.
 */
import Link from "next/link";
import { Logo } from "@/components/layout/Logo";
import { Icon, type IconName } from "@/components/ui/Icon";
import { ButtonLink, ProgressRing } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { DemoButton, LandingHeaderActions } from "./LandingActions";

const container = "mx-auto w-full max-w-6xl px-4 sm:px-6";

export function LandingScreen() {
  return (
    <div className="min-h-dvh bg-paper text-ink">
      <SiteHeader />
      <main id="main">
        <Hero />
        <Loop />
        <Pillars />
        <Recitation />
        <Features />
        <Principles />
        <ClosingCta />
      </main>
      <SiteFooter />
    </div>
  );
}

// ── Header ───────────────────────────────────────────────────────────────
function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b hairline bg-paper/90 backdrop-blur">
      <div className={cn(container, "flex h-16 items-center justify-between gap-4")}>
        <Link href="/" aria-label="مُدّكِر — الصفحة الرئيسية" className="rounded-xl">
          <Logo compact />
        </Link>
        <nav aria-label="أقسام الصفحة" className="hidden md:block">
          <ul className="flex items-center gap-1 text-sm text-muted">
            <li>
              <a href="#discover" className="rounded-lg px-3 py-2 transition-colors hover:text-forest">
                كيف يرافقك
              </a>
            </li>
            <li>
              <a href="#recitation" className="rounded-lg px-3 py-2 transition-colors hover:text-forest">
                التسميع
              </a>
            </li>
            <li>
              <a href="#principles" className="rounded-lg px-3 py-2 transition-colors hover:text-forest">
                مبادئنا
              </a>
            </li>
          </ul>
        </nav>
        <LandingHeaderActions />
      </div>
    </header>
  );
}

// ── Hero ─────────────────────────────────────────────────────────────────
function Hero() {
  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden">
      <div
        aria-hidden
        className="pattern-girih pointer-events-none absolute inset-0 opacity-[0.35] [mask-image:radial-gradient(ellipse_at_top,black_10%,transparent_65%)]"
      />
      <div className={cn(container, "relative grid items-center gap-14 pb-20 pt-14 sm:pt-20 lg:grid-cols-[1.05fr_1fr] lg:gap-10 lg:pb-28 lg:pt-24")}>
        <div className="animate-rise">
          <p className="inline-flex items-center gap-2 rounded-full bg-olive-100/70 px-3.5 py-1.5 text-xs font-medium text-olive-600 sm:text-sm">
            <Icon name="leaf" size={15} />
            يسمّعك · يذكّرك · يفهّمك · يراجعك
          </p>
          <h1
            id="hero-title"
            className="mt-6 font-display text-[2.6rem] leading-[1.3] text-forest sm:text-6xl sm:leading-[1.25] lg:text-[4.1rem]"
          >
            رفيقك الذكي في رحلة حفظ القرآن
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-ink/75">
            احفظ، سمّع، افهم، وراجع القرآن بخطة تتذكر تقدمك وترافقك خطوة بخطوة.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <ButtonLink href="/register" size="lg" iconEnd="arrowForward">
              ابدأ رحلة الحفظ
            </ButtonLink>
            <ButtonLink href="#discover" size="lg" variant="ghost">
              اكتشف مُدّكِر
            </ButtonLink>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted">
            <span className="inline-flex items-center gap-1.5">
              <Icon name="check" size={16} className="text-olive" />
              خطة على قدر وقتك
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Icon name="check" size={16} className="text-olive" />
              بلا منافسة ولا ضغط
            </span>
            <DemoButton variant="quiet" className="-ms-3 sm:hidden">
              أو جرّب دون حساب
            </DemoButton>
          </div>
        </div>

        <HeroVisual />
      </div>
    </section>
  );
}

/** Composition of real UI pieces — numbers and names only. */
function HeroVisual() {
  return (
    <figure className="relative mx-auto w-full max-w-md lg:max-w-none animate-rise [animation-delay:120ms]">
      <figcaption className="sr-only">
        مثال من التطبيق: بطاقة استئناف عند سورة مريم الآية ٣٢ من ٩٨، ونتيجة تسميع بدقة ٩٤٪، تسع آيات متقنة وآيتان تحتاجان مراجعة.
      </figcaption>
      <div aria-hidden className="relative lg:ps-10">
        {/* Resume card */}
        <div className="relative overflow-hidden rounded-[1.75rem] bg-forest p-6 text-cream shadow-[var(--shadow-lift)] sm:p-7">
          <div className="pattern-girih absolute inset-0 opacity-[0.12]" />
          <div className="relative flex items-start justify-between gap-6">
            <div>
              <p className="text-sm text-cream/70">توقفت عند</p>
              <p className="mt-2 font-display text-4xl leading-tight">سورة مريم</p>
              <p className="mt-1 text-cream/80 num">الآية ٣٢ من ٩٨</p>
            </div>
            <ProgressRing value={31 / 98} size={84} stroke={6} tone="sand" label="تقدّم سورة مريم">
              <span className="text-sm font-semibold num">٣٢٪</span>
            </ProgressRing>
          </div>
          <div className="relative mt-7 flex flex-wrap gap-2">
            <span className="inline-flex h-10 items-center gap-2 rounded-2xl bg-olive-100 px-4 text-sm font-medium text-forest">
              <Icon name="play" size={14} />
              متابعة الحفظ
            </span>
            <span className="inline-flex h-10 items-center gap-2 rounded-2xl px-4 text-sm text-cream ring-1 ring-inset ring-cream/25">
              <Icon name="mic" size={16} />
              سمّع ما حفظت
            </span>
          </div>
        </div>

        {/* Recitation feedback card */}
        <div className="relative z-10 -mt-8 me-0 ms-6 rounded-[1.5rem] bg-white p-5 shadow-[var(--shadow-lift)] ring-1 ring-line sm:ms-16 lg:-ms-2 lg:me-16">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs text-muted">دقة التسميع</p>
              <p className="mt-0.5 text-3xl font-semibold text-forest num">٩٤٪</p>
            </div>
            <div className="space-y-1.5 text-sm">
              <p className="flex items-center gap-2 text-olive-600">
                <span className="size-2 rounded-full bg-olive" />
                متقن ٩ آيات
              </p>
              <p className="flex items-center gap-2 text-sand-700">
                <span className="size-2 rounded-full bg-sand" />
                تحتاج مراجعة ٢
              </p>
            </div>
          </div>
          {/* abstract word-by-word comparison: bars stand in for words */}
          <div className="mt-4 space-y-2.5 border-t hairline pt-4">
            <WordLine widths={[14, 22, 10, 18, 26, 12]} />
            <WordLine widths={[20, 12, 24, 16, 14]} marks={{ 2: "incorrect" }} />
            <WordLine widths={[16, 28, 12, 18, 20, 10]} marks={{ 4: "omitted" }} />
          </div>
        </div>

        {/* Gentle reminder chip */}
        <div className="absolute -top-5 end-2 hidden items-center gap-2 rounded-full bg-cream px-3.5 py-2 text-xs text-forest shadow-[var(--shadow-soft)] ring-1 ring-sand/30 sm:inline-flex lg:end-auto lg:start-0">
          <Icon name="bell" size={14} className="text-terracotta" />
          حان وقت مراجعة سورة الملك
        </div>
      </div>
    </figure>
  );
}

function WordLine({ widths, marks = {} }: { widths: number[]; marks?: Record<number, "incorrect" | "omitted"> }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {widths.map((w, i) => (
        <span
          key={i}
          style={{ width: `${w * 2.4}px` }}
          className={cn(
            "h-2.5 rounded-full",
            marks[i] === "incorrect" && "bg-sand",
            marks[i] === "omitted" && "bg-transparent outline-dashed outline-1 -outline-offset-1 outline-terracotta/60",
            !marks[i] && "bg-sage",
          )}
        />
      ))}
    </div>
  );
}

// ── The loop ─────────────────────────────────────────────────────────────
const LOOP: { label: string; icon: IconName }[] = [
  { label: "استئناف", icon: "bookmark" },
  { label: "فهم", icon: "lamp" },
  { label: "حفظ", icon: "mushaf" },
  { label: "تسميع", icon: "mic" },
  { label: "سؤال", icon: "chat" },
  { label: "مراجعة", icon: "review" },
];

function Loop() {
  return (
    <section aria-labelledby="loop-title" className="border-y hairline bg-parchment/50">
      <div className={cn(container, "py-10")}>
        <h2 id="loop-title" className="text-center text-sm font-medium text-olive">
          جلسة واحدة مع مُدّكِر
        </h2>
        <ol className="mt-6 grid grid-cols-3 gap-y-6 sm:grid-cols-6">
          {LOOP.map((s, i) => (
            <li key={s.label} className="relative flex flex-col items-center gap-2 text-center">
              {i < LOOP.length - 1 ? (
                <span aria-hidden className="absolute top-5 hidden h-px w-full bg-line sm:block [inset-inline-start:50%]" />
              ) : null}
              <span className="relative grid size-10 place-items-center rounded-full bg-paper text-olive ring-1 ring-line">
                <Icon name={s.icon} size={18} />
              </span>
              <span className="text-sm text-forest">
                <span className="sr-only">{`الخطوة ${i + 1}: `}</span>
                {s.label}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

// ── Four pillars ─────────────────────────────────────────────────────────
const PILLARS: { verb: string; icon: IconName; body: string }[] = [
  { verb: "احفظ", icon: "mushaf", body: "ورد يومي على قدر وقتك، يبدأ من الآية التي توقفت عندها تمامًا." },
  { verb: "سمّع", icon: "mic", body: "سمّع بصوتك، ويقارن مُدّكِر تلاوتك بالنص الموثّق كلمةً كلمة." },
  { verb: "افهم", icon: "lamp", body: "معاني الآيات وتفسيرها من مصادر معتمدة، لتحفظ ما تفهم." },
  { verb: "راجع", icon: "review", body: "مراجعة متباعدة تعيد إليك ما يوشك أن يُنسى في وقته المناسب." },
];

function Pillars() {
  return (
    <section id="discover" aria-labelledby="pillars-title" className="scroll-mt-20">
      <div className={cn(container, "py-20 lg:py-28")}>
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-olive">كيف يرافقك</p>
          <h2 id="pillars-title" className="mt-2 font-display text-3xl leading-snug text-forest sm:text-4xl">
            أربع خطوات تتكرر كل يوم، بهدوء وثبات
          </h2>
        </div>
        <ul className="mt-12 grid gap-x-10 sm:grid-cols-2 lg:grid-cols-4">
          {PILLARS.map((p, i) => (
            <li key={p.verb} className="border-t hairline py-7">
              <div className="flex items-center justify-between">
                <span className="font-display text-5xl text-forest">{p.verb}</span>
                <span className="grid size-11 place-items-center rounded-2xl bg-olive-100 text-olive">
                  <Icon name={p.icon} size={21} />
                </span>
              </div>
              <p className="mt-4 leading-8 text-ink/70">{p.body}</p>
              <p aria-hidden className="mt-4 text-xs text-muted num">
                ٠{["١", "٢", "٣", "٤"][i]}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ── Recitation (featured) ────────────────────────────────────────────────
const CHECKS: { label: string; tone: string }[] = [
  { label: "كلمة محذوفة", tone: "outline-dashed outline-1 -outline-offset-1 outline-sand/70" },
  { label: "كلمة زائدة", tone: "bg-terracotta/70" },
  { label: "كلمة مختلفة", tone: "bg-sand" },
  { label: "ترتيب الآيات", tone: "bg-olive/60" },
  { label: "توقف طويل", tone: "bg-sage" },
];

function Recitation() {
  return (
    <section id="recitation" aria-labelledby="recitation-title" className="scroll-mt-20 bg-forest text-cream">
      <div className={cn(container, "relative grid gap-12 py-20 lg:grid-cols-2 lg:items-center lg:py-24")}>
        <div>
          <p className="inline-flex items-center gap-2 text-sm text-sand">
            <Icon name="mic" size={16} />
            التسميع بالذكاء الاصطناعي
          </p>
          <h2 id="recitation-title" className="mt-3 font-display text-3xl leading-snug sm:text-4xl">
            سمّع كما تسمّع لمعلّمك، في أي وقت
          </h2>
          <p className="mt-5 max-w-lg leading-8 text-cream/80">
            اقرأ من حفظك، ويقارن مُدّكِر تلاوتك بالنص الموثّق كلمةً كلمة: الكلمات المحذوفة أو الزائدة أو المختلفة، وترتيب الآيات، ومواضع التوقف
            الطويل. ثم يضع ما تعثّرت فيه في مراجعتك القادمة.
          </p>
          <p className="mt-5 flex max-w-lg items-start gap-2 text-sm leading-7 text-cream/60">
            <Icon name="info" size={17} className="mt-1" />
            لا يحكم مُدّكِر على أحكام التجويد ومخارج الحروف؛ ذلك يبقى لمعلّمك.
          </p>
        </div>

        <div className="rounded-[1.75rem] bg-cream/[0.06] p-6 ring-1 ring-cream/10 sm:p-8">
          <p className="text-sm text-cream/70">ما يلاحظه مُدّكِر في تسميعك</p>
          <ul className="mt-5 divide-y divide-cream/10">
            {CHECKS.map((c) => (
              <li key={c.label} className="flex items-center justify-between gap-4 py-3.5">
                <span>{c.label}</span>
                <span aria-hidden className={cn("h-2.5 w-16 rounded-full", c.tone)} />
              </li>
            ))}
          </ul>
          <p className="mt-5 text-xs text-cream/50">تسجيلاتك لا تُحفظ افتراضيًا — تُحلَّل ثم تُحذف.</p>
        </div>
      </div>
    </section>
  );
}

// ── Feature grid (typographic, no cards) ─────────────────────────────────
function Features() {
  return (
    <section aria-labelledby="features-title">
      <div className={cn(container, "py-20 lg:py-28")}>
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-olive">كل ما تحتاجه، ولا شيء يشغلك</p>
          <h2 id="features-title" className="mt-2 font-display text-3xl leading-snug text-forest sm:text-4xl">
            رفيق يتذكر عنك، لتتفرغ أنت للقرآن
          </h2>
        </div>

        <div className="mt-12 grid gap-x-12 gap-y-2 md:grid-cols-2 lg:grid-cols-3">
          <Feature icon="target" title="حفظ ذكي">
            يحفظ مُدّكِر موضعك بالآية، ويقترح ورد اليوم على قدر هدفك، ويعينك على التكرار حتى يثبت المقطع في قلبك.
          </Feature>

          <Feature icon="lamp" title="فهم القرآن" badge="من مصادر معتمدة">
            معاني المفردات والتفسير من كتب معتمدة، مع ذكر المصدر دائمًا. وإن لم يجد جوابًا موثّقًا قال ذلك بوضوح.
          </Feature>

          <Feature icon="review" title="مراجعة ذكية">
            <span className="block">تكرار متباعد يعيد كل مقطع قبل أن يُنسى، ويقدّم ما تعثّرت فيه.</span>
            <span aria-hidden className="mt-4 flex items-center gap-1.5 text-[0.7rem] text-muted">
              {["يوم", "٣ أيام", "أسبوع", "أسبوعان", "شهر"].map((l, i) => (
                <span key={l} className="flex items-center gap-1.5">
                  {i ? <span className="h-px w-3 bg-line" /> : null}
                  <span className="rounded-full bg-olive-100 px-2 py-0.5 text-olive-600">{l}</span>
                </span>
              ))}
            </span>
          </Feature>

          <Feature icon="scroll" title="قصص القرآن">
            قصص يوسف ومريم وأصحاب الكهف وموسى والخضر مرتّبة على مواضعها من السور، لتربط ما تحفظه بسياقه.
          </Feature>

          <Feature icon="chart" title="تقدّم يشجّعك">
            أيام التزامك، ونسبة إتقانك، وما أتممته من السور. مقارنة بنفسك فقط — لا لوحات ترتيب ولا منافسة.
          </Feature>

          <Feature icon="bell" title="تذكير لطيف">
            تذكير في الوقت الذي تختاره، بعد الفجر أو قبل النوم، يخبرك بوردك ومراجعتك دون إلحاح.
          </Feature>
        </div>
      </div>
    </section>
  );
}

function Feature({
  icon,
  title,
  badge,
  children,
}: {
  icon: IconName;
  title: string;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <article className="border-t hairline py-8">
      <div className="flex flex-wrap items-center gap-3">
        <Icon name={icon} size={22} className="text-olive" />
        <h3 className="text-lg font-semibold text-forest">{title}</h3>
        {badge ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-sand-100 px-2.5 py-0.5 text-xs font-medium text-sand-700">
            <Icon name="shield" size={12} />
            {badge}
          </span>
        ) : null}
      </div>
      <div className="mt-3 leading-8 text-ink/70">{children}</div>
    </article>
  );
}

// ── Principles strip ─────────────────────────────────────────────────────
const PRINCIPLES: { title: string; body: string; icon: IconName }[] = [
  { title: "نص قرآني موثّق", body: "النص من مصدر موثّق ومُراجَع، ولا يولّده الذكاء الاصطناعي أبدًا.", icon: "mushaf" },
  { title: "تفسير من مصادر معتمدة", body: "كل معنى مقرون بمصدره، لتعرف من أين جاء.", icon: "book" },
  { title: "لا فتاوى من الذكاء الاصطناعي", body: "المسائل الشرعية تُحال إلى أهل العلم.", icon: "shield" },
  { title: "تسجيلاتك لا تُحفظ افتراضيًا", body: "صوتك يُحلَّل ثم يُحذف، إلا إن اخترت غير ذلك.", icon: "micOff" },
];

function Principles() {
  return (
    <section id="principles" aria-labelledby="principles-title" className="scroll-mt-20 border-y hairline bg-parchment/60">
      <div className={cn(container, "py-14")}>
        <h2 id="principles-title" className="font-display text-2xl text-forest">
          مبادئ لا نتنازل عنها
        </h2>
        <ul className="mt-8 grid gap-x-10 gap-y-7 sm:grid-cols-2 lg:grid-cols-4">
          {PRINCIPLES.map((p) => (
            <li key={p.title} className="flex gap-3">
              <Icon name={p.icon} size={20} className="mt-0.5 text-olive" />
              <div>
                <h3 className="font-semibold text-forest">{p.title}</h3>
                <p className="mt-1 text-sm leading-7 text-muted">{p.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ── Closing call to action ───────────────────────────────────────────────
function ClosingCta() {
  return (
    <section aria-labelledby="cta-title">
      <div className={cn(container, "py-20 lg:py-24")}>
        <div className="relative overflow-hidden rounded-[2rem] bg-forest px-6 py-14 text-center text-cream sm:px-12">
          <div aria-hidden className="pattern-girih absolute inset-0 opacity-[0.1]" />
          <div className="relative">
            <h2 id="cta-title" className="font-display text-3xl leading-snug sm:text-4xl">
              ابدأ اليوم، ولو بآية واحدة
            </h2>
            <p className="mx-auto mt-4 max-w-md leading-8 text-cream/75">
              أخبرنا أين وصلت، وكم يتسع وقتك، ونرتّب لك خطة تمضي معك يومًا بيوم.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <ButtonLink href="/register" size="lg" variant="secondary" iconEnd="arrowForward">
                ابدأ رحلة الحفظ
              </ButtonLink>
              <DemoButton
                size="lg"
                variant="quiet"
                className="text-cream/85! ring-1 ring-inset ring-cream/25 hover:bg-cream/10! hover:text-cream!"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Footer ───────────────────────────────────────────────────────────────
function SiteFooter() {
  return (
    <footer className="border-t hairline">
      <div className={cn(container, "flex flex-col gap-8 py-10 sm:flex-row sm:items-start sm:justify-between")}>
        <div className="max-w-xs">
          <Logo compact />
          <p className="mt-3 text-sm leading-7 text-muted">رفيقك في حفظ القرآن: يسمّعك، يذكّرك، يفهّمك، ويراجعك.</p>
        </div>
        <nav aria-label="روابط التذييل">
          <ul className="grid grid-cols-2 gap-x-10 gap-y-2 text-sm">
            <li>
              <Link href="/register" className="text-ink/75 hover:text-forest">
                إنشاء حساب
              </Link>
            </li>
            <li>
              <Link href="/login" className="text-ink/75 hover:text-forest">
                تسجيل الدخول
              </Link>
            </li>
            <li>
              <a href="#discover" className="text-ink/75 hover:text-forest">
                كيف يرافقك
              </a>
            </li>
            <li>
              <a href="#principles" className="text-ink/75 hover:text-forest">
                مبادئنا
              </a>
            </li>
          </ul>
        </nav>
      </div>
      <div className={cn(container, "border-t hairline py-5 text-xs text-muted")}>
        <p>© مُدّكِر · صُنع بعناية لأهل القرآن</p>
      </div>
    </footer>
  );
}
