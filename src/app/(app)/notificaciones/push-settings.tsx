"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { removePushSubscription, savePushSubscription, sendTestNotification } from "./actions";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

type State = "loading" | "unsupported" | "denied" | "off" | "on" | "no-server";

/** Activar o desactivar el push en este dispositivo. */
export function PushSettings({ vapidKey }: { vapidKey: string | null }) {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [tested, setTested] = useState(false);

  useEffect(() => {
    (async () => {
      if (!vapidKey) return setState("no-server");
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) return setState("unsupported");
      if (Notification.permission === "denied") return setState("denied");
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setState(subscription ? "on" : "off");
    })();
  }, [vapidKey]);

  async function enable() {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey!),
      });
      await savePushSubscription(subscription.toJSON(), navigator.userAgent);
      setState("on");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await removePushSubscription(subscription.endpoint);
      await subscription.unsubscribe();
    }
    setState("off");
    setBusy(false);
  }

  const messages: Partial<Record<State, string>> = {
    loading: "Revisando…",
    unsupported:
      "Este navegador no permite notificaciones. En iPhone, primero agregá Gradus a la pantalla de inicio (Compartir → Agregar a inicio) y abrilo desde ahí.",
    denied: "Bloqueaste las notificaciones para este sitio. Habilitalas desde la configuración del navegador.",
    "no-server": "El servidor todavía no tiene configuradas las notificaciones push.",
  };

  return (
    <div className="flex flex-col gap-2">
      {messages[state] ? (
        <p className="text-sm text-muted">{messages[state]}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {state === "on" ? (
            <>
              <span className="text-sm text-success">Activadas en este dispositivo.</span>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={async () => {
                  await sendTestNotification();
                  setTested(true);
                }}
              >
                Enviar prueba
              </Button>
              <Button variant="ghost" disabled={busy} onClick={disable}>
                Desactivar
              </Button>
            </>
          ) : (
            <Button disabled={busy} onClick={enable}>
              Activar notificaciones en este dispositivo
            </Button>
          )}
        </div>
      )}
      {tested && <p className="text-xs text-muted">Enviada. Debería aparecer en unos segundos.</p>}
    </div>
  );
}
