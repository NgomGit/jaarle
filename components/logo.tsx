import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={cn("h-6 w-6 shrink-0", className)}>
      <path d="M16 2 L28 9 L16 16 L4 9 Z" fill="hsl(var(--primary))" />
      <path d="M16 16 L28 9 L28 23 L16 30 Z" fill="hsl(var(--secondary))" />
      <path d="M16 16 L4 9 L4 23 L16 30 Z" fill="hsl(var(--primary))" fillOpacity="0.6" />
    </svg>
  );
}

export function Logo({ className, variant = "mark" }: { className?: string; variant?: "mark" | "image" }) {
  return (
    <div className={cn("flex items-center gap-2 font-bold text-[15px]", className)}>
      {variant === "image" ? (
        <img src="/images/logo-icon.png" alt="Jaarle" className="h-6 w-6 shrink-0 object-contain" />
      ) : (
        <LogoMark />
      )}
      Jaarle
    </div>
  );
}
