"use client";

import { useEffect } from "react";

/** Registra el service worker (notificaciones push e instalación como app). */
export function ServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
