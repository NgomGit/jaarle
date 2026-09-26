"use client";

import * as React from "react";
import {
  Bookmark,
  ChevronLeft,
  ChevronUp,
  Globe2,
  Heart,
  Link2,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Music2,
  Send,
  Share2,
  ThumbsUp,
  X,
} from "lucide-react";
import type { StudioPlatform } from "@/lib/studio/platforms";
import type { PostVariant } from "@/lib/studio/types";
import { cn } from "@/lib/utils";

// Aperçus GÉNÉRIQUES des publications : ils reproduisent la structure d'un post (avatar, nom,
// image, légende tronquée, zone d'interactions) sans logos de marques ni compteurs inventés.
// L'image affichée est exactement le visuel téléchargé (signé du logo Jaarle en Gratuit).

export interface MockShop {
  name: string;
  handle: string; // identifiant affiché (slug de la boutique)
  logoUrl: string | null;
  city: string | null;
}

interface MockProps {
  shop: MockShop;
  imageUrl: string;
  variant: PostVariant;
}

function truncate(text: string, max: number): { text: string; truncated: boolean } {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return { text: t, truncated: false };
  return { text: t.slice(0, max).replace(/\s+\S*$/, ""), truncated: true };
}

/** Texte avec hashtags colorés. */
function RichText({ text, tagClass }: { text: string; tagClass: string }) {
  return (
    <>
      {text.split(/(\s+)/).map((w, i) =>
        w.startsWith("#") ? (
          <span key={i} className={tagClass}>
            {w}
          </span>
        ) : (
          <React.Fragment key={i}>{w}</React.Fragment>
        )
      )}
    </>
  );
}

function Avatar({ shop, size = 32, ring }: { shop: MockShop; size?: number; ring?: string }) {
  return (
    <span
      className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white text-[11px] font-bold text-gray-700", ring)}
      style={{ width: size, height: size }}
    >
      {shop.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={shop.logoUrl} alt="" className="h-full w-full object-contain p-[3px]" />
      ) : (
        shop.name.slice(0, 2).toUpperCase()
      )}
    </span>
  );
}

function PreviewImage({ src, className }: { src: string; className: string }) {
  const [loaded, setLoaded] = React.useState(false);
  const imgRef = React.useRef<HTMLImageElement>(null);
  // L'image peut finir de charger avant l'hydratation (onLoad déjà passé) : on vérifie `complete`.
  React.useEffect(() => {
    const img = imgRef.current;
    setLoaded(!!img && img.complete && img.naturalWidth > 0);
  }, [src]);
  return (
    <div className={cn("relative overflow-hidden bg-gray-200", className)}>
      {!loaded && (
        <span className="absolute inset-0 flex items-center justify-center text-gray-500">
          <Loader2 className="h-6 w-6 animate-spin" />
        </span>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={imgRef} src={src} alt="Aperçu du visuel" onLoad={() => setLoaded(true)} className={cn("h-full w-full object-cover transition-opacity", loaded ? "opacity-100" : "opacity-0")} />
    </div>
  );
}

function fullCaption(v: PostVariant) {
  return [v.caption, v.hashtags.join(" ")].filter(Boolean).join(" ");
}

export function InstagramFeedMock({ shop, imageUrl, variant }: MockProps) {
  const { text, truncated } = truncate(fullCaption(variant), 110);
  return (
    <div className="w-full max-w-[360px] overflow-hidden rounded-[22px] border border-black/10 bg-white text-[13px] text-gray-900 shadow-sm">
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <Avatar shop={shop} ring="ring-2 ring-offset-1 ring-pink-400" />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate font-semibold">{shop.handle}</p>
          {shop.city && <p className="truncate text-[11px] text-gray-500">{shop.city}</p>}
        </div>
        <MoreHorizontal className="h-5 w-5 text-gray-600" />
      </div>
      <PreviewImage src={imageUrl} className="aspect-square w-full" />
      <div className="flex items-center gap-4 px-3 pt-2.5 text-gray-900">
        <Heart className="h-6 w-6" strokeWidth={1.75} />
        <MessageCircle className="h-6 w-6" strokeWidth={1.75} />
        <Send className="h-6 w-6" strokeWidth={1.75} />
        <Bookmark className="ml-auto h-6 w-6" strokeWidth={1.75} />
      </div>
      <p className="px-3 pb-3 pt-2 leading-snug">
        <span className="mr-1 font-semibold">{shop.handle}</span>
        <RichText text={text} tagClass="text-[#00376b]" />
        {truncated && <span className="text-gray-500">… plus</span>}
      </p>
    </div>
  );
}

export function FacebookMock({ shop, imageUrl, variant }: MockProps) {
  const { text, truncated } = truncate(fullCaption(variant), 170);
  return (
    <div className="w-full max-w-[360px] overflow-hidden rounded-[18px] border border-black/10 bg-white text-[13.5px] text-gray-900 shadow-sm">
      <div className="flex items-center gap-2.5 px-3 pb-2 pt-3">
        <Avatar shop={shop} size={38} />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate font-semibold">{shop.name}</p>
          <p className="flex items-center gap-1 text-[11.5px] text-gray-500">
            À l&apos;instant · <Globe2 className="h-3 w-3" />
          </p>
        </div>
        <MoreHorizontal className="h-5 w-5 text-gray-500" />
      </div>
      <p className="px-3 pb-2.5 leading-snug">
        <RichText text={text} tagClass="font-medium text-[#385898]" />
        {truncated && <span className="font-semibold text-gray-600">… Voir plus</span>}
      </p>
      <PreviewImage src={imageUrl} className="aspect-square w-full" />
      <div className="mx-3 flex justify-around border-t border-black/10 py-2 text-[12.5px] font-semibold text-gray-600">
        <span className="flex items-center gap-1.5">
          <ThumbsUp className="h-4 w-4" /> J&apos;aime
        </span>
        <span className="flex items-center gap-1.5">
          <MessageCircle className="h-4 w-4" /> Commenter
        </span>
        <span className="flex items-center gap-1.5">
          <Share2 className="h-4 w-4" /> Partager
        </span>
      </div>
    </div>
  );
}

function VerticalFrame({ children }: { children: React.ReactNode }) {
  return <div className="relative aspect-[9/16] w-full max-w-[300px] overflow-hidden rounded-[26px] bg-black text-white shadow-sm">{children}</div>;
}

export function TikTokMock({ shop, imageUrl, variant }: MockProps) {
  const { text, truncated } = truncate(fullCaption(variant), 90);
  return (
    <VerticalFrame>
      <PreviewImage src={imageUrl} className="absolute inset-0 h-full w-full" />
      <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/70 to-transparent" />
      <div className="absolute right-2.5 bottom-24 flex flex-col items-center gap-4">
        <Avatar shop={shop} size={38} ring="ring-2 ring-white" />
        <Heart className="h-7 w-7 fill-white/10" />
        <MessageCircle className="h-7 w-7" />
        <Bookmark className="h-7 w-7" />
        <Share2 className="h-7 w-7" />
      </div>
      <div className="absolute bottom-3 left-3 right-16 text-[12.5px] leading-snug">
        <p className="mb-1 font-semibold">@{shop.handle}</p>
        <p>
          <RichText text={text} tagClass="font-semibold" />
          {truncated && <span className="font-semibold opacity-80">… plus</span>}
        </p>
        <p className="mt-1.5 flex items-center gap-1.5 text-[11.5px] opacity-90">
          <Music2 className="h-3 w-3" /> Son original — {shop.name}
        </p>
      </div>
    </VerticalFrame>
  );
}

function ProgressBars() {
  return (
    <div className="absolute inset-x-2.5 top-2.5 flex gap-1">
      <span className="h-[3px] flex-1 rounded-full bg-white" />
      <span className="h-[3px] flex-1 rounded-full bg-white/40" />
    </div>
  );
}

export function InstagramStoryMock({ shop, imageUrl, variant }: MockProps) {
  const { text, truncated } = truncate(variant.caption, 42);
  return (
    <VerticalFrame>
      <PreviewImage src={imageUrl} className="absolute inset-0 h-full w-full" />
      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/50 to-transparent" />
      <ProgressBars />
      <div className="absolute left-3 right-3 top-6 flex items-center gap-2 text-[12px]">
        <Avatar shop={shop} size={28} />
        <span className="truncate font-semibold">{shop.handle}</span>
        <span className="opacity-70">maintenant</span>
        <X className="ml-auto h-5 w-5" />
      </div>
      {/* Texte à superposer + sticker lien / message */}
      <div className="absolute inset-x-4 bottom-[60px] flex flex-col items-center gap-1.5">
        {text && (
          <p className="max-w-full truncate rounded-lg bg-white/95 px-3 py-1 text-center text-[12px] font-semibold leading-snug text-gray-900">
            {text}
            {truncated && "…"}
          </p>
        )}
        {variant.cta && (
          <span className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[12px] font-semibold text-sky-700">
            <Link2 className="h-3.5 w-3.5" />
            {truncate(variant.cta, 28).text}
          </span>
        )}
      </div>
      <div className="absolute inset-x-3 bottom-3 flex items-center gap-3">
        <span className="flex-1 truncate rounded-full border border-white/70 px-3.5 py-2 text-[12px] opacity-90">Envoyer un message</span>
        <Heart className="h-6 w-6" />
        <Send className="h-6 w-6" />
      </div>
    </VerticalFrame>
  );
}

export function WhatsAppStatusMock({ shop, imageUrl, variant }: MockProps) {
  const { text, truncated } = truncate(variant.caption, 80);
  return (
    <VerticalFrame>
      <PreviewImage src={imageUrl} className="absolute inset-0 h-full w-full" />
      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/60 to-transparent" />
      <ProgressBars />
      <div className="absolute left-2 right-3 top-6 flex items-center gap-2 text-[12px]">
        <ChevronLeft className="h-5 w-5" />
        <Avatar shop={shop} size={30} />
        <div className="min-w-0 leading-tight">
          <p className="truncate font-semibold">{shop.name}</p>
          <p className="text-[10.5px] opacity-75">À l&apos;instant</p>
        </div>
        <MoreHorizontal className="ml-auto h-5 w-5" />
      </div>
      {text && (
        <div className="absolute inset-x-0 bottom-11 bg-black/55 px-4 py-2 text-center text-[12px] leading-snug">
          {text}
          {truncated && "…"}
        </div>
      )}
      <div className="absolute inset-x-0 bottom-2.5 flex flex-col items-center text-[11.5px] opacity-90">
        <ChevronUp className="h-4 w-4" />
        Répondre
      </div>
    </VerticalFrame>
  );
}

export function PlatformMock({ platform, ...props }: MockProps & { platform: StudioPlatform }) {
  switch (platform) {
    case "instagram_feed":
      return <InstagramFeedMock {...props} />;
    case "facebook":
      return <FacebookMock {...props} />;
    case "tiktok":
      return <TikTokMock {...props} />;
    case "instagram_story":
      return <InstagramStoryMock {...props} />;
    case "whatsapp_status":
      return <WhatsAppStatusMock {...props} />;
  }
}
