// Messages de validation zod en français, partout où ce module est importé.
// Nécessaire en production : zod déclare `sideEffects: false`, donc son propre réglage de langue
// (config(en())) peut être retiré par le bundler — tous les messages devenaient « Invalid input ».
import { z } from "zod";

z.config(z.locales.fr());

export { z };
