import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Comparación en tiempo constante.
 *
 * Se comparan los digests SHA-256 en lugar de los strings crudos: así
 * `timingSafeEqual` siempre recibe dos buffers de 32 bytes (no lanza por
 * longitudes distintas) y la duración no filtra el largo de la clave real.
 */
export function timingSafeCompare(a: string, b: string): boolean {
  const digestA = createHash("sha256").update(a, "utf8").digest();
  const digestB = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(digestA, digestB);
}

/** Valida el header `X-API-Key` contra la clave esperada. */
export function isAuthorized(
  request: Request,
  expectedKey: string
): boolean {
  const provided = request.headers.get("x-api-key");
  if (!provided) return false;
  return timingSafeCompare(provided, expectedKey);
}
