"use client";

export function PhoneInput({
  id,
  value,
  onChange,
  placeholder,
  required,
  disabled,
  autoComplete,
  strict = false,
}: {
  id: string;
  value: string;
  onChange: (digits: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  autoComplete?: string;
  /** Numéro sénégalais complet exigé : 9 chiffres commençant par 7 ou 3 (inscription, profil, boutique). */
  strict?: boolean;
}) {
  return (
    <div className="flex items-center overflow-hidden rounded-lg border border-input bg-card focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
      <span className="flex h-10 items-center border-r border-input bg-muted px-3 text-sm font-medium text-muted-foreground">
        +221
      </span>
      <input
        id={id}
        type="tel"
        inputMode="numeric"
        required={required}
        disabled={disabled}
        maxLength={9}
        pattern={strict ? "[37][0-9]{8}" : undefined}
        title={strict ? "9 chiffres, ex. 77 123 45 67" : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 9))}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="h-10 w-full bg-transparent px-3.5 text-sm text-foreground placeholder:text-muted-foreground outline-none disabled:opacity-60"
      />
    </div>
  );
}
