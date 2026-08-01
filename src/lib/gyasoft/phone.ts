/**
 * Normalización de teléfonos. Por ahora sólo Bolivia (+591).
 */

const COUNTRY_CODE = "591";
const NATIONAL_LENGTH = 8;

export type PhoneResult =
  | { ok: true; phone: string }
  | { ok: false; reason: string };

/**
 * Acepta 8 dígitos nacionales (les antepone 591) o un número que ya venga
 * con el prefijo 591. Cualquier otro formato se rechaza.
 */
export function normalizePhone(input: string): PhoneResult {
  const cleaned = input.replace(/[\s\-()+]/g, "");

  if (cleaned.length === 0) {
    return { ok: false, reason: "telefono está vacío" };
  }

  if (!/^[0-9]+$/.test(cleaned)) {
    return {
      ok: false,
      reason: "telefono sólo puede contener dígitos, espacios, guiones, paréntesis o +",
    };
  }

  if (cleaned.length === NATIONAL_LENGTH) {
    return { ok: true, phone: COUNTRY_CODE + cleaned };
  }

  if (
    cleaned.startsWith(COUNTRY_CODE) &&
    cleaned.length === COUNTRY_CODE.length + NATIONAL_LENGTH
  ) {
    return { ok: true, phone: cleaned };
  }

  return {
    ok: false,
    reason: `telefono debe tener ${NATIONAL_LENGTH} dígitos o empezar con ${COUNTRY_CODE}`,
  };
}

/** Versión enmascarada para logs: 59170000000 -> 591****0000 */
export function maskPhone(phone: string): string {
  if (phone.length <= 7) return "*".repeat(phone.length);
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}
