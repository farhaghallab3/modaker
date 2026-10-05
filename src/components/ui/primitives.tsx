"use client";

import Link from "next/link";
import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type ComponentProps,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { Icon, type IconName } from "./Icon";
import { cn } from "@/lib/cn";

export { cn };

// ── Button ───────────────────────────────────────────────────────────────
type Variant = "primary" | "secondary" | "ghost" | "quiet" | "accent" | "danger" | "onDark" | "ghostOnDark";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-forest text-cream hover:bg-forest-700 dark:bg-olive dark:hover:bg-olive-600 shadow-[0_1px_0_rgb(255_255_255/0.08)_inset]",
  secondary: "bg-olive-100 text-forest hover:bg-sage",
  ghost: "bg-transparent text-forest ring-1 ring-inset ring-line hover:bg-parchment",
  quiet: "bg-transparent text-muted hover:text-forest hover:bg-parchment",
  accent: "bg-terracotta text-cream hover:bg-terracotta-600",
  danger: "bg-transparent text-terracotta ring-1 ring-inset ring-terracotta/30 hover:bg-terracotta-50",
  /** primary action placed on a forest surface */
  onDark: "bg-cream text-forest hover:bg-white",
  ghostOnDark: "bg-transparent text-cream ring-1 ring-inset ring-cream/25 hover:bg-cream/10",
};
const SIZES: Record<Size, string> = {
  sm: "h-9 px-3.5 text-sm gap-1.5 rounded-xl",
  md: "h-11 px-5 text-[0.95rem] gap-2 rounded-2xl",
  lg: "h-13 px-7 text-base gap-2.5 rounded-2xl",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  iconEnd?: IconName;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", icon, iconEnd, loading, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex items-center justify-center font-medium whitespace-nowrap transition-colors duration-150 disabled:opacity-50 select-none",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner /> : icon ? <Icon name={icon} size={size === "sm" ? 16 : 18} /> : null}
      {children}
      {iconEnd ? <Icon name={iconEnd} size={size === "sm" ? 16 : 18} /> : null}
    </button>
  );
});

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  icon,
  iconEnd,
  className,
  children,
  ...rest
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size; icon?: IconName; iconEnd?: IconName }) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center justify-center font-medium whitespace-nowrap transition-colors duration-150",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {icon ? <Icon name={icon} size={size === "sm" ? 16 : 18} /> : null}
      {children}
      {iconEnd ? <Icon name={iconEnd} size={size === "sm" ? 16 : 18} /> : null}
    </Link>
  );
}

export function IconButton({
  icon,
  label,
  className,
  active,
  size = 40,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string; active?: boolean; size?: number }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      style={{ width: size, height: size }}
      className={cn(
        "inline-grid place-items-center rounded-xl transition-colors",
        active ? "bg-olive-100 text-forest" : "text-muted hover:text-forest hover:bg-parchment",
        className,
      )}
      {...rest}
    >
      <Icon name={icon} size={Math.round(size * 0.48)} />
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="جارٍ التحميل"
      className={cn("inline-block size-4 rounded-full border-2 border-current border-e-transparent animate-spin", className)}
    />
  );
}

// ── Surfaces ─────────────────────────────────────────────────────────────
export function Surface({
  className,
  as: As = "div",
  tone = "paper",
  ...rest
}: HTMLAttributes<HTMLElement> & { as?: "div" | "section" | "article" | "aside"; tone?: "paper" | "parchment" | "forest" | "cream" }) {
  const tones = {
    paper: "bg-white/70 ring-1 ring-line",
    parchment: "bg-parchment",
    cream: "bg-cream ring-1 ring-sand/25",
    forest: "bg-forest text-cream",
  } as const;
  return <As className={cn("rounded-[var(--radius-card)]", tones[tone], className)} {...rest} />;
}

export function SectionHeader({
  title,
  eyebrow,
  action,
  className,
  as: As = "h2",
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  action?: ReactNode;
  className?: string;
  as?: "h1" | "h2" | "h3";
}) {
  return (
    <div className={cn("flex items-end justify-between gap-4", className)}>
      <div>
        {eyebrow ? <p className="text-xs font-medium text-olive mb-1">{eyebrow}</p> : null}
        <As className="text-lg font-semibold text-forest">{title}</As>
      </div>
      {action}
    </div>
  );
}

export function Badge({
  children,
  tone = "olive",
  className,
}: {
  children: ReactNode;
  tone?: "olive" | "sand" | "terracotta" | "muted" | "forest";
  className?: string;
}) {
  const tones = {
    olive: "bg-olive-100 text-olive-600",
    sand: "bg-sand-100 text-sand-700",
    terracotta: "bg-terracotta-50 text-terracotta",
    muted: "bg-parchment text-muted",
    forest: "bg-forest text-cream",
  } as const;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium", tones[tone], className)}>
      {children}
    </span>
  );
}

// ── Progress ─────────────────────────────────────────────────────────────
export function ProgressRing({
  value,
  size = 64,
  stroke = 6,
  tone = "olive",
  label,
  children,
}: {
  value: number; // 0..1
  size?: number;
  stroke?: number;
  tone?: "olive" | "forest" | "sand" | "cream";
  label: string;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  // Theme tokens, so the ring follows light/dark (and brand panels) automatically.
  const colors = { olive: "var(--color-olive)", forest: "var(--color-forest)", sand: "var(--color-sand)", cream: "var(--color-cream)" } as const;
  const track = tone === "cream" ? "color-mix(in srgb, var(--color-cream) 18%, transparent)" : "var(--color-olive-100)";
  return (
    <div
      className="relative inline-grid place-items-center"
      style={{ width: size, height: size }}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" style={{ stroke: track }} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          style={{ stroke: colors[tone], transition: "stroke-dashoffset 600ms cubic-bezier(.2,.7,.2,1)" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

export function ProgressBar({
  value,
  tone = "olive",
  className,
  label,
}: {
  value: number;
  tone?: "olive" | "sand" | "forest" | "terracotta";
  className?: string;
  label?: string;
}) {
  const colors = { olive: "bg-olive", sand: "bg-sand", forest: "bg-forest", terracotta: "bg-terracotta" } as const;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div
      className={cn("h-1.5 w-full rounded-full bg-olive-100 overflow-hidden", className)}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
    >
      {/* logical start: in RTL the bar fills from the right */}
      <div className={cn("h-full rounded-full transition-[width] duration-500", colors[tone])} style={{ width: `${v * 100}%` }} />
    </div>
  );
}

// ── Form controls ────────────────────────────────────────────────────────
export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: (id: string, describedBy?: string) => ReactNode;
}) {
  const id = useId();
  const hintId = hint || error ? `${id}-hint` : undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-forest">
        {label}
      </label>
      {children(id, hintId)}
      {error ? (
        <p id={hintId} className="text-xs text-terracotta" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export const inputClass =
  "w-full h-12 rounded-2xl bg-white ring-1 ring-inset ring-line px-4 text-[0.95rem] text-ink placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-olive transition-shadow";

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div>
        <label htmlFor={id} className="text-sm font-medium text-forest cursor-pointer">
          {label}
        </label>
        {description ? <p className="text-xs text-muted mt-0.5">{description}</p> : null}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-7 w-12 shrink-0 rounded-full transition-colors",
          checked ? "bg-olive" : "bg-sage",
        )}
      >
        <span
          className={cn(
            "absolute top-1 size-5 rounded-full bg-white dark:bg-[#f3eed3] shadow transition-[inset-inline-start] duration-200",
            checked ? "start-6" : "start-1",
          )}
        />
      </button>
    </div>
  );
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex rounded-2xl bg-parchment p-1 gap-1", className)}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            "px-3.5 h-9 rounded-xl text-sm transition-colors",
            o.value === value ? "bg-white dark:bg-sage text-forest shadow-[var(--shadow-soft)] font-medium" : "text-muted hover:text-forest",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── Tabs (roving focus, arrow keys respect RTL) ──────────────────────────
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: { value: T; label: string; icon?: IconName }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  function onKey(e: React.KeyboardEvent, i: number) {
    const rtl = document.dir === "rtl" || document.documentElement.dir === "rtl";
    const next = e.key === (rtl ? "ArrowLeft" : "ArrowRight");
    const prev = e.key === (rtl ? "ArrowRight" : "ArrowLeft");
    if (!next && !prev) return;
    e.preventDefault();
    const j = (i + (next ? 1 : -1) + tabs.length) % tabs.length;
    refs.current[j]?.focus();
    onChange(tabs[j].value);
  }
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto border-b hairline -mx-1 px-1 scrollbar-none">
      {tabs.map((t, i) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="tab"
            id={`tab-${t.value}`}
            aria-selected={active}
            aria-controls={`panel-${t.value}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.value)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              "relative h-12 px-4 text-sm whitespace-nowrap inline-flex items-center gap-2 transition-colors",
              active ? "text-forest font-semibold" : "text-muted hover:text-forest",
            )}
          >
            {t.icon ? <Icon name={t.icon} size={17} /> : null}
            {t.label}
            {active ? <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-forest dark:bg-sand" /> : null}
          </button>
        );
      })}
    </div>
  );
}

// ── States ───────────────────────────────────────────────────────────────
export function EmptyState({
  icon = "leaf",
  title,
  body,
  action,
  className,
}: {
  icon?: IconName;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center text-center py-12 px-6", className)}>
      <span className="grid place-items-center size-14 rounded-full bg-olive-100 text-olive mb-4">
        <Icon name={icon} size={26} />
      </span>
      <h3 className="font-display text-xl text-forest">{title}</h3>
      {body ? <p className="mt-2 max-w-sm text-sm leading-7 text-muted">{body}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = "حدث خطأ غير متوقع",
  body,
  onRetry,
  icon = "alert",
}: {
  title?: string;
  body?: ReactNode;
  onRetry?: () => void;
  icon?: IconName;
}) {
  return (
    <div role="alert" className="flex flex-col items-center text-center py-10 px-6">
      <span className="grid place-items-center size-12 rounded-full bg-terracotta-50 text-terracotta mb-3">
        <Icon name={icon} size={22} />
      </span>
      <h3 className="font-semibold text-forest">{title}</h3>
      {body ? <p className="mt-1.5 max-w-sm text-sm leading-7 text-muted">{body}</p> : null}
      {onRetry ? (
        <Button variant="ghost" size="sm" icon="review" className="mt-4" onClick={onRetry}>
          إعادة المحاولة
        </Button>
      ) : null}
    </div>
  );
}

export function LoadingSkeleton({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-3", className)} aria-busy="true" aria-label="جارٍ التحميل">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="skeleton h-4" style={{ width: `${92 - ((i * 17) % 40)}%` }} />
      ))}
    </div>
  );
}

// ── Modal ────────────────────────────────────────────────────────────────
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "md" | "lg";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby="modal-title"
      className={cn(
        "m-auto w-[calc(100%-2rem)] rounded-3xl bg-paper p-0 text-ink shadow-[var(--shadow-lift)] backdrop:bg-scrim/35 backdrop:backdrop-blur-[2px]",
        size === "md" ? "max-w-md" : "max-w-2xl",
      )}
    >
      <div className="p-6">
        <div className="flex items-start justify-between gap-4 mb-3">
          <h2 id="modal-title" className="font-display text-2xl text-forest">
            {title}
          </h2>
          <IconButton icon="x" label="إغلاق" onClick={onClose} size={36} />
        </div>
        {children}
      </div>
      {footer ? <div className="flex flex-wrap gap-2 justify-end px-6 pb-6">{footer}</div> : null}
    </dialog>
  );
}

export function ConfirmationModal({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel = "تأكيد",
  tone = "primary",
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  tone?: "primary" | "danger";
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>
            إلغاء
          </Button>
          <Button
            variant={tone === "danger" ? "accent" : "primary"}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm leading-7 text-muted">{body}</div>
    </Modal>
  );
}

export function Stat({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: IconName;
}) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 text-xs text-muted">
        {icon ? <Icon name={icon} size={14} className="text-olive" /> : null}
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold text-forest num">{value}</p>
      {hint ? <p className="text-xs text-muted mt-0.5">{hint}</p> : null}
    </div>
  );
}
