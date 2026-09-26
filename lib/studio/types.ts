import type { StudioFormat, StudioPlatform } from "@/lib/studio/platforms";
import type { StudioObjective } from "@/lib/studio/objectives";

export interface PostVariant {
  caption: string;
  hashtags: string[];
  cta: string;
  headline: string; // titre court affiché SUR le visuel
  subline: string; // accroche secondaire affichée sur le visuel
}

export interface MarketingPost {
  id: string;
  pack_id: string;
  platform: StudioPlatform;
  format: StudioFormat;
  variants: PostVariant[];
  selected_variant: number;
  copy_count: number;
  download_count: number;
  regenerated_count: number;
  publish_status: "draft" | "ready" | "scheduled" | "published" | "failed";
  created_at: string;
  updated_at: string;
}

export interface MarketingPack {
  id: string;
  shop_id: string | null; // null : pack créé depuis une affiche par un commerçant sans boutique
  product_id: string | null;
  creation_id: string | null; // pack créé à partir d'une affiche (Studio principal)
  creation_version_id: string | null; // version de l'affiche utilisée pour les visuels
  owner_id: string;
  objective: StudioObjective;
  promo_detail: string | null;
  extra_facts: string | null;
  model: string | null;
  created_at: string;
  marketing_posts: MarketingPost[];
}
