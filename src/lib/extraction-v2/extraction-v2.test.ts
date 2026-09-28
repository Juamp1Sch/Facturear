import assert from "node:assert/strict";
import { test } from "node:test";

import {
  arcaBarcodeCheckDigit,
  documentKindForComprobanteCode,
  letterForComprobanteCode,
  parseArcaItfText,
  parseArcaQrText,
} from "./arca-codes";
import { matchCuitAgainstMaestro, supplierNameSimilarity } from "./maestro-cuit";
import { amountsAsRead } from "./amounts-as-read";
import { readExtractionReview } from "./review";
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

const withCheckDigit = (body: string) => body + String(arcaBarcodeCheckDigit(body));

test("código de barras ITF: CUIT y CAE, exige el dígito verificador de ARCA", () => {
  const body = "30000000007" + "011" + "0004" + "66213396734316" + "20160531";
  const r = parseArcaItfText(withCheckDigit(body));
  assert.equal(r?.cuit, "30-00000000-7");
  assert.equal(r?.authCode, "66213396734316");
  assert.equal(parseArcaItfText("123"), null);
  const wrongDv = (arcaBarcodeCheckDigit(body) + 1) % 10;
  assert.equal(parseArcaItfText(body + String(wrongDv)), null, "dígito verificador incorrecto");
});

test("dígito verificador RG 1702 sobre códigos reales", () => {
  assert.equal(arcaBarcodeCheckDigit("307070730511500046621339673431620160531"), 1);
  assert.equal(arcaBarcodeCheckDigit("307104369710100058618440721236520260516"), 4);
});

test("QR: host que no es de ARCA, % malformado o JSON null → null sin tirar", () => {
  const payload = Buffer.from(JSON.stringify({ cuit: 30000000007, codAut: 1 })).toString("base64");
  assert.equal(parseArcaQrText(`https://evil.example.com/fe/qr/?p=${payload}`), null);
  assert.ok(parseArcaQrText(`https://serviciosweb.afip.gob.ar/fe/qr/?p=${payload}`));
  assert.equal(parseArcaQrText("https://www.afip.gob.ar/fe/qr/?p=%E0%A4%A"), null);
  assert.equal(parseArcaQrText(`https://www.afip.gob.ar/fe/qr/?p=${Buffer.from("null").toString("base64")}`), null);
  assert.equal(documentKindForComprobanteCode(3), "NOTA_CREDITO");
  assert.equal(documentKindForComprobanteCode(7), "NOTA_DEBITO");
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
  // Con QR, el motivo aclara que el total es el exacto del QR y lo que no cierra es el desglose.
  const withQr = validateExtraction({ ...base, total_amount: 1600 }, { total: 1600 }, now);
  assert.equal(withQr[0]?.field, "amounts");
  assert.match(withQr[0]!.reason, /QR de ARCA/);
  // Otros tributos (impuestos internos) suman al total: no se marca.
  assert.deepEqual(
    validateExtraction({ ...base, total_amount: 1646.72, other_taxes_amount: 100 } as InvoiceExtraction, null, now),
    [],
  );
});

test("applyFiscalData: el ITF solo verifica CUIT y CAE; el QR verifica todo lo que trae", async () => {
  const { applyFiscalData } = await import("./arca-codes");
  const itf = applyFiscalData(base, { source: "ITF", cuit: "30-00000000-7", authType: "CAE", authCode: "66213396734316" });
  assert.deepEqual(itf.verifiedFields, ["cuit", "fiscal_auth"]);
  assert.equal(itf.extracted.invoice_date, base.invoice_date);
  assert.equal(itf.extracted.total_amount, base.total_amount);
  const qr = applyFiscalData(base, {
    source: "QR", cuit: "30-00000000-7", date: "2020-10-13", pointOfSale: 10, number: 94, comprobanteCode: 1,
    total: 12100, currency: "PES", exchangeRate: 1, authType: "CAE", authCode: "70417054367476",
  });
  assert.deepEqual(qr.verifiedFields, ["cuit", "fiscal_auth", "invoice_date", "invoice_number", "invoice_type", "total"]);
  assert.equal(qr.extracted.invoice_number, "00010-00000094");
  assert.equal(qr.extracted.total_amount, 12100);
});

test("maestro: CUIT leído válido y a distancia >= 2 solo se corrige con nombre exacto", () => {
  // 30-71178446-9 válido del maestro vs. otro CUIT válido a 2 dígitos: nombre parecido no alcanza.
  assert.equal(matchCuitAgainstMaestro(maestro, "30-71178466-3", "CORESA ELECTRICIDAD").status, "unknown");
});

test("readExtractionReview: tolera datos persistidos corruptos", () => {
  assert.equal(readExtractionReview(null), null);
  assert.equal(readExtractionReview({ review: "x" }), null);
  assert.equal(readExtractionReview({ review: { version: 1, fields: {} } }), null);
  const r = readExtractionReview({ review: { version: 2, fields: { cuit: "motivo" }, verifiedBy: "QR", verifiedFields: ["cuit", "hack", "total"] } });
  assert.deepEqual(r?.verifiedFields, ["cuit", "total"]);
  assert.equal(r?.verifiedBy, "QR");
});

test("readExtractionReview: descarta motivos que no son texto y correcciones mal formadas", () => {
  const r = readExtractionReview({
    review: { version: 2, fields: { cuit: { x: 1 }, amounts: "ok", foo: "bar" }, cuitCorrection: { to: 5 } },
  });
  assert.deepEqual(r?.fields, { amounts: "ok" });
  assert.equal(r?.cuitCorrection, undefined);
});

test("match de proveedor: con CUIT verificado gana el CUIT sobre el nombre", async () => {
  const { matchSupplierFromList } = await import("../supplier-match");
  const suppliers = [
    { code: "1", name: "CORESA GROUP SRL", cuit: "30-71178446-9" },
    { code: "2", name: "CORESA", cuit: "30-99999999-7" },
  ];
  // Sin verificar: el nombre (prefijo) manda, comportamiento histórico.
  assert.equal(matchSupplierFromList(suppliers, "CORESA S.A.", "30-71178446-9")?.code, "2");
  // Verificado (QR): manda el CUIT exacto.
  assert.equal(matchSupplierFromList(suppliers, "CORESA S.A.", "30-71178446-9", { cuitIsVerified: true })?.code, "1");
  // Verificado y sin match por CUIT: no se toma un proveedor por nombre con OTRO CUIT.
  assert.equal(matchSupplierFromList(suppliers, "CORESA S.A.", "30-00000000-7", { cuitIsVerified: true }), null);
});

test("QR: importe no finito se descarta", () => {
  const r = parseArcaQrText(qrUrl({ cuit: 30000000007, codAut: 70417054367476, importe: "1e999", ptoVta: true }));
  assert.equal(r?.total, undefined);
  assert.equal(r?.pointOfSale, undefined);
});

test("maestro: un nombre genérico de una palabra no iguala a uno más específico", () => {
  assert.equal(supplierNameSimilarity("ELECTRICIDAD SRL", "ELECTRICIDAD NORTE SA"), 0.5);
  assert.equal(supplierNameSimilarity("JELUZ S.A.C.I.F.I. Y A.", "JELUZ S A C I F I Y A"), 1);
});

test("QR vs lo impreso: marca CUIT muy distinto y total impreso que cierra pero difiere", async () => {
  const { compareQrWithPrintedReading } = await import("./pipeline");
  const qr = { source: "QR" as const, cuit: "30-71178446-9", total: 1546.72, authType: "CAE" as const, authCode: "86041474598043" };
  assert.deepEqual(compareQrWithPrintedReading(base, qr), []);
  assert.deepEqual(compareQrWithPrintedReading({ ...base, cuit: "30-71784460-9" }, qr), []); // error de OCR (<= 2)
  assert.deepEqual(compareQrWithPrintedReading({ ...base, cuit: "30-50289158-4" }, qr).map((i) => i.field), ["cuit"]);
  const otherTotal = { ...qr, total: 2000 };
  assert.deepEqual(compareQrWithPrintedReading(base, otherTotal).map((i) => i.field), ["amounts"]);
});

test("amountsAsRead: no inventa percepciones para cerrar contra el total", () => {
  // Total del QR 2000 con desglose leído que suma 1546,72: se guarda tal cual y queda sin cerrar.
  const r = amountsAsRead({ ...base, total_amount: 2000 });
  assert.equal(r.perceptionsAmount, base.perceptions_amount);
  assert.equal(r.totalAmount, 2000);
  assert.equal(r.amountsReconciled, false);
  assert.equal(r.amountsAlgebraicallyDerived, false);
  // Otros tributos: la reconciliación informativa se calcula sin ellos.
  const withOther = amountsAsRead({ ...base, total_amount: 1646.72, other_taxes_amount: 100 } as InvoiceExtraction);
  assert.equal(withOther.amountsReconciled, true);
});

// ---- extractInvoiceV2 de punta a punta, con modelo y lector de códigos simulados ----
async function tinyPage(): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  return sharp({ create: { width: 400, height: 560, channels: 3, background: "#ffffff" } }).jpeg().toBuffer();
}
const noMaestro = { maestroCuitHintsBlock: null, chartAccountHintsBlock: null, maestro: [] };
type ExtractArgs = { content: unknown[]; followUp?: string };

test("pipeline: QR que no coincide con lo impreso queda marcado y no se afirma como verificado", async () => {
  const { extractInvoiceV2 } = await import("./pipeline");
  const calls: ExtractArgs[] = [];
  const qr = { source: "QR" as const, cuit: "30-50289158-4", total: 2000, pointOfSale: 6, number: 128741, comprobanteCode: 1, authType: "CAE" as const, authCode: "86041474598043" };
  const r = await extractInvoiceV2([{ buffer: await tinyPage(), mimeType: "image/jpeg" }], noMaestro, {
    decode: async () => qr,
    extract: async (args) => {
      calls.push(args as ExtractArgs);
      return base; // lectura impresa: CUIT 30-71178446-9, total 1546,72 que cierra con su desglose
    },
  });
  assert.equal(JSON.stringify(calls[0]!.content).includes("decodificad"), false, "lectura ciega");
  assert.equal(r.extracted.total_amount, 2000, "el QR se aplica igual");
  assert.ok(r.review.fields.cuit, "CUIT marcado");
  assert.ok(r.review.fields.amounts, "importes marcados");
  assert.equal(r.review.verifiedFields?.includes("cuit"), false);
  assert.equal(r.review.verifiedFields?.includes("total"), false);
  assert.ok(r.review.verifiedFields?.includes("invoice_number"));
});

test("pipeline: una validación que falla dispara UNA 2da pasada con el motivo", async () => {
  const { extractInvoiceV2 } = await import("./pipeline");
  const calls: ExtractArgs[] = [];
  const r = await extractInvoiceV2([{ buffer: await tinyPage(), mimeType: "image/jpeg" }], noMaestro, {
    decode: async () => null,
    extract: async (args) => {
      calls.push(args as ExtractArgs);
      return calls.length === 1 ? { ...base, cuit: "30-71178446-8" } : base;
    },
  });
  assert.equal(calls.length, 2);
  assert.match(calls[1]!.followUp ?? "", /dígito verificador/);
  assert.equal(r.extracted.cuit, "30-71178446-9");
  assert.equal(r.review.fields.cuit, undefined);
});

test("pipeline: un ITF cuyo CUIT no es el del emisor impreso se descarta", async () => {
  const { extractInvoiceV2 } = await import("./pipeline");
  const itf = { source: "ITF" as const, cuit: "30-50289158-4", authType: "CAE" as const, authCode: "11111111111111" };
  const r = await extractInvoiceV2([{ buffer: await tinyPage(), mimeType: "image/jpeg" }], noMaestro, {
    decode: async () => itf,
    extract: async () => base,
  });
  assert.equal(r.review.verifiedBy, null);
  assert.equal(r.extracted.fiscal_auth_code, base.fiscal_auth_code);
});
