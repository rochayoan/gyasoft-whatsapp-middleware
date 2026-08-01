import { isAuthorized } from "@/lib/gyasoft/auth.ts";
import { extractMessageId } from "@/lib/gyasoft/kapso.ts";
import { maskPhone } from "@/lib/gyasoft/phone.ts";
import {
  buildTemplatePayload,
  validateSendTemplateRequest,
} from "@/lib/gyasoft/validation.ts";

/**
 * Margen por encima de `KAPSO_TIMEOUT_MS` para que el corte lo haga esta
 * función y no la plataforma: así el cliente recibe siempre el contrato
 * `provider_error` en lugar de un 504 genérico.
 */
export const maxDuration = 20;

const KAPSO_BASE_URL = "https://api.kapso.ai/meta/whatsapp/v24.0";

/**
 * Corte único de 15 s para la llamada al proveedor. No hay reintentos: si se
 * agota, la petición se aborta y se responde `provider_error`.
 */
const KAPSO_TIMEOUT_MS = 15_000;

type ServerConfig = {
  kapsoApiKey: string;
  phoneNumberId: string;
  clientApiKey: string;
};

function readConfig(): ServerConfig | null {
  const kapsoApiKey = process.env.KAPSO_API_KEY;
  const phoneNumberId = process.env.GYASOFT_PHONE_NUMBER_ID;
  const clientApiKey = process.env.GYASOFT_CLIENT_API_KEY;

  if (!kapsoApiKey || !phoneNumberId || !clientApiKey) return null;

  return { kapsoApiKey, phoneNumberId, clientApiKey };
}

export async function POST(request: Request) {
  const config = readConfig();
  if (!config) {
    console.error("[gyasoft/send-template] faltan variables de entorno");
    return Response.json(
      { ok: false, error: "service_not_configured" },
      { status: 503 }
    );
  }

  if (!isAuthorized(request, config.clientApiKey)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const validation = validateSendTemplateRequest(body);
  if (!validation.ok) {
    return Response.json(
      { ok: false, error: "invalid_request", details: validation.errors },
      { status: 400 }
    );
  }

  const { tipo, telefono, id_operacion, template } = validation.value;
  const payload = buildTemplatePayload(validation.value);
  // Contexto de log: nunca incluye la API key ni las variables de plantilla.
  const logContext = {
    id_operacion,
    tipo,
    telefono: maskPhone(telefono),
  };

  let kapsoResponse: Response;
  try {
    kapsoResponse = await fetch(
      `${KAPSO_BASE_URL}/${config.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          "X-API-Key": config.kapsoApiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(KAPSO_TIMEOUT_MS),
      }
    );
  } catch {
    // Timeout (15 s) o fallo de red. RESULTADO INCIERTO: la petición pudo
    // haber llegado a Kapso y el mensaje pudo haberse entregado; sólo se
    // perdió la respuesta.
    //
    // El middleware NO reintenta. Si Gyasoft decide reintentar, debe hacerlo
    // reutilizando EXACTAMENTE EL MISMO `id_operacion`, nunca uno nuevo: un
    // id nuevo convierte el reintento en una operación distinta e imposibilita
    // detectar el duplicado. El control de duplicados vive en Gyasoft, porque
    // este middleware no persiste `id_operacion`.
    console.error("[gyasoft/send-template] proveedor inalcanzable", logContext);
    return Response.json(
      { ok: false, error: "provider_error", id_operacion },
      { status: 502 }
    );
  }

  if (!kapsoResponse.ok) {
    // El body del proveedor se descarta a propósito: puede contener detalles
    // internos, así que no se expone al cliente ni se registra.
    await kapsoResponse.text().catch(() => "");
    console.error("[gyasoft/send-template] error del proveedor", {
      ...logContext,
      status: kapsoResponse.status,
    });
    return Response.json(
      { ok: false, error: "provider_error", id_operacion },
      { status: 502 }
    );
  }

  const messageId = extractMessageId(
    await kapsoResponse.json().catch(() => null)
  );

  console.info("[gyasoft/send-template] enviado", {
    ...logContext,
    status: kapsoResponse.status,
  });

  return Response.json(
    {
      ok: true,
      id_operacion,
      tipo,
      telefono,
      template: template.name,
      message_id: messageId,
      status: "accepted",
    },
    { status: 200 }
  );
}
