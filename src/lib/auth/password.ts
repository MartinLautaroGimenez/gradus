import bcrypt from "bcryptjs";

const ROUNDS = 12;
/**
 * La contraseña inicial es el DNI y se cambia en el primer ingreso: un costo
 * alto no la hace más segura y vuelve lentísima la importación masiva.
 */
const INITIAL_ROUNDS = 8;

export function hashPassword(password: string) {
  return bcrypt.hash(password, ROUNDS);
}

export function hashInitialPassword(dni: string) {
  return bcrypt.hash(dni, INITIAL_ROUNDS);
}

export function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}
