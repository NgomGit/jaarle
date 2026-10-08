"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WhatsAppIcon } from "@/components/storefront/whatsapp-icon";
import { markNoticeSentAction } from "../actions";

/** Ouvre WhatsApp avec le message prérempli pour le vendeur, et note l'envoi dans le journal. */
export function NoticeButton({ href, kind, targetId, label = "Prévenir sur WhatsApp", sentAt }: { href: string; kind: string; targetId: string; label?: string; sentAt?: string | null }) {
  const [done, setDone] = React.useState(false);
  return (
    <Button size="sm" variant={done || sentAt ? "secondary" : "accent"} asChild>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => {
          if (done) return;
          setDone(true);
          void markNoticeSentAction(kind, targetId);
        }}
      >
        {done ? <Check className="h-4 w-4" /> : <WhatsAppIcon className="h-4 w-4" />}
        {done ? "Envoi noté" : sentAt ? "Renvoyer sur WhatsApp" : label}
      </a>
    </Button>
  );
}
