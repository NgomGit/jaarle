import { createAdminClient } from "@/lib/supabase/admin";
import { noticeMessage, whatsappLink, type NoticeKind } from "@/lib/admin/moderation";
import { NoticeButton } from "./notice-button";

// Bandeau « prévenir le vendeur sur WhatsApp », affiché juste après une action de modération
// (?prevenir=kind:id) : sur la page Modération et sur Signalements.

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

export async function ModerationNotice({ prevenir }: { prevenir?: string }) {
  const notice = await buildNotice(createAdminClient(), prevenir);
  if (!notice) return null;
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
      <p className="text-sm">
        Prévenir <strong>{notice.shopName}</strong> sur WhatsApp
        {notice.phone ? <span className="text-muted-foreground"> ({notice.phone})</span> : null}
      </p>
      {notice.href ? (
        <NoticeButton href={notice.href} kind={notice.kind} targetId={notice.targetId} />
      ) : (
        <span className="text-sm text-muted-foreground">Pas de numéro WhatsApp sur cette boutique.</span>
      )}
    </div>
  );
}

async function buildNotice(admin: ReturnType<typeof createAdminClient>, raw: string | undefined) {
  const m = /^(product_hidden|product_restored|shop_suspended|shop_reactivated):([0-9a-f-]{36})$/.exec(raw ?? "");
  if (!m) return null;
  const kind = m[1] as NoticeKind;
  const targetId = m[2];
  if (kind.startsWith("product")) {
    const { data } = await admin.from("products").select("name, moderated_reason, shops(name, whatsapp)").eq("id", targetId).maybeSingle();
    const shop = data ? one(data.shops as { name: string; whatsapp: string | null } | { name: string; whatsapp: string | null }[] | null) : null;
    if (!data || !shop) return null;
    const href = whatsappLink(shop.whatsapp, noticeMessage(kind, { shopName: shop.name, productName: data.name, productId: targetId, reason: data.moderated_reason }));
    return { kind, targetId, shopName: shop.name, phone: shop.whatsapp, href };
  }
  const { data: shop } = await admin.from("shops").select("name, whatsapp, suspended_reason").eq("id", targetId).maybeSingle();
  if (!shop) return null;
  const href = whatsappLink(shop.whatsapp, noticeMessage(kind, { shopName: shop.name, reason: shop.suspended_reason }));
  return { kind, targetId, shopName: shop.name, phone: shop.whatsapp, href };
}
