"use client";

import Link from "next/link";
import { useState } from "react";
import type { InitialCredentials as Credentials } from "@/lib/validation";
import { Button } from "./button";

/**
 * Contraseña inicial recién generada. No se guarda en ningún lado legible:
 * hay que anotarla o copiarla ahora y dársela a la persona.
 */
export function InitialCredentials({ credentials, title = "Cuenta lista" }: { credentials: Credentials; title?: string }) {
  const [copied, setCopied] = useState(false);
  const text = `Gradus — ${credentials.name}\nUsuario: ${credentials.dni}\nContraseña inicial: ${credentials.password}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div role="status" className="flex flex-col gap-3 rounded-2xl bg-success-soft p-4">
      <div>
        <p className="text-[15px] font-semibold">{title}</p>
        <p className="text-sm text-muted">
          Dale estos datos a {credentials.name}. La contraseña se muestra una sola vez; al ingresar se le pide cambiarla.
        </p>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[15px]">
        <dt className="text-muted">Usuario</dt>
        <dd className="font-mono">{credentials.dni}</dd>
        <dt className="text-muted">Contraseña</dt>
        <dd className="font-mono text-[17px] font-semibold" data-testid="initial-password">
          {credentials.password}
        </dd>
      </dl>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={copy}>
          {copied ? "Copiado" : "Copiar"}
        </Button>
        {credentials.href && (
          <Link href={credentials.href} className="inline-flex h-10 items-center rounded-full px-4 text-[15px] font-medium text-primary hover:bg-primary-soft">
            Ver ficha
          </Link>
        )}
      </div>
    </div>
  );
}
