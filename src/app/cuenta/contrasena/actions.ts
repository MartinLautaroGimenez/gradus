"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { destroyOtherSessions, getCurrentUser } from "@/lib/auth/session";
import { type FormState, fromZodError } from "@/lib/validation";

const schema = z
  .object({
    current: z.string().min(1, "Ingresá tu contraseña actual"),
    password: z.string().min(8, "Mínimo 8 caracteres").max(128),
    confirm: z.string(),
  })
  .refine((data) => data.password === data.confirm, { message: "Las contraseñas no coinciden", path: ["confirm"] });

export async function changePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZodError(parsed.error);
  const { current, password } = parsed.data;

  if (password === user.dni || password.replace(/\D/g, "") === user.dni) {
    return { error: "La contraseña nueva no puede ser tu DNI", fieldErrors: { password: ["No puede ser tu DNI"] } };
  }
  const stored = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { passwordHash: true } });
  if (!(await verifyPassword(current, stored.passwordHash))) {
    return { error: "La contraseña actual no es correcta", fieldErrors: { current: ["Incorrecta"] } };
  }
  if (current === password) {
    return { error: "La contraseña nueva tiene que ser distinta", fieldErrors: { password: ["Es igual a la actual"] } };
  }

  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(password), mustChangePassword: false },
  });
  await destroyOtherSessions(user.id);
  redirect("/inicio?contrasena=1");
}
