"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { useFormAction } from "@/lib/use-form-action";
import {
  type CodeState,
  type SetupState,
  confirmTwoFactorSetup,
  disableTwoFactor,
  regenerateRecoveryCodes,
  startTwoFactorSetup,
} from "./actions";

function ErrorText({ error }: { error?: string }) {
  return error ? (
    <p role="alert" className="text-sm text-danger">
      {error}
    </p>
  ) : null;
}

/** Códigos de recuperación: se muestran una sola vez. */
function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone?: () => void }) {
  function download() {
    const text = `Códigos de recuperación de Gradus\nCada uno sirve una sola vez.\n\n${codes.join("\n")}\n`;
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const link = Object.assign(document.createElement("a"), { href: url, download: "gradus-codigos-de-recuperacion.txt" });
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[15px]">
        Guardá estos códigos en un lugar seguro. Si perdés el teléfono, cada uno te deja entrar una vez. No se vuelven a
        mostrar.
      </p>
      <ul className="grid grid-cols-2 gap-2 rounded-xl bg-surface-muted p-4 font-mono text-[15px]" aria-label="Códigos de recuperación">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={download}>
          Descargar
        </Button>
        {onDone && (
          <Button type="button" onClick={onDone}>
            Ya los guardé
          </Button>
        )}
      </div>
    </div>
  );
}

export function TwoFactorSetup() {
  const [setup, setSetup] = useState<SetupState | null>(null);
  const [starting, startTransition] = useTransition();
  const [state, onSubmit, pending] = useFormAction<SetupState>(confirmTwoFactorSetup, {});

  if (state.done && state.codes) {
    return <RecoveryCodes codes={state.codes} onDone={() => window.location.assign("/cuenta/seguridad")} />;
  }

  if (!setup?.qr) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-[15px]">
          Además de la contraseña, al ingresar se pide un código que genera una app en tu teléfono (Google Authenticator,
          Microsoft Authenticator o similar). Aunque alguien sepa tu contraseña, no puede entrar.
        </p>
        <ErrorText error={setup?.error} />
        <Button type="button" disabled={starting} onClick={() => startTransition(async () => setSetup(await startTwoFactorSetup()))}>
          {starting ? "Preparando…" : "Activar"}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <ol className="flex list-decimal flex-col gap-1 pl-5 text-[15px]">
        <li>Abrí la app de autenticación y elegí agregar una cuenta.</li>
        <li>Escaneá este código (o escribí la clave de abajo).</li>
        <li>Escribí el número de 6 dígitos que aparece.</li>
      </ol>
      {/* eslint-disable-next-line @next/next/no-img-element -- QR generado en el servidor */}
      <img src={setup.qr} alt="Código QR para la app de autenticación" width={200} height={200} className="self-center rounded-xl bg-white p-2" />
      <p className="break-all text-center font-mono text-sm text-muted">{setup.secret?.match(/.{1,4}/g)?.join(" ")}</p>
      <Input name="code" inputMode="numeric" autoComplete="one-time-code" placeholder="123456" aria-label="Código de 6 números" maxLength={7} required />
      <ErrorText error={state.error} />
      <SubmitButton pending={pending} pendingText="Verificando…">
        Confirmar
      </SubmitButton>
    </form>
  );
}

export function RecoveryCodesCard() {
  const [open, setOpen] = useState(false);
  const [state, onSubmit, pending] = useFormAction<CodeState>(regenerateRecoveryCodes, {});
  if (state.codes) return <RecoveryCodes codes={state.codes} />;
  if (!open) {
    return (
      <Button type="button" variant="secondary" className="self-start" onClick={() => setOpen(true)}>
        Generar códigos de recuperación nuevos
      </Button>
    );
  }
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <p className="text-[15px]">Los códigos anteriores dejan de servir. Confirmá con el código de la app.</p>
      <Input name="code" inputMode="numeric" autoComplete="one-time-code" placeholder="123456" aria-label="Código de 6 números" maxLength={7} required />
      <ErrorText error={state.error} />
      <SubmitButton pending={pending} pendingText="Generando…" className="self-start">
        Generar
      </SubmitButton>
    </form>
  );
}

export function DisableTwoFactor() {
  const [open, setOpen] = useState(false);
  const [state, onSubmit, pending] = useFormAction<CodeState>(disableTwoFactor, {});
  if (!open) {
    return (
      <button type="button" className="self-start text-[15px] text-danger" onClick={() => setOpen(true)}>
        Desactivar
      </button>
    );
  }
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 border-t border-border pt-4">
      <p className="text-[15px]">Para desactivarla, confirmá con tu contraseña y un código.</p>
      <Input name="password" type="password" autoComplete="current-password" placeholder="Contraseña" aria-label="Contraseña" required />
      <Input name="code" autoComplete="one-time-code" placeholder="Código de la app o de recuperación" aria-label="Código" maxLength={20} required />
      <ErrorText error={state.error} />
      <SubmitButton pending={pending} pendingText="Desactivando…" variant="secondary" className="self-start">
        Desactivar
      </SubmitButton>
    </form>
  );
}
