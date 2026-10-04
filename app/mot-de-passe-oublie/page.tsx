import type { Metadata } from "next";
import { ForgotPasswordView } from "./forgot-password-view";

export const metadata: Metadata = { title: "Mot de passe oublié", robots: { index: false, follow: false } };

export default function ForgotPasswordPage({ searchParams }: { searchParams: { tel?: string } }) {
  return <ForgotPasswordView initialPhone={(searchParams.tel ?? "").replace(/\D/g, "").slice(0, 9)} />;
}
