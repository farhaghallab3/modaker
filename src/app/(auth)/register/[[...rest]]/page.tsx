import type { Metadata } from "next";
import { RegisterScreen } from "@/features/auth/RegisterScreen";

export const metadata: Metadata = { title: "إنشاء حساب" };

export default function RegisterPage() {
  return <RegisterScreen />;
}
