import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { GET as healthGET } from "../src/app/api/health/route.ts";
import { extractMessageId } from "../src/lib/gyasoft/kapso.ts";
import { maskPhone, normalizePhone } from "../src/lib/gyasoft/phone.ts";
import {
  isTemplateKey,
  TEMPLATE_KEYS,
  TEMPLATES,
} from "../src/lib/gyasoft/templates.ts";
import {
  buildTemplatePayload,
  validateSendTemplateRequest,
  type ValidationResult,
} from "../src/lib/gyasoft/validation.ts";

/** Narrowing con mensaje útil cuando la validación falla inesperadamente. */
function expectOk(result: ValidationResult) {
  if (!result.ok) assert.fail(`validación fallida: ${result.errors.join("; ")}`);
  return result.value;
}

function expectErrors(result: ValidationResult): string[] {
  if (result.ok) assert.fail("se esperaba un error de validación");
  return result.errors;
}

const validBody = {
  tipo: "aviso_de_deuda",
  telefono: "70000000",
  datos: {
    nombre: "NOMBRE DE PRUEBA",
    servicio: "SERVICIO DE PRUEBA 15 megas, 120 Bs",
    codigo: "00000",
  },
  id_operacion: "deuda-00000-2026-08",
};

describe("normalizePhone", () => {
  it("antepone 591 a números nacionales de 8 dígitos", () => {
    assert.deepEqual(normalizePhone("70000000"), {
      ok: true,
      phone: "59170000000",
    });
  });

  it("limpia espacios, guiones, paréntesis y +", () => {
    assert.deepEqual(normalizePhone(" +591 (7) 000-0000 "), {
      ok: true,
      phone: "59170000000",
    });
  });

  it("acepta números que ya vienen con 591", () => {
    assert.deepEqual(normalizePhone("59170000000"), {
      ok: true,
      phone: "59170000000",
    });
  });

  it("rechaza longitudes inesperadas", () => {
    assert.equal(normalizePhone("7000").ok, false);
    assert.equal(normalizePhone("591700000000000").ok, false);
  });

  it("rechaza prefijos de otros países", () => {
    assert.equal(normalizePhone("+5491112345678").ok, false);
  });

  it("rechaza caracteres no numéricos", () => {
    assert.equal(normalizePhone("7000abcd").ok, false);
    assert.equal(normalizePhone("").ok, false);
  });

  it("enmascara el teléfono para logs", () => {
    assert.equal(maskPhone("59170000000"), "591****0000");
  });
});

describe("validateSendTemplateRequest", () => {
  it("acepta una petición válida y normaliza el teléfono", () => {
    const result = validateSendTemplateRequest(validBody);
    assert.equal(result.ok, true);
    assert.equal(result.value.telefono, "59170000000");
    assert.equal(result.value.template.name, "cumbre_aviso_de_deuda");
  });

  it("rechaza un tipo desconocido", () => {
    const result = validateSendTemplateRequest({
      ...validBody,
      tipo: "promocion_libre",
    });
    assert.equal(result.ok, false);
  });

  it("no permite inyectar el nombre real de la plantilla", () => {
    const result = validateSendTemplateRequest({
      ...validBody,
      template: "cualquier_cosa",
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes("campos no permitidos")));
  });

  it("exige todas las variables de la plantilla", () => {
    const result = validateSendTemplateRequest({
      ...validBody,
      datos: { nombre: "NOMBRE DE PRUEBA" },
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes("datos.servicio")));
    assert.ok(result.errors.some((e) => e.includes("datos.codigo")));
  });

  it("convierte números a string", () => {
    const result = validateSendTemplateRequest({
      ...validBody,
      datos: { ...validBody.datos, codigo: 12345 },
    });
    assert.equal(result.ok, true);
    assert.equal(result.value.datos.codigo, "12345");
  });

  it("rechaza saltos de línea, retorno de carro y tabulaciones", () => {
    for (const [caracter, etiqueta] of [
      ["\n", "\\n"],
      ["\r", "\\r"],
      ["\t", "\\t"],
    ]) {
      const result = validateSendTemplateRequest({
        ...validBody,
        datos: { ...validBody.datos, nombre: `NOMBRE${caracter}DE PRUEBA` },
      });
      assert.equal(result.ok, false, `debería rechazar ${etiqueta}`);
      assert.ok(
        result.errors.includes(
          "datos.nombre no puede contener saltos de línea ni tabulaciones"
        ),
        `mensaje incorrecto para ${etiqueta}`
      );
    }
  });

  it("rechaza el carácter aunque quede en los extremos", () => {
    const result = validateSendTemplateRequest({
      ...validBody,
      datos: { ...validBody.datos, servicio: "SERVICIO DE PRUEBA\n" },
    });
    assert.equal(result.ok, false);
    assert.ok(
      result.errors.includes(
        "datos.servicio no puede contener saltos de línea ni tabulaciones"
      )
    );
  });

  it("rechaza valores vacíos o de tipo inválido", () => {
    assert.equal(
      validateSendTemplateRequest({
        ...validBody,
        datos: { ...validBody.datos, nombre: "   " },
      }).ok,
      false
    );
    assert.equal(
      validateSendTemplateRequest({
        ...validBody,
        datos: { ...validBody.datos, nombre: { a: 1 } },
      }).ok,
      false
    );
  });

  it("exige id_operacion como string no vacío", () => {
    assert.equal(
      validateSendTemplateRequest({
        tipo: validBody.tipo,
        telefono: validBody.telefono,
        datos: validBody.datos,
      }).ok,
      false
    );
    assert.equal(
      validateSendTemplateRequest({ ...validBody, id_operacion: 123 }).ok,
      false
    );
  });

  it("rechaza bodies que no son objetos", () => {
    assert.equal(validateSendTemplateRequest(null).ok, false);
    assert.equal(validateSendTemplateRequest([validBody]).ok, false);
    assert.equal(validateSendTemplateRequest("texto libre").ok, false);
  });

  it("pago_realizado exige sus cinco variables", () => {
    const result = validateSendTemplateRequest({
      tipo: "pago_realizado",
      telefono: "70000000",
      datos: {
        nombre: "NOMBRE DE PRUEBA",
        detalle: "Pago mensual",
        servicio: "SERVICIO DE PRUEBA",
        descuento: "0 Bs",
        comprobante: "F-0001",
      },
      id_operacion: "pago-1",
    });
    assert.equal(result.ok, true);
    assert.equal(result.value.template.name, "cumbre_pago_realizado");
  });
});

const ENLACE_PAGO =
  "https://example.invalid/veripagos/cliente?cod_cliente=00000&origen=wsp";

/** Las 3 plantillas incorporadas en esta ronda. */
const NUEVAS = [
  {
    tipo: "aviso_de_deuda_enlace",
    name: "aviso_de_deuda",
    variables: ["nombre", "servicio", "enlace_pago"],
    datos: {
      nombre: "NOMBRE DE PRUEBA",
      servicio: "SERVICIO DE PRUEBA 15 megas, 120 Bs",
      enlace_pago: ENLACE_PAGO,
    },
    id_operacion: "aviso-deuda-enlace-00000-2026-08",
  },
  {
    tipo: "recordatorio_de_corte_enlace",
    name: "recordatorio_de_corte",
    variables: ["nombre", "servicio", "enlace_pago"],
    datos: {
      nombre: "NOMBRE DE PRUEBA",
      servicio: "SERVICIO DE PRUEBA 15 megas, 120 Bs",
      enlace_pago: ENLACE_PAGO,
    },
    id_operacion: "recordatorio-corte-enlace-00000-2026-08",
  },
  {
    tipo: "detalle_de_pago",
    name: "detalle_de_pago",
    variables: ["nombre", "detalle", "servicio", "descuento", "comprobante"],
    datos: {
      nombre: "NOMBRE DE PRUEBA",
      detalle: "AGOSTO-2026",
      servicio: "SERVICIO DE PRUEBA 15 megas, 120 Bs",
      descuento: "0 Bs",
      comprobante: "12345",
    },
    id_operacion: "detalle-pago-12345-2026-08",
  },
] as const;

function requestFor(nueva: (typeof NUEVAS)[number]) {
  return {
    tipo: nueva.tipo,
    telefono: "70000000",
    datos: { ...nueva.datos } as Record<string, unknown>,
    id_operacion: nueva.id_operacion,
  };
}

describe("catálogo de plantillas", () => {
  it("expone exactamente 6 tipos permitidos", () => {
    assert.equal(TEMPLATE_KEYS.length, 6);
    assert.deepEqual(TEMPLATE_KEYS, [
      "aviso_de_deuda",
      "recordatorio_de_corte",
      "pago_realizado",
      "aviso_de_deuda_enlace",
      "recordatorio_de_corte_enlace",
      "detalle_de_pago",
    ]);
  });

  it("TEMPLATE_KEYS se sigue derivando de TEMPLATES", () => {
    assert.deepEqual(TEMPLATE_KEYS, Object.keys(TEMPLATES));
  });

  it("las 3 plantillas originales quedan intactas", () => {
    assert.deepEqual(TEMPLATES.aviso_de_deuda, {
      name: "cumbre_aviso_de_deuda",
      language: "es",
      variables: ["nombre", "servicio", "codigo"],
    });
    assert.deepEqual(TEMPLATES.recordatorio_de_corte, {
      name: "cumbre_recordatorio_de_corte",
      language: "es",
      variables: ["nombre", "servicio", "codigo"],
    });
    assert.deepEqual(TEMPLATES.pago_realizado, {
      name: "cumbre_pago_realizado",
      language: "es",
      variables: ["nombre", "detalle", "servicio", "descuento", "comprobante"],
    });
  });

  it("no incluye aviso_de_corte ni aviso_de_cortes", () => {
    assert.equal(isTemplateKey("aviso_de_corte"), false);
    assert.equal(isTemplateKey("aviso_de_cortes"), false);
    assert.ok(!Object.keys(TEMPLATES).includes("aviso_de_corte"));
    assert.ok(!Object.keys(TEMPLATES).includes("aviso_de_cortes"));
    assert.ok(
      !Object.values(TEMPLATES).some(
        (t) => t.name === "aviso_de_corte" || t.name === "aviso_de_cortes"
      )
    );
  });

  for (const nueva of NUEVAS) {
    it(`${nueva.tipo} resuelve a la plantilla real, idioma y orden correctos`, () => {
      assert.equal(isTemplateKey(nueva.tipo), true);
      assert.deepEqual(TEMPLATES[nueva.tipo], {
        name: nueva.name,
        language: "es",
        variables: nueva.variables,
      });
    });
  }
});

describe("plantillas nuevas: validación y payload", () => {
  for (const nueva of NUEVAS) {
    it(`acepta un envío válido de ${nueva.tipo}`, () => {
      const value = expectOk(validateSendTemplateRequest(requestFor(nueva)));
      assert.equal(value.template.name, nueva.name);
      assert.equal(value.template.language, "es");
      assert.equal(value.telefono, "59170000000");
      assert.equal(value.id_operacion, nueva.id_operacion);
    });

    it(`${nueva.tipo} genera sólo body con parameters de tipo text`, () => {
      const payload = buildTemplatePayload(
        expectOk(validateSendTemplateRequest(requestFor(nueva)))
      );

      assert.equal(payload.template.components.length, 1);
      assert.equal(payload.template.components[0].type, "body");
      assert.deepEqual(
        payload.template.components[0].parameters.map((p) => p.type),
        nueva.variables.map(() => "text")
      );
      assert.deepEqual(
        payload.template.components[0].parameters.map((p) => p.text),
        nueva.variables.map((v) => nueva.datos[v as keyof typeof nueva.datos])
      );

      const serializado = JSON.stringify(payload);
      for (const prohibido of [
        "header",
        "button",
        "image",
        "document",
        "video",
      ]) {
        assert.ok(
          !serializado.includes(prohibido),
          `el payload no debe contener "${prohibido}"`
        );
      }
    });

    it(`${nueva.tipo} rechaza si falta una variable obligatoria`, () => {
      const request = requestFor(nueva);
      const faltante = nueva.variables[nueva.variables.length - 1];
      delete request.datos[faltante];

      const errors = expectErrors(validateSendTemplateRequest(request));
      assert.ok(errors.includes(`datos.${faltante} es obligatorio`));
    });

    it(`${nueva.tipo} rechaza una variable adicional en datos`, () => {
      const request = requestFor(nueva);
      request.datos.extra = "valor";

      const errors = expectErrors(validateSendTemplateRequest(request));
      assert.ok(
        errors.includes("datos contiene variables no esperadas: extra")
      );
    });

    it(`${nueva.tipo} rechaza \\n, \\r y \\t`, () => {
      const objetivo = nueva.variables[0];
      for (const caracter of ["\n", "\r", "\t"]) {
        const request = requestFor(nueva);
        request.datos[objetivo] = `NOMBRE${caracter}DE PRUEBA`;

        const errors = expectErrors(validateSendTemplateRequest(request));
        assert.ok(
          errors.includes(
            `datos.${objetivo} no puede contener saltos de línea ni tabulaciones`
          )
        );
      }
    });
  }

  it("enlace_pago acepta una URL HTTPS con : / ? = y &, sin alterarla", () => {
    const value = expectOk(
      validateSendTemplateRequest(requestFor(NUEVAS[0]))
    );
    assert.equal(value.datos.enlace_pago, ENLACE_PAGO);

    const payload = buildTemplatePayload(value);
    assert.deepEqual(payload.template.components[0].parameters[2], {
      type: "text",
      text: ENLACE_PAGO,
    });
  });
});

describe("GET /api/health", () => {
  const KEYS = [
    "KAPSO_API_KEY",
    "GYASOFT_PHONE_NUMBER_ID",
    "GYASOFT_CLIENT_API_KEY",
  ] as const;
  const VALOR = "valor-de-prueba-no-real";
  const original = new Map(KEYS.map((key) => [key, process.env[key]]));

  afterEach(() => {
    for (const key of KEYS) {
      const value = original.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("responde 200 sin exponer checks ni valores", async () => {
    for (const key of KEYS) process.env[key] = VALOR;

    const response = await healthGET();
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.service, "gyasoft-whatsapp-middleware");
    assert.deepEqual(Object.keys(body).sort(), [
      "environment",
      "ok",
      "service",
    ]);
    assert.ok(!JSON.stringify(body).includes(VALOR));
  });

  it("responde 503 sin indicar qué variable falta", async () => {
    for (const key of KEYS) process.env[key] = VALOR;
    delete process.env.KAPSO_API_KEY;

    const response = await healthGET();
    const body = await response.json();

    assert.equal(response.status, 503);
    assert.equal(body.ok, false);
    assert.deepEqual(Object.keys(body).sort(), [
      "environment",
      "ok",
      "service",
    ]);
    assert.ok(!JSON.stringify(body).toUpperCase().includes("KAPSO"));
  });
});

describe("extractMessageId", () => {
  it("lee el wamid del formato de Meta", () => {
    assert.equal(
      extractMessageId({
        messaging_product: "whatsapp",
        contacts: [{ input: "59170000000", wa_id: "59170000000" }],
        messages: [{ id: "wamid.HBgLNTkxNzAwMDAwMDA=" }],
      }),
      "wamid.HBgLNTkxNzAwMDAwMDA="
    );
  });

  it("acepta variantes planas", () => {
    assert.equal(extractMessageId({ message_id: "abc" }), "abc");
    assert.equal(extractMessageId({ wamid: "wamid.XYZ" }), "wamid.XYZ");
    assert.equal(extractMessageId({ id: "msg_1" }), "msg_1");
  });

  it("devuelve null cuando no hay identificador", () => {
    assert.equal(extractMessageId(null), null);
    assert.equal(extractMessageId("texto"), null);
    assert.equal(extractMessageId({}), null);
    assert.equal(extractMessageId({ messages: [] }), null);
    assert.equal(extractMessageId({ messages: [{ id: 42 }] }), null);
    assert.equal(extractMessageId({ message_id: "" }), null);
  });
});

describe("buildTemplatePayload", () => {
  it("respeta el orden de las variables", () => {
    const result = validateSendTemplateRequest(validBody);
    assert.equal(result.ok, true);
    const payload = buildTemplatePayload(result.value);

    assert.deepEqual(payload, {
      messaging_product: "whatsapp",
      to: "59170000000",
      type: "template",
      template: {
        name: "cumbre_aviso_de_deuda",
        language: { code: "es" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: "NOMBRE DE PRUEBA" },
              { type: "text", text: "SERVICIO DE PRUEBA 15 megas, 120 Bs" },
              { type: "text", text: "00000" },
            ],
          },
        ],
      },
    });
  });
});
