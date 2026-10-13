/**
 * Crea (o actualiza) un usuario administrador. Se usa una sola vez al
 * instalar Gradus en un servidor nuevo, donde no se cargan datos de prueba.
 *
 *   npm run crear-admin
 *
 * Pide los datos por la terminal; la contraseña no se muestra ni queda en el
 * historial de comandos.
 */
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

// Un solo lector para todo el programa. Mientras se escribe la contraseña,
// la salida se silencia para que no se vea en pantalla.
let muted = false;
const output = new Writable({
  write(chunk, encoding, callback) {
    if (!muted) process.stdout.write(chunk, encoding);
    callback();
  },
});
const rl = createInterface({ input: process.stdin, output, terminal: !!process.stdin.isTTY });
// El iterador guarda las líneas que llegan antes de preguntar (por ejemplo, si se pasan con un pipe).
const lines = rl[Symbol.asyncIterator]();

async function ask(question: string, { hidden = false } = {}) {
  process.stdout.write(question);
  muted = hidden;
  const next = await lines.next();
  muted = false;
  if (next.done) throw new Error("Se cortó la entrada antes de completar los datos");
  const answer = next.value;
  if (hidden) process.stdout.write("\n");
  return answer.trim();
}

async function main() {
  console.log("Crear administrador de Gradus\n");
  const dni = (await ask("DNI (es el usuario para ingresar): ")).replace(/[.\s-]/g, "");
  if (!/^\d{7,9}$/.test(dni)) throw new Error("DNI inválido");
  const firstName = await ask("Nombre: ");
  const lastName = await ask("Apellido: ");
  const email = (await ask("Email (opcional): ")).toLowerCase() || null;
  if (!firstName || !lastName) throw new Error("Nombre y apellido son obligatorios");

  const password = await ask("Contraseña (mínimo 10 caracteres): ", { hidden: true });
  if (password.length < 10) throw new Error("La contraseña tiene que tener al menos 10 caracteres");
  const again = await ask("Repetí la contraseña: ", { hidden: true });
  if (password !== again) throw new Error("Las contraseñas no coinciden");

  const passwordHash = await bcrypt.hash(password, 12);
  const existing = await db.user.findUnique({ where: { dni } });
  if (existing) {
    await db.user.update({
      where: { dni },
      data: {
        firstName,
        lastName,
        email,
        passwordHash,
        active: true,
        mustChangePassword: false,
        roles: [...new Set([...existing.roles, "SUPERADMIN" as const])],
      },
    });
    console.log(`\nListo: ${firstName} ${lastName} ahora es administrador (se actualizó su contraseña).`);
  } else {
    await db.user.create({
      data: { dni, firstName, lastName, email, passwordHash, roles: ["SUPERADMIN"], mustChangePassword: false },
    });
    console.log(`\nListo: se creó el administrador ${firstName} ${lastName}. Ingresá con el DNI ${dni}.`);
  }
}

main()
  .catch((error) => {
    console.error(`\nError: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  })
  .finally(() => {
    rl.close();
    return db.$disconnect();
  });
