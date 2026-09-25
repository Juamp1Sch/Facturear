import assert from "node:assert/strict";
import { test } from "node:test";

import { letterForComprobanteCode, parseArcaItfText, parseArcaQrText } from "./arca-codes";
import { matchCuitAgainstMaestro, supplierNameSimilarity } from "./maestro-cuit";
import { validateExtraction } from "./validate";
import type { InvoiceExtraction } from "../schemas";

const qrUrl = (payload: object) =>
  `https://www.afip.gob.ar/fe/qr/?p=${Buffer.from(JSON.stringify(payload)).toString("base64")}`;

test("QR de ARCA: decodifica CUIT, número, total, moneda y CAE", () => {
  const r = parseArcaQrText(
    qrUrl({ ver: 1, fecha: "2020-10-13", cuit: 30000000007, ptoVta: 10, tipoCmp: 1, nroCmp: 94, importe: 12100, moneda: "DOL", ctz: 65, tipoDocRec: 80, nroDocRec: 20000000001, tipoCodAut: "E", codAut: 70417054367476 }),
  );
  assert.ok(r);
  assert.equal(r.cuit, "30-00000000-7");
  assert.equal(r.date, "2020-10-13");
  assert.equal(r.pointOfSale, 10);
  assert.equal(r.number, 94);
  assert.equal(r.total, 12100);
  assert.equal(r.currency, "DOL");
  assert.equal(r.exchangeRate, 65);
  assert.equal(r.authType, "CAE");
  assert.equal(r.authCode, "70417054367476");
  assert.equal(letterForComprobanteCode(r.comprobanteCode), "A");
});

test("QR de ARCA: acepta fecha DD/MM/AAAA, CAEA y base64 sin padding", () => {
  const b64 = Buffer.from(JSON.stringify({ fecha: "06/05/2026", cuit: 30000000007, ptoVta: 5, tipoCmp: 6, nroCmp: 1, importe: 1, tipoCodAut: "A", codAut: "12345678901234" }))
    .toString("base64")
    .replace(/=+$/, "");
  const r = parseArcaQrText(`https://www.afip.gob.ar/fe/qr/?p=${b64}`);
  assert.equal(r?.date, "2026-05-06");
  assert.equal(r?.authType, "CAEA");
  assert.equal(letterForComprobanteCode(r?.comprobanteCode), "B");
});

test("QR que no es de ARCA o CUIT inválido → null", () => {
  assert.equal(parseArcaQrText('{"Tipo":"RAR","Numero":1}'), null);
  assert.equal(parseArcaQrText(qrUrl({ cuit: 30000000008, codAut: 1 })), null);
});

test("código de barras ITF: CUIT y CAE", () => {
  const r = parseArcaItfText("30000000007" + "011" + "0004" + "66213396734316" + "20160531" + "1");
  assert.equal(r?.cuit, "30-00000000-7");
  assert.equal(r?.authCode, "66213396734316");
  assert.equal(parseArcaItfText("123"), null);
});

const maestro = [
  { cuit: "30-71178446-9", name: "CORESA GROUP S.R.L." },
  { cuit: "30-56028234-2", name: "JELUZ S A C I F I Y A" },
  { cuit: "20-12345678-9", name: "Otro proveedor" },
];

test("maestro: corrige dígitos mal leídos si coincide el nombre", () => {
  const r = matchCuitAgainstMaestro(maestro, "30-71784460-9", "CORESA GROUP S.R.L.");
  assert.deepEqual(r.status === "corrected" && r.cuit, "30-71178446-9");
  const j = matchCuitAgainstMaestro(maestro, "30-68028234-6", "JELUZ S.A.C.I.F.I. Y A.");
  assert.equal(j.status === "corrected" && j.cuit, "30-56028234-2");
});

test("maestro: CUIT ya cargado → known; sin coincidencia de nombre o vacío → no corrige", () => {
  assert.equal(matchCuitAgainstMaestro(maestro, "30-71178446-9", "CORESA").status, "known");
  assert.equal(matchCuitAgainstMaestro(maestro, "20-12345678-3", "Nombre de Fantasía").status, "unknown");
  assert.equal(matchCuitAgainstMaestro(maestro, null, "CORESA GROUP").status, "unknown");
  assert.ok(supplierNameSimilarity("Industrias SICA S.A.I.C.", "INDUSTRIAS SICA SAIC") >= 0.99);
});

const base: InvoiceExtraction = {
  provider: "X", cuit: "30-71178446-9", invoice_date: "2026-01-26", invoice_number: "00006-00128741",
  invoice_type: "A", afip_comprobante_code: "01", fiscal_auth_type: "CAE", fiscal_auth_code: "86041474598043",
  document_title: null, document_kind: "FACTURA", net_amount: 1227.55, vat_amount: 257.79, vat_lines: null,
  perceptions_amount: 61.38, perception_lines: null, discount_amount: null, discount_lines: null,
  total_amount: 1546.72, chart_account_code: null, exchange_rate: null, confidence: 0.9,
};
const now = new Date("2026-02-01T12:00:00Z");

test("validación: extracción consistente no marca nada", () => {
  assert.deepEqual(validateExtraction(base, null, now), []);
});

test("validación: CUIT, suma, CAE, fecha y total del QR", () => {
  const fields = (e: Partial<InvoiceExtraction>, fiscal = null as Parameters<typeof validateExtraction>[1]) =>
    validateExtraction({ ...base, ...e }, fiscal, now).map((i) => i.field);
  assert.deepEqual(fields({ cuit: "30-71178446-8" }), ["cuit"]);
  assert.deepEqual(fields({ total_amount: 1544.72 }), ["amounts"]);
  assert.deepEqual(fields({ fiscal_auth_code: "8604147459804" }), ["fiscal_auth"]);
  assert.deepEqual(fields({ invoice_date: "2026-09-18" }), ["invoice_date"]);
  assert.deepEqual(
    fields({}, { source: "QR", cuit: "30-71178446-9", total: 1600, authType: "CAE", authCode: "86041474598043" }),
    ["amounts"],
  );
});
