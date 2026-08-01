/**
 * Health check público.
 *
 * Sólo informa si el servicio está configurado o no. No revela qué variable
 * falta ni, por supuesto, ningún valor: la respuesta es idéntica salvo por `ok`
 * y el status HTTP.
 */
export async function GET() {
  const ok =
    Boolean(process.env.KAPSO_API_KEY) &&
    Boolean(process.env.GYASOFT_PHONE_NUMBER_ID) &&
    Boolean(process.env.GYASOFT_CLIENT_API_KEY);

  return Response.json(
    {
      ok,
      service: "gyasoft-whatsapp-middleware",
      // El fallback evita que la clave desaparezca del JSON si ninguna de las
      // dos variables está definida: el contrato debe ser siempre el mismo.
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
    },
    { status: ok ? 200 : 503 }
  );
}
