# Gyasoft WhatsApp Middleware

Middleware privado de Smarky que permite al sistema de Gyasoft enviar
**únicamente las 6 plantillas de WhatsApp aprobadas** a través de Kapso.

Es una capa deliberadamente estrecha: no expone el Inbox, no permite consultar
conversaciones, contactos ni mensajes, y no acepta texto libre. El cliente sólo
elige un tipo de plantilla de una lista cerrada y aporta sus variables.

## Arquitectura

```
Gyasoft  ──X-API-Key──►  Middleware Smarky  ──KAPSO_API_KEY──►  Kapso  ──►  WhatsApp
```

- Gyasoft se autentica con `X-API-Key` (su propia clave de cliente).
- El middleware valida, resuelve el nombre real de la plantilla y llama a Kapso.
- `KAPSO_API_KEY` vive **sólo** en el middleware; Gyasoft nunca la ve.

## Variables de entorno

Las tres son obligatorias. Se configuran en Vercel (Project Settings →
Environment Variables). No se versionan ni se escriben en archivos `.env` del
repositorio.

| Variable | Descripción |
| --- | --- |
| `KAPSO_API_KEY` | Clave de Smarky para autenticarse contra la API de Kapso. |
| `GYASOFT_PHONE_NUMBER_ID` | ID del número de WhatsApp emisor. |
| `GYASOFT_CLIENT_API_KEY` | Clave que Gyasoft envía en `X-API-Key`. |

Si falta cualquiera, los endpoints responden `503`.

> **La `X-API-Key` de Gyasoft debe guardarse únicamente en el backend de
> Gyasoft.** Nunca en aplicaciones móviles, frontends web, repositorios ni
> variables expuestas al navegador: quien la posea puede enviar mensajes de
> WhatsApp en nombre de la empresa.

## Endpoints

### `GET /api/health`

Verifica que las variables de entorno estén presentes. `200` si están las tres,
`503` si falta alguna. La respuesta es idéntica en ambos casos salvo por `ok`:
no indica cuál variable falta ni devuelve ningún valor.

```json
{
  "ok": true,
  "service": "gyasoft-whatsapp-middleware",
  "environment": "production"
}
```

### `POST /api/gyasoft/send-template`

Envía una de las 6 plantillas autorizadas.

**Headers**

```
X-API-Key: <GYASOFT_CLIENT_API_KEY>
Content-Type: application/json
```

**Body**

| Campo | Tipo | Descripción |
| --- | --- | --- |
| `tipo` | string | Uno de los 6 tipos permitidos (ver abajo). |
| `telefono` | string | Número del destinatario. |
| `datos` | object | Variables de la plantilla. |
| `id_operacion` | string | Identificador de la operación, definido por Gyasoft. |

No se aceptan otros campos: cualquier clave extra en el body o en `datos`
produce `400`. En particular, **el nombre real de la plantilla no puede
enviarse desde el cliente**; se resuelve internamente a partir de `tipo`.

**Normalización del teléfono**

Se eliminan espacios, guiones, paréntesis y `+`. Luego:

- 8 dígitos → se le antepone `591`;
- ya empieza con `591` y tiene 11 dígitos → se acepta tal cual;
- cualquier otro formato → `400`.

## Plantillas permitidas

| `tipo` | Plantilla real | Idioma | Variables (en orden) |
| --- | --- | --- | --- |
| `aviso_de_deuda` | `cumbre_aviso_de_deuda` | `es` | `nombre`, `servicio`, `codigo` |
| `recordatorio_de_corte` | `cumbre_recordatorio_de_corte` | `es` | `nombre`, `servicio`, `codigo` |
| `pago_realizado` | `cumbre_pago_realizado` | `es` | `nombre`, `detalle`, `servicio`, `descuento`, `comprobante` |
| `aviso_de_deuda_enlace` | `aviso_de_deuda` | `es` | `nombre`, `servicio`, `enlace_pago` |
| `recordatorio_de_corte_enlace` | `recordatorio_de_corte` | `es` | `nombre`, `servicio`, `enlace_pago` |
| `detalle_de_pago` | `detalle_de_pago` | `es` | `nombre`, `detalle`, `servicio`, `descuento`, `comprobante` |

Todas las variables son obligatorias, deben ser string o número, y no pueden
quedar vacías. No pueden contener saltos de línea, retornos de carro ni
tabulaciones (Meta rechaza esos parámetros); si los contienen, la respuesta es
`400`. El orden de la tabla es el orden en que se envían a Meta.

> **`enlace_pago` es una variable de texto del BODY, no un botón dinámico.** Se
> envía como un `parameter` de tipo `text` más, igual que `nombre` o `servicio`.
> Las plantillas no llevan header, imagen, documento, vídeo ni botones: el
> payload hacia Kapso contiene únicamente el componente `body`.

Ojo con los nombres: el `tipo` lógico `aviso_de_deuda_enlace` corresponde a la
plantilla real `aviso_de_deuda`, mientras que el `tipo` `aviso_de_deuda`
corresponde a `cumbre_aviso_de_deuda`. Lo mismo ocurre con
`recordatorio_de_corte_enlace` → `recordatorio_de_corte`. Son plantillas
distintas en Meta; el `tipo` que se envía en la petición es el de la primera
columna.

### Payload de cada tipo

```jsonc
// aviso_de_deuda
{
  "tipo": "aviso_de_deuda",
  "telefono": "70000000",
  "datos": {
    "nombre": "NOMBRE DEL CLIENTE",
    "servicio": "DESCRIPCION DEL SERVICIO",
    "codigo": "CODIGO DE CLIENTE"
  },
  "id_operacion": "deuda-<codigo>-<periodo>"
}
```

```jsonc
// recordatorio_de_corte
{
  "tipo": "recordatorio_de_corte",
  "telefono": "70000000",
  "datos": {
    "nombre": "NOMBRE DEL CLIENTE",
    "servicio": "DESCRIPCION DEL SERVICIO",
    "codigo": "CODIGO DE CLIENTE"
  },
  "id_operacion": "corte-<codigo>-<periodo>"
}
```

```jsonc
// pago_realizado
{
  "tipo": "pago_realizado",
  "telefono": "70000000",
  "datos": {
    "nombre": "NOMBRE DEL CLIENTE",
    "detalle": "DETALLE DEL PAGO",
    "servicio": "DESCRIPCION DEL SERVICIO",
    "descuento": "MONTO DE DESCUENTO",
    "comprobante": "NUMERO DE COMPROBANTE"
  },
  "id_operacion": "pago-<codigo>-<periodo>"
}
```

```jsonc
// aviso_de_deuda_enlace
{
  "tipo": "aviso_de_deuda_enlace",
  "telefono": "70000000",
  "datos": {
    "nombre": "NOMBRE DEL CLIENTE",
    "servicio": "DESCRIPCION DEL SERVICIO",
    "enlace_pago": "https://EJEMPLO/veripagos/cliente?cod_cliente=<codigo>"
  },
  "id_operacion": "aviso-deuda-enlace-<codigo>-<periodo>"
}
```

```jsonc
// recordatorio_de_corte_enlace
{
  "tipo": "recordatorio_de_corte_enlace",
  "telefono": "70000000",
  "datos": {
    "nombre": "NOMBRE DEL CLIENTE",
    "servicio": "DESCRIPCION DEL SERVICIO",
    "enlace_pago": "https://EJEMPLO/veripagos/cliente?cod_cliente=<codigo>"
  },
  "id_operacion": "recordatorio-corte-enlace-<codigo>-<periodo>"
}
```

```jsonc
// detalle_de_pago
{
  "tipo": "detalle_de_pago",
  "telefono": "70000000",
  "datos": {
    "nombre": "NOMBRE DEL CLIENTE",
    "detalle": "PERIODO DEL PAGO",
    "servicio": "DESCRIPCION DEL SERVICIO",
    "descuento": "MONTO DE DESCUENTO",
    "comprobante": "NUMERO DE COMPROBANTE"
  },
  "id_operacion": "detalle-pago-<comprobante>-<periodo>"
}
```

> Los valores de ejemplo son ficticios. `70000000` es un marcador de posición,
> no un número real.

## Respuestas

### Éxito — `200`

```json
{
  "ok": true,
  "id_operacion": "deuda-00000-2026-01",
  "tipo": "aviso_de_deuda",
  "telefono": "59170000000",
  "template": "cumbre_aviso_de_deuda",
  "message_id": "wamid....",
  "status": "accepted"
}
```

`status: "accepted"` significa que Kapso aceptó el envío, **no** que el mensaje
haya sido entregado o leído. `message_id` puede ser `null` si el proveedor
responde correctamente pero sin identificador.

### Errores

| Status | `error` | Cuándo |
| --- | --- | --- |
| `400` | `invalid_json` | El body no es JSON válido. |
| `400` | `invalid_request` | Validación fallida. Incluye `details` con la lista de errores. |
| `401` | `unauthorized` | `X-API-Key` ausente o incorrecta. |
| `405` | — | Método distinto de `POST`. |
| `502` | `provider_error` | Kapso respondió con error, no fue alcanzable, o se agotó el timeout de 15 s. |
| `503` | `service_not_configured` | Falta alguna variable de entorno. |

```json
{ "ok": false, "error": "provider_error", "id_operacion": "deuda-00000-2026-01" }
```

Las respuestas de error **nunca** incluyen el body ni el mensaje de error de
Kapso, ni ninguna clave de API. Los logs registran únicamente `id_operacion`,
`tipo`, el teléfono enmascarado (`591****0000`) y el status HTTP; nunca nombres,
servicio, código, comprobante, el teléfono completo ni secretos.

## Responsabilidad sobre duplicados

> **Gyasoft debe disparar cada operación una sola vez y controlar duplicados en
> su propio sistema. El middleware no persiste `id_operacion` ni realiza
> reintentos automáticos.**

Consecuencia práctica: dos llamadas con el mismo `id_operacion` envían **dos
mensajes**. `id_operacion` se valida y se devuelve en la respuesta para permitir
la trazabilidad, pero no se almacena en ningún lado.

Ante un `502` el resultado es **incierto**: la petición pudo llegar a Kapso y el
mensaje pudo haberse entregado aunque se haya perdido la respuesta. Si Gyasoft
decide reintentar, debe reutilizar **exactamente el mismo `id_operacion`**,
nunca uno nuevo, para poder identificar el duplicado de su lado.

## Desarrollo

Requiere **Node >= 22.18.0** (el runner de pruebas ejecuta TypeScript de forma
nativa).

```bash
npm install
npm run dev     # servidor local
npm test        # pruebas unitarias (node:test, sin dependencias externas)
npm run lint
npm run build
```

Las variables de entorno se pasan al proceso; no crear archivos `.env` con
valores reales en el repositorio.

## Fuera de alcance en esta versión

Base de datos, colas, webhooks de estado de entrega, reintentos automáticos e
idempotencia persistente.
