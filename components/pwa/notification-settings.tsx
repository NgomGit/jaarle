"use client";

import * as React from "react";
import { Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { setNotificationPreference, sendTestNotification } from "@/app/dashboard/settings/push-actions";
import { disablePush, enablePush, usePushState } from "@/lib/pwa/push";
import { NOTIFICATION_TYPES } from "@/lib/push/types";

// Section « Notifications » des paramètres : activer / couper sur cet appareil, choisir les
// types, envoyer une notification de test.

export function NotificationSettings({ configured, disabled: initialDisabled }: { configured: boolean; disabled: string[] }) {
  const [state, setState] = usePushState();
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);
  const [disabled, setDisabled] = React.useState(() => new Set(initialDisabled));

  if (!configured) return null;

  const turnOn = async () => {
    setBusy(true);
    setNote(null);
    const res = await enablePush();
    setState(res.state);
    if (res.error) setNote(res.error);
    setBusy(false);
  };
  const turnOff = async () => {
    setBusy(true);
    setState(await disablePush());
    setBusy(false);
  };
  const test = async () => {
    setBusy(true);
    const res = await sendTestNotification();
    setNote(res.ok ? "Notification envoyée : elle arrive dans quelques secondes." : "Aucun appareil n'a reçu la notification. Coupe puis réactive les notifications.");
    setBusy(false);
  };
  const toggle = async (type: string) => {
    const next = new Set(disabled);
    const enable = next.has(type);
    if (enable) next.delete(type);
    else next.add(type);
    setDisabled(next);
    const res = await setNotificationPreference(type, enable);
    if (!res.ok) setDisabled(disabled);
  };

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-4 w-4" /> Notifications
        </CardTitle>
        <CardDescription>Jaarle te prévient sur ce téléphone quand un client commande ou qu&apos;un paiement est confirmé.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {state === "loading" && <p className="text-sm text-muted-foreground">…</p>}
        {state === "unsupported" && <p className="text-sm text-muted-foreground">Ce navigateur ne reçoit pas les notifications. Utilise Chrome sur Android, ou installe Jaarle sur ton iPhone.</p>}
        {state === "needs-install" && (
          <p className="text-sm text-muted-foreground">
            Sur iPhone, les notifications marchent quand Jaarle est installée : touche <strong className="text-foreground">Partager</strong> puis{" "}
            <strong className="text-foreground">« Sur l&apos;écran d&apos;accueil »</strong>, et ouvre Jaarle depuis l&apos;icône.
          </p>
        )}
        {state === "denied" && (
          <p className="text-sm text-muted-foreground">
            Les notifications sont bloquées pour Jaarle. Pour les réactiver : touche le cadenas (ou ⋮ → Infos sur le site) à côté de l&apos;adresse, puis
            autorise les notifications.
          </p>
        )}
        {state === "off" && (
          <Button variant="accent" onClick={turnOn} disabled={busy} className="self-start">
            <Bell className="h-4 w-4" /> Activer les notifications
          </Button>
        )}
        {state === "on" && (
          <>
            <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
              {NOTIFICATION_TYPES.map((t) => {
                const on = !disabled.has(t.type);
                return (
                  <li key={t.type} className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{t.label}</p>
                      <p className="text-xs text-muted-foreground">{t.hint}</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={on}
                      aria-label={t.label}
                      onClick={() => toggle(t.type)}
                      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-primary" : "bg-muted-foreground/30"}`}
                    >
                      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={test} disabled={busy}>
                Envoyer une notification de test
              </Button>
              <Button variant="ghost" size="sm" onClick={turnOff} disabled={busy}>
                <BellOff className="h-4 w-4" /> Couper sur cet appareil
              </Button>
            </div>
          </>
        )}
        {note && <p className="text-sm text-muted-foreground">{note}</p>}
      </CardContent>
    </Card>
  );
}
