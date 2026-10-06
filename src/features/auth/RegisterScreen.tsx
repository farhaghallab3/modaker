"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/primitives";
import { useApp } from "@/lib/store/AppProvider";
import { AuthHeading, DemoLink, EMAIL_RE, FormError, PasswordField, TextField } from "./AuthParts";

type Values = { name: string; email: string; password: string; confirm: string };
type Errors = Partial<Record<keyof Values, string>>;

function validate(v: Values): Errors {
  const e: Errors = {};
  if (v.name.trim().length < 2) e.name = "اكتب اسمك كما تحب أن نناديك.";
  if (!v.email.trim()) e.email = "نحتاج بريدك الإلكتروني لإنشاء الحساب.";
  else if (!EMAIL_RE.test(v.email.trim())) e.email = "يبدو أن البريد الإلكتروني غير مكتمل.";
  if (v.password.length < 8) e.password = "كلمة المرور ٨ أحرف على الأقل.";
  if (!v.confirm) e.confirm = "أعد كتابة كلمة المرور للتأكيد.";
  else if (v.confirm !== v.password) e.confirm = "كلمتا المرور غير متطابقتين.";
  return e;
}

export function RegisterScreen() {
  const { actions } = useApp();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState<Values>({ name: "", email: "", password: "", confirm: "" });
  const [touched, setTouched] = useState<Partial<Record<keyof Values, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

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
      await actions.register({ name: values.name.trim(), email: values.email.trim().toLowerCase(), password: values.password });
      router.push("/onboarding");
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "تعذّر إنشاء الحساب، حاول مرة أخرى.");
      setLoading(false);
    }
  }

  return (
    <>
      <AuthHeading title="ابدأ رحلة الحفظ" description="حساب واحد يحفظ موضعك وتقدّمك ومراجعاتك." />

      <form ref={formRef} onSubmit={onSubmit} noValidate className="space-y-5" aria-describedby="register-error">
        <TextField
          label="الاسم"
          name="name"
          autoComplete="name"
          placeholder="مثال: عبد الله"
          value={values.name}
          onChange={set("name")}
          onBlur={blur("name")}
          error={show("name")}
          required
        />
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
          autoComplete="new-password"
          value={values.password}
          onChange={set("password")}
          onBlur={blur("password")}
          error={show("password")}
          hint="٨ أحرف على الأقل."
          minLength={8}
          required
        />
        <PasswordField
          label="تأكيد كلمة المرور"
          name="confirm"
          autoComplete="new-password"
          value={values.confirm}
          onChange={set("confirm")}
          onBlur={blur("confirm")}
          error={show("confirm")}
          required
        />

        <div id="register-error">
          <FormError message={serverError} />
        </div>

        <Button type="submit" size="lg" className="w-full" loading={loading}>
          {loading ? "جارٍ إنشاء حسابك…" : "إنشاء الحساب"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        لديك حساب؟{" "}
        <Link href="/login" className="font-medium text-forest underline-offset-4 hover:underline">
          سجّل الدخول
        </Link>
      </p>

      <DemoLink />
    </>
  );
}
