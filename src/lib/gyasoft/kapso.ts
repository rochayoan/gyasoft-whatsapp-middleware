/**
 * Lectura mínima de la respuesta de Kapso.
 *
 * Sólo se extrae el identificador del mensaje: el resto del body del proveedor
 * no se expone al cliente ni se registra.
 */

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

/**
 * Meta devuelve `{ messages: [{ id: "wamid..." }] }`; se aceptan además las
 * variantes planas por si Kapso normaliza la respuesta.
 */
export function extractMessageId(body: unknown): string | null {
  const record = asRecord(body);
  if (!record) return null;

  const messages = record.messages;
  if (Array.isArray(messages)) {
    const first = asRecord(messages[0]);
    if (first && typeof first.id === "string" && first.id !== "") {
      return first.id;
    }
  }

  for (const key of ["message_id", "wamid", "id"]) {
    const value = record[key];
    if (typeof value === "string" && value !== "") return value;
  }

  return null;
}
