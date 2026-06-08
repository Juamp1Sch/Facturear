import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildInvoiceJson } from "@/lib/invoice-json";

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
});
