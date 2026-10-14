/**
 * Política de contraseñas, pensada para familias (que sea fácil de cumplir
 * pero no adivinable): al menos 10 caracteres, que no sea una de las más
 * usadas ni contenga el DNI o el nombre, y que no sea una secuencia.
 */
const COMMON = new Set([
  "1234567890", "12345678910", "0123456789", "1234512345", "1111111111", "0000000000", "qwertyuiop", "asdfghjklñ",
  "contraseña", "contrasena", "password", "password1", "password123", "passw0rd", "123456789a", "a123456789",
  "iloveyou12", "teamo12345", "teamomucho", "bocajuniors", "riverplate", "argentina1", "argentina10", "mendoza123",
  "mendoza2026", "gradus1234", "gradus2026", "escuela123", "escuela2026", "etec123456", "etec2026", "colegio123",
  "alumno1234", "profesor123", "docente123", "preceptor1", "bienvenido", "bienvenido1", "holahola12", "holamundo1",
]);

export const PASSWORD_MIN_LENGTH = 10;

function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function isSequence(text: string) {
  if (/^(.)\1+$/.test(text)) return true; // aaaaaaaaaa
  const codes = [...text].map((c) => c.charCodeAt(0));
  const up = codes.every((c, i) => i === 0 || c === codes[i - 1] + 1);
  const down = codes.every((c, i) => i === 0 || c === codes[i - 1] - 1);
  return up || down;
}

/** Devuelve el motivo por el que la contraseña no sirve, o null si está bien. */
export function passwordProblem(
  password: string,
  person: { dni?: string | null; firstName?: string | null; lastName?: string | null; email?: string | null },
): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `Tiene que tener al menos ${PASSWORD_MIN_LENGTH} caracteres`;
  if (password.length > 128) return "Es demasiado larga (máximo 128 caracteres)";
  const plain = normalize(password);
  if (COMMON.has(plain) || isSequence(plain)) return "Es demasiado fácil de adivinar";
  if (person.dni && plain.replace(/\D/g, "").includes(person.dni)) return "No puede contener tu DNI";
  const words = [person.firstName, person.lastName, person.email?.split("@")[0]]
    .flatMap((w) => normalize(w ?? "").split(/[\s.]+/))
    .filter((w) => w.length >= 4);
  if (words.some((w) => plain.includes(w))) return "No puede contener tu nombre, apellido o email";
  if (new Set(plain).size < 4) return "Usá más caracteres distintos";
  return null;
}
