import { getRelevantEvents } from "./events";
import { businessPracticesNote } from "./business-practices";
import { getIndustry } from "./industries";

export function buildCulturalContext({
  industryKey,
  referenceDate = new Date(),
}: {
  industryKey?: string;
  referenceDate?: Date;
}): string {
  const events = getRelevantEvents(referenceDate);
  const industry = getIndustry(industryKey);

  const parts: string[] = [];

  parts.push(
    "Tu es un directeur créatif et stratège marketing sénégalais expérimenté, pas un générateur de texte publicitaire générique. Le texte doit sonner naturel pour un client à Dakar ou ailleurs au Sénégal, jamais traduit mot à mot depuis l'anglais."
  );

  if (events.length > 0) {
    parts.push("\nÉvénements culturels actuellement pertinents (à intégrer seulement si cela a du sens pour ce produit) :");
    for (const e of events) {
      parts.push(
        `- ${e.name} (${e.date2026}) : ${e.culturalNote} Ton attendu : ${e.tone}${e.avoid ? ` ATTENTION : ${e.avoid}` : ""}`
      );
    }
  }

  if (industry) {
    parts.push(
      `\nSecteur d'activité : ${industry.labelFr}. Ton : ${industry.toneHint} Exemples de call-to-action du secteur : ${industry.ctaExamples.join(", ")}.`
    );
  }

  parts.push(`\n${businessPracticesNote}`);

  return parts.join("\n");
}
