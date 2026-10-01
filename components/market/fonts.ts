import { Bricolage_Grotesque, Manrope } from "next/font/google";

// Typographies du Market (et de l'annuaire /boutiques) : titres Bricolage Grotesque, texte Manrope.
export const marketDisplay = Bricolage_Grotesque({ subsets: ["latin"], weight: ["500", "600", "700", "800"], variable: "--font-market-display" });
export const marketBody = Manrope({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-market-body" });
