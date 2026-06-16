import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildInvoiceJson, PRESUPUESTO_TIPO_IMPUESTO } from "@/lib/invoice-json";

describe("buildInvoiceJson IVA", () => {
  it("usa vat_lines cuando están en el payload (prioridad sobre vatAmount)", () => {
    const json = buildInvoiceJson({
      movementId: null,
      empresa: "01",
      sucursal: "01",
      supplierCode: "P001",
      invoiceDate: "2026-01-15",
      invoiceType: "A",
      documentKind: "FACTURA",
      invoiceNumber: "0001-00000001",
      netAmount: "1000",
      vatAmount: "500",
      vatLines: [{ label: "IVA 21%", amount: 210 }],
      perceptionsAmount: null,
      perceptionLines: null,
      discountAmount: null,
      discountLines: null,
      totalAmount: "1210",
      chartAccount: { id: "1", code: "411", name: "Compras", type: null },
      vatChartAccountCode: "214",
      bonificacionAccountCode: null,
    });

    const ivaLine = json.contable.find((l) => l.tipoImpuesto === "I21");
    assert.ok(ivaLine);
    assert.equal(ivaLine.monto, 210);
  });

  it("presupuesto usa tipoImpuesto NGR en la línea principal", () => {
    const json = buildInvoiceJson({
      movementId: null,
      empresa: "01",
      sucursal: "01",
      supplierCode: "P001",
      invoiceDate: "2026-01-15",
      invoiceType: null,
      documentKind: "PRESUPUESTO",
      invoiceNumber: "12345",
      netAmount: "5000",
      vatAmount: null,
      vatLines: null,
      perceptionsAmount: null,
      perceptionLines: null,
      discountAmount: null,
      discountLines: null,
      totalAmount: "5000",
      chartAccount: { id: "1", code: "411", name: "Compras", type: null },
      vatChartAccountCode: "214",
      bonificacionAccountCode: null,
    });

    assert.equal(json.contable.length, 1);
    assert.equal(json.contable[0]!.tipoImpuesto, PRESUPUESTO_TIPO_IMPUESTO);
    assert.equal(json.contable[0]!.monto, 5000);
  });

  it("presupuesto no genera líneas de IVA aunque la IA las haya leído", () => {
    const json = buildInvoiceJson({
      movementId: null,
      empresa: "01",
      sucursal: "01",
      supplierCode: "P001",
      invoiceDate: "2026-01-15",
      invoiceType: null,
      documentKind: "PRESUPUESTO",
      invoiceNumber: "12345",
      netAmount: "1000",
      vatAmount: "210",
      vatLines: [{ label: "IVA 21%", amount: 210 }],
      perceptionsAmount: null,
      perceptionLines: null,
      discountAmount: null,
      discountLines: null,
      totalAmount: "1210",
      chartAccount: { id: "1", code: "411", name: "Compras", type: null },
      vatChartAccountCode: "214",
      bonificacionAccountCode: null,
    });

    assert.equal(json.contable.length, 1);
    assert.equal(json.contable[0]!.tipoImpuesto, PRESUPUESTO_TIPO_IMPUESTO);
    assert.equal(json.contable[0]!.monto, 1210);
  });

  it("no incluye tipoMoneda cuando la moneda es ARS o null", () => {
    const json = buildInvoiceJson({
      movementId: "M1",
      empresa: "01",
      sucursal: "01",
      supplierCode: "P001",
      invoiceDate: "2026-01-15",
      invoiceType: "A",
      documentKind: "FACTURA",
      invoiceNumber: "0001-00000001",
      netAmount: "1000",
      vatAmount: "210",
      vatLines: [{ label: "IVA 21%", amount: 210 }],
      perceptionsAmount: null,
      perceptionLines: null,
      discountAmount: null,
      discountLines: null,
      totalAmount: "1210",
      chartAccount: { id: "1", code: "411", name: "Compras", type: null },
      vatChartAccountCode: "214",
      bonificacionAccountCode: null,
      tipoMoneda: null,
    });

    assert.equal("tipoMoneda" in json, false);
  });

  it("incluye tipoMoneda usd cuando la moneda es USD", () => {
    const json = buildInvoiceJson({
      movementId: "M1",
      empresa: "01",
      sucursal: "01",
      supplierCode: "P001",
      invoiceDate: "2026-01-15",
      invoiceType: "A",
      documentKind: "FACTURA",
      invoiceNumber: "0001-00000001",
      netAmount: "1000",
      vatAmount: "210",
      vatLines: [{ label: "IVA 21%", amount: 210 }],
      perceptionsAmount: null,
      perceptionLines: null,
      discountAmount: null,
      discountLines: null,
      totalAmount: "1210",
      chartAccount: { id: "1", code: "411", name: "Compras", type: null },
      vatChartAccountCode: "214",
      bonificacionAccountCode: null,
      tipoMoneda: "usd",
    });

    assert.equal(json.tipoMoneda, "usd");
  });
});

const perceptionBase = {
  movementId: null,
  empresa: "01",
  sucursal: "01",
  supplierCode: "P001",
  invoiceDate: "2026-01-15",
  invoiceType: "A",
  documentKind: "FACTURA",
  invoiceNumber: "0001-00000001",
  netAmount: "1000",
  vatAmount: "210",
  vatLines: [{ label: "IVA 21%", amount: 210 }],
  perceptionsAmount: null as string | null,
  totalAmount: "1210",
  chartAccount: { id: "1", code: "411", name: "Compras", type: null },
  vatChartAccountCode: "214",
  perceptionIvaAccountCode: "8007",
  perceptionIibbAccountCode: "8013",
  bonificacionAccountCode: null as string | null,
};

describe("buildInvoiceJson percepciones (kind → PIV/PIB)", () => {
  it("kind IVA rutea a la cuenta de percepción IVA con tipoImpuesto PIV", () => {
    const json = buildInvoiceJson({
      ...perceptionBase,
      perceptionLines: [{ label: "Perc. IVA", amount: 50, kind: "IVA" }],
    });
    const line = json.contable.find((l) => l.tipoImpuesto === "PIV");
    assert.ok(line);
    assert.equal(line.cuenta, "8007");
    assert.equal(line.monto, 50);
  });

  it("kind IIBB rutea a la cuenta de percepción IIBB con tipoImpuesto PIB", () => {
    const json = buildInvoiceJson({
      ...perceptionBase,
      perceptionLines: [{ label: "Perc. IIBB CABA", amount: 30, kind: "IIBB" }],
    });
    const line = json.contable.find((l) => l.tipoImpuesto === "PIB");
    assert.ok(line);
    assert.equal(line.cuenta, "8013");
    assert.equal(line.monto, 30);
  });

  it("respeta el kind de la IA aunque el label sugiera otra cosa (Perc. IVA bajo título IIBB)", () => {
    const json = buildInvoiceJson({
      ...perceptionBase,
      perceptionLines: [
        { label: "PERCEPCIONES IIBB - Perc. IVA", amount: 40, kind: "IVA" },
      ],
    });
    const line = json.contable.find(
      (l) => l.tipoImpuesto === "PIV" || l.tipoImpuesto === "PIB",
    );
    assert.ok(line);
    assert.equal(line.tipoImpuesto, "PIV");
    assert.equal(line.cuenta, "8007");
  });

  it("kind null cae al fallback regex sobre el label", () => {
    const json = buildInvoiceJson({
      ...perceptionBase,
      perceptionLines: [{ label: "Percepción IVA", amount: 25, kind: null }],
    });
    const line = json.contable.find((l) => l.tipoImpuesto === "PIV");
    assert.ok(line);
    assert.equal(line.cuenta, "8007");
  });

  it("sin desglose y ambos slots configurados asigna el total a IIBB", () => {
    const json = buildInvoiceJson({
      ...perceptionBase,
      perceptionsAmount: "70",
      perceptionLines: null,
    });
    const line = json.contable.find((l) => l.tipoImpuesto === "PIB");
    assert.ok(line);
    assert.equal(line.cuenta, "8013");
    assert.equal(line.monto, 70);
    assert.equal(
      json.contable.some((l) => l.tipoImpuesto === "PIV"),
      false,
    );
  });

  it("con desglose, omite la percepción cuyo slot no está configurado (no manda cuenta null)", () => {
    const json = buildInvoiceJson({
      ...perceptionBase,
      perceptionIvaAccountCode: null,
      perceptionLines: [{ label: "Perc. IVA", amount: 50, kind: "IVA" }],
    });
    assert.equal(
      json.contable.some((l) => l.tipoImpuesto === "PIV"),
      false,
    );
    assert.equal(
      json.contable.some((l) => l.cuenta === null),
      false,
    );
  });

  it("sin desglose y solo slot IVA configurado usa la cuenta IVA (PIV)", () => {
    const json = buildInvoiceJson({
      ...perceptionBase,
      perceptionIibbAccountCode: null,
      perceptionsAmount: "70",
      perceptionLines: null,
    });
    const line = json.contable.find((l) => l.tipoImpuesto === "PIV");
    assert.ok(line);
    assert.equal(line.cuenta, "8007");
  });
});

describe("buildInvoiceJson ignorar bonificaciones", () => {
  it("ignoreBonificaciones=false genera la línea EXE de bonificación", () => {
    const json = buildInvoiceJson({
      ...perceptionBase,
      discountLines: [{ label: "BONIFICACION GENERAL", amount: 100 }],
      bonificacionAccountCode: "609",
      ignoreBonificaciones: false,
    });
    assert.ok(json.contable.some((l) => l.tipoImpuesto === "EXE" && l.cuenta === "609"));
  });

  it("ignoreBonificaciones=true no genera línea EXE aunque haya discount_lines", () => {
    const json = buildInvoiceJson({
      ...perceptionBase,
      discountLines: [{ label: "BONIFICACION GENERAL", amount: 100 }],
      bonificacionAccountCode: "609",
      ignoreBonificaciones: true,
    });
    assert.equal(
      json.contable.some((l) => l.tipoImpuesto === "EXE"),
      false,
    );
  });

  it("ignoreBonificaciones=true tampoco genera EXE en presupuestos", () => {
    const json = buildInvoiceJson({
      ...perceptionBase,
      documentKind: "PRESUPUESTO",
      discountLines: [{ label: "BONIFICACION GENERAL", amount: 100 }],
      bonificacionAccountCode: "609",
      ignoreBonificaciones: true,
    });
    assert.equal(
      json.contable.some((l) => l.tipoImpuesto === "EXE"),
      false,
    );
  });
});

const presupuestoJsonBase = {
  movementId: "mov-1",
  empresa: "01",
  sucursal: "01",
  supplierCode: "P001",
  invoiceDate: "2026-01-15",
  documentKind: "PRESUPUESTO",
  invoiceNumber: "12345",
  netAmount: "5000",
  vatAmount: null,
  vatLines: null,
  perceptionsAmount: null,
  perceptionLines: null,
  discountAmount: null,
  discountLines: null,
  totalAmount: "5000",
  chartAccount: { id: "1", code: "411", name: "Compras", type: null },
  vatChartAccountCode: null,
  bonificacionAccountCode: null,
} as const;

describe("buildInvoiceJson presupuesto + letra configurada", () => {
  it("letra X (no fiscal AFIP) deja codigoComprobante null en el JSON ERP", () => {
    const json = buildInvoiceJson({
      ...presupuestoJsonBase,
      invoiceType: "X",
    });
    assert.equal(json.codigoComprobante, null);
    assert.equal(json.contable[0]!.tipoImpuesto, PRESUPUESTO_TIPO_IMPUESTO);
  });

  it("letra A en presupuesto genera FA (misma regla que factura fiscal)", () => {
    const json = buildInvoiceJson({
      ...presupuestoJsonBase,
      invoiceType: "A",
    });
    assert.equal(json.codigoComprobante, "FA");
  });
});
