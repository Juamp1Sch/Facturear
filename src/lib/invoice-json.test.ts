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
      perceptionsAccounts: [],
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
      perceptionsAccounts: [],
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
      perceptionsAccounts: [],
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
      perceptionsAccounts: [],
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
      perceptionsAccounts: [],
      bonificacionAccountCode: null,
      tipoMoneda: "usd",
    });

    assert.equal(json.tipoMoneda, "usd");
  });
});
