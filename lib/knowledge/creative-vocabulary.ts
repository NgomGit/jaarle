/**
 * Grands vocabulaires créatifs internes, pour que le "Prompt Builder" se comporte comme un
 * vrai directeur artistique qui explore sans cesse de nouvelles pistes plutôt que de répéter
 * les 3-4 mêmes formules. Chaque dictionnaire contient des dizaines d'entrées ; un "brief
 * créatif" pioche un archétype cohérent (composition/lumière/matière/couleur assortis à la
 * main, comme le ferait un directeur artistique) puis ajoute une couche de "garniture"
 * aléatoire (accents graphiques, textures, ombres...) pour qu'aucune génération ne se
 * ressemble, tout en gardant une direction unique et intentionnelle plutôt qu'un patchwork.
 */

export const compositionStyles = [
  "asymmetric composition",
  "rule-of-thirds framing",
  "centered symmetry",
  "diagonal dynamic composition",
  "radial composition",
  "golden-ratio spiral composition",
  "layered depth composition",
  "framed-within-a-frame composition",
  "off-center focal placement",
  "triangular composition",
  "S-curve visual flow",
  "grid-based modular composition",
  "floating object composition",
  "split-frame composition",
  "overlapping planes composition",
  "minimalist single-subject composition",
  "dense editorial collage composition",
  "cinematic widescreen composition",
  "top-down flat-lay composition",
  "low-angle heroic composition",
  "negative-space-dominant composition",
  "symmetrical mirror composition",
  "staggered rhythm composition",
  "layered silhouette composition",
  "panoramic sweep composition",
  "tightly cropped composition",
  "floating asymmetric balance",
  "converging leading-lines composition",
];

// Philosophies de composition au sens large (mouvements/genres esthétiques), distinctes des
// techniques de composition ci-dessus — c'est l'axe "composition philosophy" du Creative DNA.
export const COMPOSITION_PHILOSOPHIES = [
  "Editorial",
  "Luxury fashion",
  "Museum",
  "Architecture",
  "Minimal Swiss",
  "Japanese minimalism",
  "Contemporary African",
  "High fashion",
  "Brutalist",
  "Luxury packaging",
  "Gallery",
  "Conceptual advertising",
  "Apple keynote",
  "Premium magazine cover",
  "Nike campaign",
  "Art installation",
  "Future luxury",
  "Quiet luxury",
  "Scandinavian",
  "Industrial premium",
  "Organic minimalism",
  "Sculptural",
  "Monolithic",
  "Dynamic asymmetry",
  "Floating composition",
  "Architectural framing",
  "Negative-space driven",
  "Graphic storytelling",
  "Luxury retail display",
];

// Dispositifs visuels ponctuels — l'IA en choisit exactement 2 par génération, jamais plus.
export const VISUAL_DEVICES = [
  "Geometric masks",
  "Broken grids",
  "Architectural cutouts",
  "Paper layers",
  "Glass panels",
  "Floating reflections",
  "Premium gradients",
  "Material transitions",
  "Framing windows",
  "Dynamic diagonals",
  "Light beams",
  "Soft particles",
  "Volumetric shadows",
  "Premium ribbons",
  "Perspective distortion",
  "Cinematic haze",
  "Liquid reflections",
  "Oversized crops",
  "Layered geometry",
  "Editorial overlaps",
  "Glass morphism",
  "Depth stacking",
  "Floating panels",
  "Premium borders",
  "Sculptural blocks",
  "Radial composition",
  "Editorial whitespace",
  "Premium framing",
  "Organic curves",
  "Abstract planes",
];

// Stratégies d'éclairage nommées — la lumière comme outil narratif, pas juste "premium lighting".
export const LIGHTING_STRATEGIES = [
  "Golden hour",
  "Museum lighting",
  "Luxury retail",
  "Editorial fashion",
  "Architectural daylight",
  "Cinematic contrast",
  "Soft directional light",
  "Volumetric light",
  "Backlighting",
  "Studio spotlight",
  "Luxury window light",
  "Premium ambient glow",
  "Natural luxury",
];

// Effet visuel ponctuel — un axe distinct du "visual device" (plus proche d'un traitement optique
// que d'un élément graphique ajouté).
export const VISUAL_EFFECTS = [
  "subtle lens flare",
  "chromatic light dispersion",
  "double-exposure blending",
  "holographic sheen",
  "prism light refraction",
  "motion-blur energy trail",
  "light-leak overlay",
  "particle dust in light beams",
  "heat-haze distortion",
  "iridescent surface shimmer",
  "soft bloom glow",
  "long-exposure light trails",
  "liquid metal ripple",
  "smoke-diffusion atmosphere",
  "crystalline light refraction",
  "ghosted double-image layering",
  "underwater light caustics",
  "fine atmospheric grain",
];

// Comment la profondeur est construite dans l'image.
export const DEPTH_STRATEGIES = [
  "shallow depth-of-field isolation",
  "deep layered focus stacking",
  "atmospheric aerial perspective",
  "foreground framing depth",
  "parallax layered planes",
  "macro-to-wide depth compression",
  "selective focus falloff",
  "layered silhouette depth",
  "tilt-shift miniature depth",
  "receding scale depth",
  "fog-diffused depth layering",
  "overlapping plane depth",
  "vertical depth stacking",
  "diagonal depth recession",
  "focal-point depth isolation",
];

export const artDirections = [
  "editorial fashion direction",
  "minimalist Scandinavian direction",
  "architectural brutalist direction",
  "warm Mediterranean direction",
  "futuristic tech direction",
  "vintage retro direction",
  "luxury heritage direction",
  "bold pop-art direction",
  "organic natural direction",
  "industrial raw direction",
  "Afro-futurist direction",
  "art-deco glamour direction",
  "Japanese wabi-sabi direction",
  "Bauhaus geometric direction",
  "urban street-style direction",
  "high-fashion runway direction",
  "botanical editorial direction",
  "monochrome noir direction",
  "tropical resort direction",
  "desert modernist direction",
  "Scandinavian hygge direction",
  "gallery/museum direction",
  "avant-garde experimental direction",
  "cinematic drama direction",
  "soft pastel dreamlike direction",
  "tribal-modern fusion direction",
];

export const cameraAngles = [
  "eye-level straight-on angle",
  "low-angle heroic angle",
  "high-angle overhead angle",
  "Dutch tilt angle",
  "macro close-up angle",
  "three-quarter angle",
  "profile side angle",
  "worm's-eye angle",
  "bird's-eye angle",
  "over-the-shoulder angle",
  "extreme close-up angle",
  "wide establishing angle",
  "tilted dynamic angle",
  "symmetrical frontal angle",
  "oblique angle",
  "elevated vantage angle",
  "ground-level angle",
  "slight top-down angle",
  "straight-down flat-lay angle",
  "angled three-dimensional angle",
  "foreshortened perspective angle",
  "tightly cropped angle",
];

export const productFraming = [
  "full-bleed edge-to-edge framing",
  "generous negative-space framing",
  "tight hero close-up framing",
  "floating centered framing",
  "off-center asymmetric framing",
  "partial-crop dramatic framing",
  "framed-within-architecture framing",
  "layered foreground-background framing",
  "product-in-context framing",
  "isolated studio framing",
  "oversized scale framing",
  "miniature diorama framing",
  "silhouette framing",
  "half-frame reveal framing",
  "diagonal framing",
  "vignette framing",
  "split-screen framing",
  "environmental portrait framing",
  "macro detail framing",
  "group arrangement framing",
  "single-hero framing",
  "floating shadow framing",
  "elevated pedestal framing",
  "cropped panoramic framing",
];

export const lightingStyles = [
  "soft diffused studio lighting",
  "dramatic chiaroscuro lighting",
  "warm golden-hour lighting",
  "cool blue-hour lighting",
  "hard directional spotlight",
  "rim-light silhouette lighting",
  "backlit glow lighting",
  "natural window light",
  "neon accent lighting",
  "candlelit ambient lighting",
  "high-key bright lighting",
  "low-key moody lighting",
  "side-lit sculptural lighting",
  "top-down softbox lighting",
  "colored gel lighting",
  "overcast diffused daylight",
  "sunlit dappled lighting",
  "studio ring light",
  "cinematic volumetric lighting",
  "spotlight vignette lighting",
  "gradient ambient lighting",
  "bounce-fill soft lighting",
  "harsh midday sun lighting",
  "twilight ambient lighting",
  "string-light bokeh lighting",
  "reflective bounce lighting",
  "tungsten warm-tone lighting",
  "misty diffused lighting",
];

export const architecturalStyles = [
  "brutalist concrete architecture",
  "minimalist glass-and-steel architecture",
  "colonial heritage architecture",
  "Sahelian mudbrick architecture",
  "art-deco architecture",
  "mid-century modern architecture",
  "industrial loft architecture",
  "Moorish arch architecture",
  "contemporary African architecture",
  "Bauhaus functional architecture",
  "Mediterranean whitewashed architecture",
  "gothic vaulted architecture",
  "tropical modernist architecture",
  "geometric pavilion architecture",
  "exposed-brick architecture",
  "marble atrium architecture",
  "wooden lattice architecture",
  "terracotta courtyard architecture",
  "floating staircase architecture",
  "cantilevered structure architecture",
  "curved organic architecture",
  "monumental stone architecture",
  "skylight atrium architecture",
  "urban rooftop architecture",
];

export const interiorStyles = [
  "minimalist loft interior",
  "boutique retail interior",
  "luxury hotel lobby interior",
  "artisan workshop interior",
  "Scandinavian living-room interior",
  "marble bathroom interior",
  "industrial concrete interior",
  "cozy West-African-inspired interior",
  "gallery white-cube interior",
  "mid-century lounge interior",
  "plant-filled botanical interior",
  "dark moody study interior",
  "sunlit atelier interior",
  "boutique fitting-room interior",
  "rustic wood-cabin interior",
  "glass-walled studio interior",
  "tiled Moroccan-style interior",
  "velvet lounge interior",
  "open-plan kitchen interior",
  "library reading-room interior",
  "spa wellness interior",
  "showroom display interior",
  "artisan textile interior",
  "penthouse skyline interior",
];

export const outdoorEnvironments = [
  "sun-drenched beach environment",
  "arid desert dune environment",
  "lush tropical garden environment",
  "urban rooftop terrace environment",
  "cobblestone old-town street environment",
  "baobab savanna environment",
  "coastal cliffside environment",
  "misty mountain environment",
  "palm-lined boulevard environment",
  "open market street environment",
  "golden wheat-field environment",
  "riverside dock environment",
  "courtyard garden environment",
  "sunset horizon environment",
  "forest clearing environment",
  "dusty rural pathway environment",
  "seaside promenade environment",
  "urban skyline environment",
  "terracotta rooftop environment",
  "rolling-hills vineyard environment",
  "salt-flat minimalist environment",
  "botanical greenhouse environment",
  "harbor pier environment",
  "open savanna horizon environment",
];

export const graphicElements = [
  "thin geometric line accents",
  "bold color-block shapes",
  "dotted grid pattern overlay",
  "abstract brushstroke accents",
  "subtle film-grain texture overlay",
  "halftone dot pattern",
  "minimal icon accents",
  "torn-paper edge accents",
  "ribbon banner accents",
  "abstract wave pattern",
  "subtle diagonal stripes",
  "floating particle accents",
  "radial burst pattern",
  "organic blob shapes",
  "fine hairline borders",
  "duotone color overlay",
  "gradient mesh overlay",
  "subtle vignette framing",
  "abstract typographic marks",
  "minimalist arrow accents",
  "layered transparency shapes",
  "kinetic motion-line accents",
];

export const geometricShapes = [
  "circular focal shapes",
  "triangular accent shapes",
  "hexagonal grid shapes",
  "overlapping polygon shapes",
  "arc and crescent shapes",
  "diamond accent shapes",
  "concentric ring shapes",
  "angular fragment shapes",
  "soft organic blob shapes",
  "modular square-grid shapes",
  "radiating line shapes",
  "layered circular frames",
  "asymmetric polygon clusters",
  "interlocking geometric shapes",
  "minimalist line-art shapes",
  "bold half-circle shapes",
  "faceted crystal shapes",
  "wave-form curved shapes",
  "pyramidal shapes",
  "floating cube shapes",
];

export const maskStyles = [
  "circular vignette mask",
  "soft-edge gradient mask",
  "angular diagonal mask",
  "arch-shaped mask",
  "organic freeform mask",
  "duotone color mask",
  "torn-edge mask",
  "geometric polygon mask",
  "radial spotlight mask",
  "framed-window mask",
  "silhouette cutout mask",
  "wave-edge mask",
  "layered transparency mask",
  "split-diagonal mask",
  "keyhole mask",
  "brushstroke-edge mask",
  "hexagonal mask",
  "soft blur-edge mask",
];

export const backgroundConcepts = [
  "seamless studio backdrop",
  "textured concrete backdrop",
  "gradient color-wash backdrop",
  "architectural interior backdrop",
  "natural environmental backdrop",
  "abstract painterly backdrop",
  "reflective surface backdrop",
  "marble surface backdrop",
  "urban context backdrop",
  "botanical greenery backdrop",
  "minimalist void backdrop",
  "soft bokeh backdrop",
  "industrial texture backdrop",
  "sunlit outdoor backdrop",
  "gradient mesh backdrop",
  "patterned wallpaper backdrop",
  "sky-and-horizon backdrop",
  "water-reflection backdrop",
  "sand-and-stone backdrop",
  "layered depth backdrop",
  "colored-paper backdrop",
  "atmospheric haze backdrop",
  "geometric pattern backdrop",
  "wood-grain surface backdrop",
  "cloudscape backdrop",
];

export const decorativeObjects = [
  "fresh botanical sprigs",
  "artisan ceramic vessels",
  "woven basket accents",
  "brass or gold trinket accents",
  "draped textile accents (used sparingly)",
  "candle and flame accents",
  "stacked book accents",
  "marble sculpture accents",
  "dried floral accents",
  "wooden bead accents",
  "mirror-fragment accents",
  "glassware accents",
  "leather accessory accents",
  "stone pebble accents",
  "patterned tile accents",
  "metallic coin accents",
  "rope and cord accents",
  "feather accents",
  "seashell accents",
  "woven raffia accents",
  "vintage trinket accents",
  "geometric paperweight accents",
  "incense-smoke accents",
  "potted-plant accents",
];

export const materials = [
  "brushed metal",
  "polished brass",
  "raw concrete",
  "hand-woven textile",
  "tanned leather",
  "matte ceramic",
  "veined marble",
  "reclaimed wood",
  "frosted glass",
  "oxidized copper",
  "waxed cotton canvas",
  "hammered gold",
  "smoked glass",
  "natural stone",
  "lacquered wood",
  "woven raffia",
  "textured linen",
  "anodized aluminum",
  "glazed terracotta",
  "brushed steel",
  "tinted acrylic",
  "embossed leather",
  "silk satin",
  "rough-cut timber",
  "patinated bronze",
  "chalky plaster",
];

export const surfaceTextures = [
  "matte finish",
  "high-gloss finish",
  "brushed-grain texture",
  "cracked patina texture",
  "soft velvet texture",
  "woven basket texture",
  "rippled water texture",
  "sandblasted texture",
  "embossed pattern texture",
  "pebbled leather texture",
  "silky smooth texture",
  "rough stucco texture",
  "corrugated texture",
  "polished mirror texture",
  "frosted matte texture",
  "hammered metal texture",
  "knitted fabric texture",
  "cork texture",
  "marbled swirl texture",
  "granular sand texture",
  "brushed suede texture",
  "ribbed fabric texture",
  "distressed wood texture",
  "satin sheen texture",
];

export const colorHarmonies = [
  "monochromatic tonal harmony",
  "complementary contrast harmony",
  "analogous soft harmony",
  "triadic vibrant harmony",
  "split-complementary harmony",
  "warm earth-tone harmony",
  "cool jewel-tone harmony",
  "muted pastel harmony",
  "high-contrast duotone harmony",
  "desaturated neutral harmony",
  "rich jewel-and-gold harmony",
  "black-and-accent harmony",
  "sunset gradient harmony",
  "ocean-tone harmony",
  "terracotta-and-cream harmony",
  "deep forest-tone harmony",
  "blush-and-gold harmony",
  "charcoal-and-metallic harmony",
  "sand-and-indigo harmony",
  "ruby-and-emerald harmony",
  "ivory-and-bronze harmony",
  "slate-and-copper harmony",
];

export const contrastStyles = [
  "high-contrast dramatic look",
  "low-contrast soft look",
  "tonal monochrome contrast",
  "color-vs-neutral contrast",
  "light-vs-shadow contrast",
  "texture-vs-smooth contrast",
  "warm-vs-cool contrast",
  "scale contrast (large against small)",
  "matte-vs-glossy contrast",
  "organic-vs-geometric contrast",
  "busy-vs-empty contrast",
  "saturated-vs-muted contrast",
  "sharp-vs-soft-focus contrast",
  "vintage-vs-modern contrast",
  "minimal-vs-ornate contrast",
  "hard-edge-vs-blur contrast",
  "dark-vs-light-field contrast",
  "solid-vs-transparent contrast",
];

export const typographyMoods = [
  "bold editorial serif mood",
  "elegant thin-weight serif mood",
  "confident geometric sans mood",
  "luxury small-caps mood",
  "hand-lettered artisanal mood",
  "condensed high-fashion mood",
  "oversized statement-type mood",
  "minimalist tracked-out mood",
  "classic vintage type mood",
  "modern variable-weight mood",
  "script accent mood",
  "architectural grid-aligned type mood",
  "monospace technical mood",
  "italic editorial mood",
  "layered type-on-image mood",
  "high-contrast serif mood",
  "soft rounded sans mood",
  "engraved luxury mood",
  "kinetic diagonal type mood",
  "whisper-quiet fine-print mood",
  "bold all-caps statement mood",
  "refined letterspaced mood",
  "magazine-masthead mood",
  "gilded foil-type mood",
];

export const luxuryCues = [
  "gold foil accents",
  "marble-and-brass pairing",
  "velvet texture cues",
  "soft dramatic shadow play",
  "understated logo placement",
  "tactile embossing cues",
  "silk-like sheen cues",
  "candlelit warmth cues",
  "architectural symmetry cues",
  "negative space as a luxury cue",
  "deep jewel-tone cues",
  "hand-finished craftsmanship cues",
  "subtle metallic sheen",
  "refined color restraint",
  "heritage monogram cues",
  "quiet confident typography",
  "premium packaging cues",
  "soft-focus glamour",
  "curated minimal props",
  "atelier/workshop authenticity cues",
];

export const minimalistCues = [
  "abundant negative space",
  "single hero-object focus",
  "restrained color palette",
  "clean geometric alignment",
  "quiet confident typography",
  "absence of clutter",
  "soft neutral backdrop",
  "precise grid alignment",
  "subtle texture over pattern",
  "breathing room around the subject",
  "monochrome restraint",
  "one accent color maximum",
  "simple honest materials",
  "quiet symmetry",
  "understated shadow",
  "calm even lighting",
  "deliberate emptiness",
  "functional-beauty cues",
];

export const motionEnergyCues = [
  "implied forward motion",
  "dynamic diagonal energy",
  "flowing fabric movement",
  "splash or particle motion",
  "wind-blown movement cues",
  "dance-like implied motion",
  "kinetic blur accents",
  "radiating energy lines",
  "bouncing rhythm cues",
  "cascading movement",
  "floating weightless energy",
  "pulsing radial energy",
  "swirling motion cues",
  "gestural brush-motion cues",
  "rippling motion cues",
  "streaking light-trail energy",
  "orbiting circular motion",
  "rhythmic repetition energy",
];

export const premiumRetailInspiration = [
  "flagship boutique window display",
  "luxury department-store vignette",
  "curated concept-store styling",
  "high-end product-launch staging",
  "boutique hotel amenity styling",
  "premium unboxing moment",
  "atelier showroom staging",
  "jewelry-counter presentation",
  "designer pop-up staging",
  "duty-free display styling",
  "art-gallery product staging",
  "private-viewing showroom mood",
  "couture atelier presentation",
  "flagship store window styling",
  "VIP lounge product staging",
  "bespoke tailoring-shop mood",
  "concept-boutique minimalism",
  "heritage-brand showroom mood",
];

export const editorialMagazineInspiration = [
  "glossy fashion-editorial styling",
  "minimalist design-magazine styling",
  "travel-editorial spread styling",
  "architectural-digest styling",
  "lifestyle-magazine cover styling",
  "art-book plate styling",
  "documentary-style editorial framing",
  "cultural-magazine feature styling",
  "food-editorial styling",
  "portrait-editorial framing",
  "still-life editorial styling",
  "avant-garde art-direction styling",
  "monochrome editorial styling",
  "editorial cover-line composition",
  "gallery-catalogue styling",
  "biannual fashion-book styling",
  "luxury travel-brochure styling",
  "coffee-table-book styling",
];

export const africanContemporaryDesignInspiration = [
  "Afro-futurist visual motifs",
  "contemporary wax-print color stories",
  "Dakar gallery-scene aesthetics",
  "modern Sahelian architectural motifs",
  "West African textile pattern accents",
  "contemporary African fashion styling",
  "Wolof-inspired geometric motifs",
  "modern griot storytelling mood",
  "cinematic Dakar color grading",
  "Pan-African color palette cues",
  "contemporary craft-revival styling",
  "urban Dakar street-culture mood",
  "indigo-dye textile inspiration",
  "modern basket-weave pattern motifs",
  "contemporary African ceramics styling",
  "Afro-minimalist design mood",
  "mudcloth-inspired graphic motifs",
  "contemporary African portraiture mood",
  "kente-inspired color blocking",
  "Sahel-modernist mood",
];

export const negativeSpaceLayouts = [
  "generous top negative space",
  "asymmetric side negative space",
  "framing negative space around the subject",
  "minimal floating subject with vast space",
  "negative space as a compositional anchor",
  "breathing margin all around",
  "diagonal negative-space split",
  "quiet corner negative space",
  "negative space guiding eye flow",
  "subject placed in one third, rest left empty",
  "empty foreground negative space",
  "layered negative-space depth",
  "negative space as a color field",
  "cropped negative-space edge",
  "vertical negative-space column",
  "horizontal negative-space band",
  "negative space reserved for the text zone",
  "soft gradient negative space",
];

export const gridSystems = [
  "modular square grid",
  "asymmetric editorial grid",
  "golden-ratio grid",
  "rule-of-thirds grid",
  "Swiss-style grid",
  "column-based magazine grid",
  "radial grid alignment",
  "baseline typographic grid",
  "offset brick grid",
  "nested grid hierarchy",
  "single-column focus grid",
  "diagonal grid alignment",
  "floating modular blocks",
  "grid-breaking focal element",
  "symmetric mirrored grid",
  "layered overlapping grid",
];

export const layeringTechniques = [
  "foreground-midground-background layering",
  "transparent overlay layering",
  "depth-of-field layering",
  "silhouette layering",
  "stacked-object layering",
  "shadow-and-light layering",
  "translucent fabric layering",
  "reflective surface layering",
  "collage-style layering",
  "floating-element layering",
  "tonal depth layering",
  "atmospheric haze layering",
  "cropped layering for depth",
  "frame-within-frame layering",
  "color-block layering",
  "textural layering",
  "graphic-over-photo layering",
  "multiple-exposure-style layering",
];

export const shadowStyles = [
  "long dramatic shadow",
  "soft diffused shadow",
  "hard-edged graphic shadow",
  "colored gel shadow",
  "dappled natural shadow",
  "silhouette shadow",
  "layered double shadow",
  "rim-light shadow edge",
  "low raking shadow",
  "architectural shadow lines",
  "gobo-patterned shadow",
  "floating-object shadow",
  "cast shadow as a graphic element",
  "soft gradient shadow falloff",
  "high-contrast noir shadow",
  "subtle ambient-occlusion shadow",
  "directional studio shadow",
  "shadow-as-frame technique",
];

export const reflectionStyles = [
  "mirror-surface reflection",
  "water-surface reflection",
  "glass-surface reflection",
  "polished-floor reflection",
  "wet-pavement reflection",
  "metallic reflection",
  "subtle glass-table reflection",
  "blurred bokeh reflection",
  "symmetrical mirrored reflection",
  "soft ambient reflection",
  "high-gloss product reflection",
  "distorted artistic reflection",
  "double-exposure reflection",
  "tinted glass reflection",
  "chrome reflection accents",
  "rain-streaked reflection",
];

export const glassEffects = [
  "frosted glass diffusion",
  "clear glass refraction",
  "tinted glass color-cast",
  "cracked glass texture",
  "layered glass depth",
  "glass condensation droplets",
  "beveled glass edge highlights",
  "stained-glass color fragments",
  "smoked glass silhouette",
  "glass-block distortion",
  "backlit glass glow",
  "glass reflection overlay",
  "sandblasted glass texture",
  "curved glass distortion",
  "glass panel framing",
  "dew-covered glass texture",
];

export const framingTechniques = [
  "frame-within-a-frame technique",
  "architectural doorway framing",
  "natural foliage framing",
  "hand or gesture framing",
  "shadow framing",
  "negative-space framing",
  "vignette framing",
  "geometric cutout framing",
  "curtain or drape framing (used sparingly)",
  "window framing",
  "arch framing",
  "layered foreground framing",
  "mirror framing",
  "light-beam framing",
  "color-block framing",
  "torn-edge framing",
  "circular porthole framing",
  "diagonal crop framing",
];

export const visualStorytellingConcepts = [
  "a-day-in-the-life narrative",
  "before-and-after narrative",
  "craftsmanship-in-progress narrative",
  "heritage-and-tradition narrative",
  "aspirational-lifestyle narrative",
  "behind-the-scenes narrative",
  "moment-of-use narrative",
  "origin-story narrative",
  "transformation narrative",
  "quiet-luxury narrative",
  "community-and-connection narrative",
  "discovery-and-reveal narrative",
  "artisan-at-work narrative",
  "celebration-and-occasion narrative",
  "journey-and-movement narrative",
  "contrast-of-old-and-new narrative",
  "sensory-detail narrative",
  "golden-hour-ritual narrative",
  "everyday-elevated narrative",
  "cultural-pride narrative",
];

const REFERENCE_WORLD_POOLS: string[][] = [
  premiumRetailInspiration,
  editorialMagazineInspiration,
  africanContemporaryDesignInspiration,
  visualStorytellingConcepts,
  luxuryCues,
  minimalistCues,
];

function pickRandom<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  const result: T[] = [];
  for (let i = 0; i < n && copy.length > 0; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    result.push(copy.splice(idx, 1)[0]);
  }
  return result;
}

/**
 * "Creative DNA" : 9 axes choisis INDÉPENDAMMENT (pas un bundle pré-assorti à la main) + 2
 * dispositifs visuels (jamais plus) + une phrase de référence. L'IA elle-même est chargée de
 * combiner ces choix en une direction cohérente (voir formatCreativeBrief) — plutôt que nous
 * pré-assortissions des archétypes, on lui fait confiance pour l'assemblage créatif final, ce
 * qui donne un espace combinatoire bien plus large et évite que deux générations se ressemblent.
 */
export interface CreativeBrief {
  compositionPhilosophy: string;
  cameraLanguage: string;
  lightingStrategy: string;
  storytellingDirection: string;
  materialLanguage: string;
  visualEffect: string;
  depthStrategy: string;
  framingTechnique: string;
  contrastStrategy: string;
  visualDevices: string[];
  referenceWorld: string;
}

/**
 * Tire un Creative DNA complet : 9 pioches indépendantes + exactement 2 dispositifs visuels +
 * une phrase de référence. Zéro appel API supplémentaire — pure logique aléatoire.
 */
export function buildCreativeBrief(): CreativeBrief {
  const referencePool = pickRandom(REFERENCE_WORLD_POOLS, 1)[0];

  return {
    compositionPhilosophy: pickRandom(COMPOSITION_PHILOSOPHIES, 1)[0],
    cameraLanguage: pickRandom(cameraAngles, 1)[0],
    lightingStrategy: pickRandom(LIGHTING_STRATEGIES, 1)[0],
    storytellingDirection: pickRandom(visualStorytellingConcepts, 1)[0],
    materialLanguage: pickRandom(materials, 1)[0],
    visualEffect: pickRandom(VISUAL_EFFECTS, 1)[0],
    depthStrategy: pickRandom(DEPTH_STRATEGIES, 1)[0],
    framingTechnique: pickRandom(framingTechniques, 1)[0],
    contrastStrategy: pickRandom(contrastStyles, 1)[0],
    visualDevices: pickRandom(VISUAL_DEVICES, 2),
    referenceWorld: pickRandom(referencePool, 1)[0],
  };
}

/**
 * Choisit une humeur typographique indépendante — utilisée uniquement à l'étape de mise en
 * page complète (Standard/Advanced), pour que la typographie varie elle aussi d'une génération
 * à l'autre, indépendamment du décor.
 */
export function pickTypographyMood(): string {
  return pickRandom(typographyMoods, 1)[0];
}

/**
 * Met en forme le Creative DNA pour l'injecter dans le prompt. Précise explicitement que ces
 * 9+2 choix doivent être combinés NATURELLEMENT en un seul concept cohérent — c'est ce qui
 * différencie "créatif" d'un patchwork de mots-clés sans lien.
 */
export function formatCreativeBrief(brief: CreativeBrief, opts?: { typographyMood?: string }): string {
  const lines = [
    `Creative DNA for THIS generation only (never reuse this exact combination for another generation):`,
    `- Composition philosophy: ${brief.compositionPhilosophy}`,
    `- Camera language: ${brief.cameraLanguage}`,
    `- Lighting strategy: ${brief.lightingStrategy}`,
    `- Storytelling direction: ${brief.storytellingDirection}`,
    `- Premium material language: ${brief.materialLanguage}`,
    `- Visual effect: ${brief.visualEffect}`,
    `- Depth strategy: ${brief.depthStrategy}`,
    `- Framing technique: ${brief.framingTechnique}`,
    `- Contrast strategy: ${brief.contrastStrategy}`,
    `- Visual devices (use exactly these two, never more): ${brief.visualDevices.join(", ")}`,
    `- Reference world: this should feel like it belongs in a ${brief.referenceWorld}.`,
  ];
  if (opts?.typographyMood) {
    lines.push(`- Typography mood: ${opts.typographyMood}.`);
  }
  lines.push(
    `Combine these choices naturally into ONE coherent, intentional visual concept — never apply them as a disconnected checklist. A senior art director looking at this list would understand exactly what unified mood to create, and would still make dozens of small independent judgment calls to bring it to life.`
  );
  return lines.join("\n");
}

export const CREATIVE_DIRECTOR_OPENING = `You are the Creative Director of the world's most awarded advertising agency. Your work competes every year at Cannes Lions, D&AD, The One Show and ADC. You are famous for creating advertising visuals that people instantly remember. Every campaign begins with an original visual idea, never with a template. You never repeat compositions. You never produce generic AI-looking images. Every image must feel handcrafted, intentional and creatively art-directed. The objective is not simply to create a beautiful advertisement — the objective is to create an advertisement that immediately captures attention, creates emotion and makes people stop scrolling. Think like an Art Director first. Think like a Photographer second. Think like a Designer third.`;

export const CONCEPT_FIRST_INSTRUCTION = `Before creating anything, silently invent a unique advertising concept. Ask yourself: "What is the one visual idea that makes this advertisement unforgettable?" Everything else must support this single idea. Never begin with a layout — begin with the concept. If the concept could easily be confused with a generic template, reject it and invent another one.`;

export const VISUAL_SURPRISE_RULE = `Visual surprise is mandatory: every poster must introduce at least one unexpected premium visual idea — for example the product emerging from architecture, shadows becoming graphic elements, geometric masks revealing the product, premium reflections, sculptural lighting, editorial cropping, oversized perspective, material transitions, premium framing, or dramatic negative space. The surprise should feel elegant rather than flashy.`;

export const ASYMMETRY_RULE = `Avoid visual symmetry by default — perfect symmetry often looks artificial. Prefer carefully balanced asymmetry; the eye should naturally travel through the composition.`;

export const COLOR_HIERARCHY_INSTRUCTION = `Build a deliberate color hierarchy: a dominant color, a supporting color, an accent color, and a neutral balance. The palette should guide the viewer's attention naturally toward the subject.`;

export const SELF_CRITIQUE_INSTRUCTION = `Before finalizing the image, evaluate it internally: would this visual deserve to appear in Behance Featured, Awwwards, D&AD or Cannes Lions? If not, increase the originality, improve the composition, strengthen the concept, simplify the layout, and introduce one stronger memorable visual idea. Only stop once the result feels premium enough to be mistaken for work from an elite international creative agency.`;

/**
 * Utilisée uniquement pour l'étape de mise en page finale (voir generateTemplatedPoster) — plus
 * de gabarit imposé (side-panel/bottom-bar) pour CETTE passe, l'IA choisit librement dans une
 * liste riche. `getNegativeSpaceInstruction`/le gabarit tiré au hasard restent utilisés en amont
 * pour composer le fond ET comme filet de secours déterministe (bandeau satori) si cette passe
 * échoue — seule la mise en page FINALE dessinée par l'IA n'est plus contrainte à un binaire.
 */
export const LAYOUT_FREEDOM_INSTRUCTION = `The layout must prioritize readability while allowing creative freedom. Choose the typography placement that best serves this specific composition. Possible layouts include: editorial left column, floating typography, architectural frame, integrated typography, premium bottom strip, luxury side panel, split composition, magazine cover, minimalist overlay, asymmetrical information block. Never repeat the same layout strategy. Typography should feel designed for this image, not placed on top of it.`;

export function formatLightingInstruction(strategy: string): string {
  return `Lighting is one of the primary storytelling tools — never default to generic studio lighting. Choose lighting that reinforces the concept. For THIS generation, use: ${strategy} lighting.`;
}

/**
 * Règles de créativité : jamais deux compositions qui se ressemblent, en variant explicitement
 * chacun de ces axes plutôt qu'une injonction vague de "ne pas se répéter".
 */
export const CREATIVITY_RULES = `Creativity rules (non-negotiable):
- No composition may resemble a previous one. Vary: camera angle, negative space, subject placement, framing, light direction, depth, materials, visual rhythm, color hierarchy, background construction, creative device, shape language.
- No two posters should look like variations of the same template.
- Never default to a centered, safe, generic product-photo layout — that is the single most common failure mode to avoid.
- Avoid generic AI-generated aesthetics: no plain pastel gradient with a soft cast shadow and nothing else.
- The result must feel intentionally designed by a senior art director, not randomly assembled.`;

/**
 * Principes de design non négociables — jamais sacrifiés au profit de la créativité.
 */
export const DESIGN_PRINCIPLES = `Non-negotiable design principles (creativity must never come at the expense of these):
- Clear visual hierarchy: the eye must know instantly what to look at first, second, third.
- Deliberate contrast, balance and alignment — nothing placed arbitrarily.
- Considered rhythm and scale between elements.
- Genuine use of white space / negative space — not just leftover empty area.
- True color harmony, not just "a lot of color".
- A clear, single focal point and a deliberate eye-flow path through the composition.
- Thoughtful layering and depth rather than a flat, single-plane image.
- Internal consistency: every choice (light, material, color, shape) belongs to the same coherent world.`;
