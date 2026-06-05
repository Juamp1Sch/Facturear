/**
 * Casos de regresión para clasificación documental (anti falsos positivos).
 * Ejecutar: npx tsx scripts/classification-harness.ts
 */
import { resolveDocumentClassification } from "../src/lib/document-class";
import type { InvoiceExtraction } from "../src/lib/schemas";

function base(): InvoiceExtraction {
  return {
    provider: "NIGUT",
    cuit: "30-71604273-8",
    invoice_date: "2026-05-18",
    invoice_number: "00000-00011125",
    invoice_type: null,
    document_title: null,
    afip_comprobante_code: null,
    fiscal_auth_type: null,
    fiscal_auth_code: null,
    document_kind: null,
    net_amount: 626150.25,
    vat_amount: 0,
    perceptions_amount: 0,
    total_amount: 626150.25,
    vat_lines: null,
    perception_lines: null,
    chart_account_code: null,
    confidence: 0.9,
  };
}

type Case = {
  name: string;
  patch: Partial<InvoiceExtraction>;
  ocr?: string | null;
  expect: { kind: string; class: string | null };
};

const cases: Case[] = [
  {
    name: "parte diario + ticket bare (visión)",
    patch: {
      document_title: "PARTE DIARIO",
      fiscal_auth_type: "TICKET_FISCAL",
      document_kind: "FACTURA",
    },
    ocr: "[Campos inferidos por visión.]",
    expect: { kind: "PRESUPUESTO", class: null },
  },
  {
    name: "parte diario + afip 111 sin título",
    patch: {
      afip_comprobante_code: "111",
      fiscal_auth_type: "TICKET_FISCAL",
    },
    ocr: "[Campos inferidos por visión.]",
    expect: { kind: "FACTURA", class: "TICKET_FISCAL" },
  },
  {
    name: "NIGUT cotización: letra A + CAI sin número",
    patch: {
      invoice_type: "A",
      fiscal_auth_type: "CAI",
      fiscal_auth_code: null,
      document_kind: "REMITO",
    },
    ocr: "[Campos inferidos por visión.]",
    expect: { kind: "PRESUPUESTO", class: null },
  },
  {
    name: "factura con CAE válido",
    patch: {
      document_title: "FACTURA A",
      fiscal_auth_type: "CAE",
      fiscal_auth_code: "52076217180318",
      afip_comprobante_code: "001",
      document_kind: "FACTURA",
    },
    ocr: "FACTURA A CAE N 52076217180318",
    expect: { kind: "FACTURA", class: "FACTURA_FISCAL" },
  },
  {
    name: "remito fiscal código 091",
    patch: {
      afip_comprobante_code: "091",
      document_kind: "REMITO",
      invoice_type: "R",
    },
    ocr: null,
    expect: { kind: "REMITO", class: "REMITO_FISCAL" },
  },
  {
    name: "ticket con keyword en OCR",
    patch: {
      fiscal_auth_type: "TICKET_FISCAL",
    },
    ocr: "Controlador Fiscal C.F. total",
    expect: { kind: "FACTURA", class: "TICKET_FISCAL" },
  },
  {
    name: "presupuesto explícito IA",
    patch: {
      document_title: "PRESUPUESTO",
      document_kind: "PRESUPUESTO",
    },
    ocr: null,
    expect: { kind: "PRESUPUESTO", class: null },
  },
  {
    name: "letra R sin señal fiscal pero título parte diario",
    patch: {
      document_title: "PARTE DIARIO",
      invoice_type: "R",
    },
    ocr: null,
    expect: { kind: "PRESUPUESTO", class: null },
  },
];

let failed = 0;
for (const c of cases) {
  const extracted = { ...base(), ...c.patch };
  const r = resolveDocumentClassification(extracted, c.ocr ?? null);
  const ok =
    r.documentKind === c.expect.kind &&
    r.documentClass === c.expect.class;
  if (!ok) {
    failed++;
    console.error(
      `FAIL ${c.name}: got kind=${r.documentKind} class=${r.documentClass}, expected kind=${c.expect.kind} class=${c.expect.class}`,
    );
  } else {
    console.log(`OK   ${c.name}`);
  }
}

if (failed > 0) {
  console.error(`\n${failed} caso(s) fallaron.`);
  process.exit(1);
}
console.log("\nTodos los casos pasaron.");
