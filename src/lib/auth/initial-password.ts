import { randomInt } from "node:crypto";

/**
 * Contraseñas iniciales al azar, fáciles de dictar o anotar: dos palabras y
 * cuatro números ("nube-mate-4827"). Reemplazan al DNI como contraseña
 * inicial, que cualquiera que conozca el DNI de un alumno podía usar.
 * Se piden cambiar en el primer ingreso.
 */
const WORDS = [
  "agua", "arbol", "arena", "barco", "bosque", "brisa", "cafe", "calle", "campo", "canto", "cielo", "cerro",
  "clavo", "coral", "costa", "duna", "faro", "flor", "fruta", "fuego", "gato", "globo", "hoja", "huerta",
  "isla", "jardin", "lago", "lapiz", "lima", "lluvia", "luna", "malva", "mapa", "mar", "mate", "mesa",
  "monte", "nieve", "nube", "oliva", "ola", "palma", "pan", "patio", "perla", "piedra", "pino", "plaza",
  "puente", "rio", "roble", "rosa", "sal", "selva", "sierra", "sol", "tango", "tierra", "trigo", "uva",
  "valle", "vela", "viento", "vino", "zorro", "torta", "nogal", "ceibo", "condor", "puma",
];

export function generateInitialPassword() {
  const first = WORDS[randomInt(WORDS.length)];
  let second = WORDS[randomInt(WORDS.length)];
  while (second === first) second = WORDS[randomInt(WORDS.length)];
  const digits = String(randomInt(10_000)).padStart(4, "0");
  return `${first}-${second}-${digits}`;
}
