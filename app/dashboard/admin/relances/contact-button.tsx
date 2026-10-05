"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WhatsAppIcon } from "@/components/storefront/whatsapp-icon";
import { markShopContacted } from "./actions";

/** Ouvre WhatsApp avec le message de relance et note la relance dans le journal admin. */
export function ContactButton({
  shopId,
  href,
  reason,
}: {
  shopId: string;
  href: string;
  reason: "draft_with_products" | "no_products";
}) {
  const [done, setDone] = React.useState(false);
  return (
    <Button size="sm" variant="accent" asChild>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => {
          if (done) return;
          setDone(true);
          void markShopContacted(shopId, reason);
        }}
      >
        {done ? <Check className="h-4 w-4" /> : <WhatsAppIcon className="h-4 w-4" />}
        {done ? "Relance notée" : "Relancer sur WhatsApp"}
      </a>
    </Button>
  );
}
