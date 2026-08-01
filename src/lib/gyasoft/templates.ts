/**
 * Catálogo cerrado de plantillas de WhatsApp aprobadas.
 *
 * El cliente sólo envía un `tipo` lógico; el nombre real de la plantilla
 * nunca se acepta desde la petición, siempre se resuelve aquí.
 */

export type TemplateKey =
  | "aviso_de_deuda"
  | "recordatorio_de_corte"
  | "pago_realizado";

export type TemplateDefinition = {
  /** Nombre real de la plantilla aprobada en Meta/Kapso. */
  readonly name: string;
  readonly language: string;
  /** Variables del body, en el orden exacto en que Meta las espera. */
  readonly variables: readonly string[];
};

export const TEMPLATES: Readonly<Record<TemplateKey, TemplateDefinition>> = {
  aviso_de_deuda: {
    name: "cumbre_aviso_de_deuda",
    language: "es",
    variables: ["nombre", "servicio", "codigo"],
  },
  recordatorio_de_corte: {
    name: "cumbre_recordatorio_de_corte",
    language: "es",
    variables: ["nombre", "servicio", "codigo"],
  },
  pago_realizado: {
    name: "cumbre_pago_realizado",
    language: "es",
    variables: ["nombre", "detalle", "servicio", "descuento", "comprobante"],
  },
};

export const TEMPLATE_KEYS = Object.keys(TEMPLATES) as TemplateKey[];

export function isTemplateKey(value: unknown): value is TemplateKey {
  return typeof value === "string" && value in TEMPLATES;
}
