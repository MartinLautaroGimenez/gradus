"use client";

import { useEffect } from "react";

/** Baja al último mensaje al abrir la conversación y cuando llegan mensajes nuevos. */
export function ScrollToEnd({ count }: { count: number }) {
  useEffect(() => {
    document.getElementById("fin")?.scrollIntoView({ block: "end" });
  }, [count]);
  return null;
}
