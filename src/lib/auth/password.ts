import bcrypt from "bcryptjs";

const ROUNDS = 12;
/**
 * Las contraseñas iniciales son al azar y se cambian en el primer ingreso: un
 * costo un poco menor mantiene ágil la importación masiva de cientos de
 * personas sin bajar la seguridad de forma apreciable.
 */
const INITIAL_ROUNDS = 10;

/** bcrypt sólo mira los primeros 72 bytes: más largo se rechaza en los formularios. */
export const PASSWORD_MAX_LENGTH = 72;

export function hashPassword(password: string) {
  return bcrypt.hash(password, ROUNDS);
}

export function hashInitialPassword(password: string) {
  return bcrypt.hash(password, INITIAL_ROUNDS);
}

export function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}
