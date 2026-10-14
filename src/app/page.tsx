import { redirect } from "next/navigation";

// Dinámica para que la respuesta lleve el nonce de la política de seguridad.
export const dynamic = "force-dynamic";

export default function Home() {
  redirect("/inicio");
}
