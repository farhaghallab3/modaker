"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/primitives";
import { useApp } from "@/lib/store/AppProvider";
import { AuthHeading, EMAIL_RE, FormError, PasswordField, TextField } from "./AuthParts";

type Values = { email: string; password: string };
type Errors = Partial<Record<keyof Values, string>>;

function validate(v: Values): Errors {
  const e: Errors = {};
  if (!v.email.trim()) e.email = "اكتب بريدك الإلكتروني.";
  else if (!EMAIL_RE.test(v.email.trim())) e.email = "يبدو أن البريد الإلكتروني غير مكتمل.";
  if (!v.password) e.password = "اكتب كلمة المرور.";
  return e;
}

/** Only allow same-origin, path-only redirects. */
function safeNext(raw: string | null): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return null;
  return raw;
}

export function LoginScreen() {
  const { state, actions } = useApp();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const formRef = useRef<HTMLFormElement>(null);

  const [values, setValues] = useState<Values>({ email: "", password: "" });
  const [touched, setTouched] = useState<Partial<Record<keyof Values, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Route once the signed-in state has landed in the store.
  useEffect(() => {
    if (!signedIn || !state.session) return;
    if (!state.profile?.onboarded) router.replace("/onboarding");
    else router.replace(next ?? "/dashboard");
  }, [signedIn, state.session, state.profile?.onboarded, next, router]);

  const errors = validate(values);
  const show = (k: keyof Values) => ((touched[k] || submitted) && errors[k]) || undefined;
  const set = (k: keyof Values) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setValues((v) => ({ ...v, [k]: e.target.value }));
    setServerError(null);
  };
  const blur = (k: keyof Values) => () => setTouched((t) => ({ ...t, [k]: true }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    const first = (Object.keys(errors) as (keyof Values)[])[0];
    if (first) {
      (formRef.current?.elements.namedItem(first) as HTMLInputElement | null)?.focus();
      return;
    }
    setLoading(true);
    setServerError(null);
    try {
      await actions.signIn({ email: values.email.trim().toLowerCase(), password: values.password });
      setSignedIn(true);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "تعذّر تسجيل الدخول، حاول مرة أخرى.");
      setLoading(false);
    }
  }

  return (
    <>
      <AuthHeading title="أهلًا بعودتك" description="سجّل الدخول لتكمل من الآية التي توقفت عندها." />

      <form ref={formRef} onSubmit={onSubmit} noValidate className="space-y-5">
        <TextField
          label="البريد الإلكتروني"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          dir="ltr"
          className="text-end placeholder:text-end"
          placeholder="name@example.com"
          value={values.email}
          onChange={set("email")}
          onBlur={blur("email")}
          error={show("email")}
          required
        />
        <PasswordField
          name="password"
          autoComplete="current-password"
          value={values.password}
          onChange={set("password")}
          onBlur={blur("password")}
          error={show("password")}
          required
        />

        <FormError message={serverError} />

        <Button type="submit" size="lg" className="w-full" loading={loading}>
          {loading ? "جارٍ الدخول…" : "تسجيل الدخول"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        جديد على مُدّكِر؟{" "}
        <Link href="/register" className="font-medium text-forest underline-offset-4 hover:underline">
          أنشئ حسابًا
        </Link>
      </p>

    </>
  );
}
