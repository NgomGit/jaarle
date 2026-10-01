import type { Metadata } from "next";

export const metadata: Metadata = {
  openGraph: { siteName: "Jaarle Market", locale: "fr_SN", type: "website" },
};

export default function MarketLayout({ children }: { children: React.ReactNode }) {
  return children;
}
