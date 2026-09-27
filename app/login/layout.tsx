import type { Metadata } from "next";

// Page de connexion : utile aux commerçants, sans intérêt dans les résultats de recherche.
export const metadata: Metadata = {
  title: "Connexion",
  robots: { index: false, follow: true },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
