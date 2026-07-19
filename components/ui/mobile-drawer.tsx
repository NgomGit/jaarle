"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function MobileDrawer({
  open,
  onClose,
  side = "right",
  children,
}: {
  open: boolean;
  onClose: () => void;
  side?: "left" | "right";
  children: React.ReactNode;
}) {
  React.useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <div className={cn("fixed inset-0 z-[60]", open ? "pointer-events-auto" : "pointer-events-none")} aria-hidden={!open}>
      <div
        className={cn("absolute inset-0 bg-black/50 transition-opacity", open ? "opacity-100" : "opacity-0")}
        onClick={onClose}
      />
      <div
        className={cn(
          "absolute top-0 h-full w-[82%] max-w-[320px] overflow-y-auto bg-card shadow-2xl transition-transform duration-300 ease-out",
          side === "right" ? "right-0" : "left-0",
          open ? "translate-x-0" : side === "right" ? "translate-x-full" : "-translate-x-full"
        )}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer le menu"
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </button>
        {children}
      </div>
    </div>
  );
}
