import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  computeSequentialDiscountLines,
  enrichExtractedDiscounts,
} from "@/lib/discount-breakdown";

describe("computeSequentialDiscountLines", () => {
  it("calcula bonificaciones Jeluz secuenciales desde neto y porcentajes", () => {
    const netAmount = 8_442_013.36;
    const steps = [
      { label: "Bonificación 20%", percentage: 20 },
      { label: "Bonificación 16%", percentage: 16 },
      { label: "Bonificación 19%", percentage: 19 },
      { label: "Bonificación 19% (2)", percentage: 19 },
      { label: "Bonificación 15%", percentage: 15 },
      { label: "Bonificación 15% (2)", percentage: 15 },
      { label: "Bonificación 10%", percentage: 10 },
    ];

    const lines = computeSequentialDiscountLines(netAmount, steps);
    assert.ok(lines);
    assert.equal(lines.length, 7);

    const total = lines.reduce((acc, line) => acc + line.amount, 0);
    assert.ok(Math.abs(total - 21_003_990.44) <= 0.05);
    assert.equal(lines[0]!.amount, 5_889_200.76);
    assert.ok(Math.abs(lines[6]!.amount - 938_001.49) <= 0.02);
  });

  it("devuelve null con porcentaje inválido (100%)", () => {
    const lines = computeSequentialDiscountLines(1000, [
      { label: "Bonificación 100%", percentage: 100 },
    ]);
    assert.equal(lines, null);
  });
});

describe("enrichExtractedDiscounts", () => {
  it("prefiere computed cuando hay neto y porcentajes del supplement", () => {
    const { extracted, debug } = enrichExtractedDiscounts(
      {
        provider: null,
        cuit: null,
        invoice_date: null,
        invoice_number: null,
        invoice_type: null,
        afip_comprobante_code: null,
        fiscal_auth_type: null,
        fiscal_auth_code: null,
        document_title: null,
        document_kind: null,
        net_amount: 8442013.36,
        vat_amount: null,
        vat_lines: null,
        perceptions_amount: null,
        perception_lines: null,
        discount_lines: [{ label: "Bonificación", amount: 999 }],
        discount_amount: 999,
        total_amount: null,
        chart_account_code: null,
        confidence: 0.9,
      },
      {
        supplement: {
          discount_lines: [
            { label: "Bonificación 20%", percentage: 20 },
            { label: "Bonificación 16%", percentage: 16 },
          ],
        },
      },
    );

    assert.equal(debug?.chosenSource, "computed");
    assert.ok(extracted.discount_amount != null && extracted.discount_amount > 999);
  });

  it("descarta bonificación falsa cuando Bon 50% por ítem coincide con el neto", () => {
    const base = {
      provider: "CORESA GROUP S.R.L.",
      cuit: null,
      invoice_date: "2026-01-26",
      invoice_number: "00006-00128741",
      invoice_type: "A",
      afip_comprobante_code: "01",
      fiscal_auth_type: "CAE" as const,
      fiscal_auth_code: "84043474598043",
      document_title: "FACTURA A",
      document_kind: "FACTURA" as const,
      net_amount: 1227.55,
      vat_amount: 257.79,
      vat_lines: [{ label: "IVA 21%", amount: 257.79 }],
      perceptions_amount: 61.38,
      perception_lines: null,
      discount_lines: [{ label: "Bonificación", amount: 1227.55 }],
      discount_amount: 1227.55,
      total_amount: 1546.72,
      chart_account_code: null,
      confidence: 0.9,
    };

    const { extracted, debug } = enrichExtractedDiscounts(base, {
      supplement: {
        discount_lines: [{ label: "Bonificación", percentage: 50 }],
      },
    });

    assert.equal(extracted.discount_lines, null);
    assert.equal(extracted.discount_amount, null);
    assert.equal(debug, null);
  });

  it("descarta descuentos del detalle cuando el subtotal ya cierra con el total (LIPO)", () => {
    const { extracted, debug } = enrichExtractedDiscounts({
      provider: "PRODUCTOS LIPO S.A.",
      cuit: null,
      invoice_date: "2026-04-18",
      invoice_number: "0018-00022816",
      invoice_type: "A",
      afip_comprobante_code: null,
      fiscal_auth_type: null,
      fiscal_auth_code: null,
      document_title: null,
      document_kind: "FACTURA" as const,
      net_amount: 1_325_690.59,
      vat_amount: 278_395.02,
      vat_lines: [{ label: "IVA 21%", amount: 278_395.02 }],
      perceptions_amount: 33_142.26,
      perception_lines: null,
      discount_lines: [
        { label: "DESCUENTO ESPECIAL 8 %", amount: 122_518.27 },
        { label: "DESCUENTO 3 %", amount: 42_268.8 },
      ],
      discount_amount: 115_277.44,
      total_amount: 1_637_227.87,
      chart_account_code: null,
      confidence: 0.9,
    });

    assert.equal(extracted.discount_lines, null);
    assert.equal(extracted.discount_amount, null);
    assert.equal(debug, null);
  });

  it("mantiene bonificaciones Jeluz aunque neto+IVA+percepciones cierre con total", () => {
    const steps = [
      { label: "BONIFICACION GENERAL 20%", percentage: 20 },
      { label: "BONIFICACION ESPECIAL 16%", percentage: 16 },
    ];
    const computed = computeSequentialDiscountLines(8_442_013.36, steps);
    assert.ok(computed);

    const { extracted } = enrichExtractedDiscounts(
      {
        provider: null,
        cuit: null,
        invoice_date: null,
        invoice_number: null,
        invoice_type: null,
        afip_comprobante_code: null,
        fiscal_auth_type: null,
        fiscal_auth_code: null,
        document_title: null,
        document_kind: null,
        net_amount: 8_442_013.36,
        vat_amount: 1_772_822.81,
        vat_lines: null,
        perceptions_amount: 179_881.6,
        perception_lines: null,
        discount_lines: null,
        discount_amount: null,
        total_amount: 10_394_717.77,
        chart_account_code: null,
        confidence: 0.9,
      },
      {
        supplement: {
          discount_lines: steps.map((s) => ({
            label: s.label,
            percentage: s.percentage,
          })),
        },
      },
    );

    assert.ok(extracted.discount_amount != null && extracted.discount_amount > 0);
    assert.ok(
      extracted.discount_lines?.some((l) =>
        /bonificaci[oó]n\s+general/i.test(l.label),
      ),
    );
  });
});
