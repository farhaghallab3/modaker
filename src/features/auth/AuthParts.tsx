"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import { Field, cn, inputClass } from "@/components/ui/primitives";
import { useApp } from "@/lib/store/AppProvider";

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function AuthHeading({ title, description }: { title: string; description: ReactNode }) {
  return (
    <div className="mb-8 animate-rise">
      <h1 className="font-display text-4xl leading-tight text-forest">{title}</h1>
      <p className="mt-2 leading-7 text-muted">{description}</p>
    </div>
  );
}

export function TextField({
  label,
  error,
  hint,
  className,
  ...input
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string }) {
  return (
    <Field label={label} error={error} hint={hint}>
      {(id, describedBy) => (
        <input
          id={id}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className={cn(inputClass, error && "ring-terracotta/60!", className)}
          // Browser extensions (password managers, temp-mail) inject attributes into auth fields before hydration.
          suppressHydrationWarning
          {...input}
        />
      )}
    </Field>
  );
}

export function PasswordField({
  label = "كلمة المرور",
  error,
  hint,
  ...input
}: React.InputHTMLAttributes<HTMLInputElement> & { label?: string; error?: string; hint?: string }) {
  const [shown, setShown] = useState(false);
  return (
    <Field label={label} error={error} hint={hint}>
      {(id, describedBy) => (
        <div className="relative">
          <input
            id={id}
            type={shown ? "text" : "password"}
            aria-describedby={describedBy}
            aria-invalid={error ? true : undefined}
            className={cn(inputClass, "pe-12", error && "ring-terracotta/60!")}
            suppressHydrationWarning
            {...input}
          />
          <button
            type="button"
            onClick={() => setShown((v) => !v)}
            aria-label={shown ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
            aria-pressed={shown}
            aria-controls={id}
            className="absolute inset-y-0 end-1.5 my-auto grid size-9 place-items-center rounded-xl text-muted transition-colors hover:bg-parchment hover:text-forest"
          >
            <Icon name={shown ? "eyeOff" : "eye"} size={18} />
          </button>
        </div>
      )}
    </Field>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="flex items-start gap-2.5 rounded-2xl bg-terracotta-50 px-4 py-3 text-sm leading-6 text-terracotta">
      <Icon name="alert" size={18} className="mt-0.5" />
      <p>{message}</p>
    </div>
  );
}
