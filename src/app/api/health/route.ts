export async function GET() {
  const checks = {
    kapsoApiKey: Boolean(process.env.KAPSO_API_KEY),
    phoneNumberId: Boolean(process.env.GYASOFT_PHONE_NUMBER_ID),
    clientApiKey: Boolean(process.env.GYASOFT_CLIENT_API_KEY),
  };

  const ok = Object.values(checks).every(Boolean);

  return Response.json(
    {
      ok,
      service: "gyasoft-whatsapp-middleware",
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
      checks,
    },
    { status: ok ? 200 : 503 }
  );
}
