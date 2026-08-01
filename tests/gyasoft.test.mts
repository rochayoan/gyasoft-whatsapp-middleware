import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { GET as healthGET } from "../src/app/api/health/route.ts";
import { extractMessageId } from "../src/lib/gyasoft/kapso.ts";
import { maskPhone, normalizePhone } from "../src/lib/gyasoft/phone.ts";
import {
  buildTemplatePayload,
  validateSendTemplateRequest,
} from "../src/lib/gyasoft/validation.ts";

const validBody = {
  tipo: "aviso_de_deuda",
  telefono: "70000000",
  datos: {
    nombre: "Lourdes Yucra Zarate",
    servicio: "Cumbre Fibra óptica 15 megas, 120 Bs",
    codigo: "11218",
  },
  id_operacion: "deuda-11218-2026-08",
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
      datos: { nombre: "Ana" },
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes("datos.servicio")));
    assert.ok(result.errors.some((e) => e.includes("datos.codigo")));
  });

  it("convierte números a string", () => {
    const result = validateSendTemplateRequest({
      ...validBody,
      datos: { ...validBody.datos, codigo: 11218 },
    });
    assert.equal(result.ok, true);
    assert.equal(result.value.datos.codigo, "11218");
  });

  it("rechaza saltos de línea, retorno de carro y tabulaciones", () => {
    for (const [caracter, etiqueta] of [
      ["\n", "\\n"],
      ["\r", "\\r"],
      ["\t", "\\t"],
    ]) {
      const result = validateSendTemplateRequest({
        ...validBody,
        datos: { ...validBody.datos, nombre: `Ana${caracter}Maria` },
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
      datos: { ...validBody.datos, servicio: "Fibra 15 megas\n" },
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
        nombre: "Ana",
        detalle: "Pago mensual",
        servicio: "Fibra 15 megas",
        descuento: "0 Bs",
        comprobante: "F-0001",
      },
      id_operacion: "pago-1",
    });
    assert.equal(result.ok, true);
    assert.equal(result.value.template.name, "cumbre_pago_realizado");
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
              { type: "text", text: "Lourdes Yucra Zarate" },
              { type: "text", text: "Cumbre Fibra óptica 15 megas, 120 Bs" },
              { type: "text", text: "11218" },
            ],
          },
        ],
      },
    });
  });
});
