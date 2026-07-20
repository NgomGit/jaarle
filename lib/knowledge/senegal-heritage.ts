// Références culturelles et patrimoniales spécifiquement sénégalaises — pas de l'imagerie
// "africaine" générique. L'objectif : que le résultat se reconnaisse immédiatement comme
// sénégalais (Gorée, Saint-Louis, Casamance...), pas comme une photo de banque d'images
// vaguement "Afrique". Volontairement laïque/séculière : les lieux de culte (ex. Touba) ne
// sont pas inclus ici pour ne jamais les banaliser en toile de fond commerciale.
export const SENEGAL_HERITAGE_CUES: string[] = [
  "Gorée Island's weathered ochre and pastel colonial facades with wrought-iron balconies",
  "Saint-Louis' UNESCO-listed colonial old town, with the Pont Faidherbe silhouette in the distance",
  "Casamance impluvium huts — round thatched-roof vernacular architecture around a central courtyard",
  "Brightly hand-painted Lébou fishing pirogues lined up on a Dakar coastline (N'Gor or Yoff)",
  "An ancient baobab silhouette against the golden light of the Sine-Saloum delta",
  "The bustling stalls and weathered architecture of Marché Sandaga or Marché Kermel",
  "Indigo-dyed and bogolan-inspired textile patterns woven subtly into the surface or backdrop",
  "Bold wax-fabric geometric prints in the tradition of Senegalese tailoring",
  "Sabar drum silhouettes and rhythm-inspired movement, evoking Senegalese dance and music",
  "A traditional Sérère or Wolof village compound with earthen banco walls",
  "The Monument de la Renaissance Africaine rising over Dakar's skyline",
  "Woven straw and rattan basketry textures, a nod to Senegalese vannerie craftsmanship",
  "Sun-bleached fishing nets and wooden canoes drying on a Petite-Côte beach",
  "Hand-tooled leather textures reminiscent of Senegalese maroquinerie",
];

export function pickHeritageCue(): string {
  return SENEGAL_HERITAGE_CUES[Math.floor(Math.random() * SENEGAL_HERITAGE_CUES.length)];
}
