import { normalizePhone } from "./phone.ts";
import {
  isTemplateKey,
  TEMPLATES,
  TEMPLATE_KEYS,
  type TemplateDefinition,
  type TemplateKey,
} from "./templates.ts";

export type ValidatedRequest = {
  tipo: TemplateKey;
  /** Teléfono ya normalizado a formato 591XXXXXXXX. */
  telefono: string;
  /** Sólo las variables de la plantilla, ya convertidas a string. */
  datos: Record<string, string>;
  id_operacion: string;
  template: TemplateDefinition;
};

export type ValidationResult =
  | { ok: true; value: ValidatedRequest }
  | { ok: false; errors: string[] };

const ALLOWED_FIELDS = ["tipo", "telefono", "datos", "id_operacion"] as const;

/**
 * Meta rechaza los parámetros de plantilla que contienen saltos de línea o
 * tabulaciones, así que se cortan aquí en lugar de fallar aguas arriba.
 */
const FORBIDDEN_WHITESPACE = /[\n\r\t]/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" && value !== null && !Array.isArray(value)
  );
}

/** Sólo string y number son convertibles a texto de plantilla. */
function toTemplateText(value: unknown): string | null {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

export function validateSendTemplateRequest(body: unknown): ValidationResult {
  const errors: string[] = [];

  if (!isPlainObject(body)) {
    return { ok: false, errors: ["el body debe ser un objeto JSON"] };
  }

  const unknownFields = Object.keys(body).filter(
    (key) => !ALLOWED_FIELDS.includes(key as (typeof ALLOWED_FIELDS)[number])
  );
  if (unknownFields.length > 0) {
    errors.push(`campos no permitidos: ${unknownFields.join(", ")}`);
  }

  // tipo
  if (!isTemplateKey(body.tipo)) {
    errors.push(`tipo debe ser uno de: ${TEMPLATE_KEYS.join(", ")}`);
  }

  // telefono
  let telefono = "";
  if (typeof body.telefono !== "string") {
    errors.push("telefono es obligatorio y debe ser string");
  } else {
    const normalized = normalizePhone(body.telefono);
    if (normalized.ok) {
      telefono = normalized.phone;
    } else {
      errors.push(normalized.reason);
    }
  }

  // id_operacion
  let idOperacion = "";
  if (typeof body.id_operacion !== "string" || body.id_operacion.trim() === "") {
    errors.push("id_operacion es obligatorio y debe ser string no vacío");
  } else {
    idOperacion = body.id_operacion.trim();
  }

  // datos
  const datos: Record<string, string> = {};
  if (!isPlainObject(body.datos)) {
    errors.push("datos es obligatorio y debe ser un objeto");
  } else if (isTemplateKey(body.tipo)) {
    const template = TEMPLATES[body.tipo];
    const rawDatos = body.datos;

    const extra = Object.keys(rawDatos).filter(
      (key) => !template.variables.includes(key)
    );
    if (extra.length > 0) {
      errors.push(`datos contiene variables no esperadas: ${extra.join(", ")}`);
    }

    for (const variable of template.variables) {
      if (!(variable in rawDatos)) {
        errors.push(`datos.${variable} es obligatorio`);
        continue;
      }
      const raw = rawDatos[variable];
      const text = toTemplateText(raw);
      if (text === null) {
        errors.push(`datos.${variable} debe ser string o número`);
      } else if (typeof raw === "string" && FORBIDDEN_WHITESPACE.test(raw)) {
        errors.push(
          `datos.${variable} no puede contener saltos de línea ni tabulaciones`
        );
      } else if (text === "") {
        errors.push(`datos.${variable} no puede estar vacío`);
      } else {
        datos[variable] = text;
      }
    }
  }

  if (errors.length > 0 || !isTemplateKey(body.tipo)) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      tipo: body.tipo,
      telefono,
      datos,
      id_operacion: idOperacion,
      template: TEMPLATES[body.tipo],
    },
  };
}

/** Construye el payload Meta/Kapso a partir de una petición ya validada. */
export function buildTemplatePayload(request: ValidatedRequest) {
  return {
    messaging_product: "whatsapp",
    to: request.telefono,
    type: "template",
    template: {
      name: request.template.name,
      language: { code: request.template.language },
      components: [
        {
          type: "body",
          parameters: request.template.variables.map((variable) => ({
            type: "text",
            text: request.datos[variable],
          })),
        },
      ],
    },
  };
}
