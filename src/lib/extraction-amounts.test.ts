import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { reconcileVatLines } from "@/lib/extraction-amounts";

/** Factura CORESA: split [1146,59 ; 503,73] mal leído; IVA real 1197,32; neto 5943,12. */
const CORESA_NET = 5_943.12;
const CORESA_VAT_OK = 1_197.32;

describe("reconcileVatLines (repara el desglose IVA mostrado)", () => {
  it("recomputa el split 21% / 10,5% desde neto + IVA resuelto (CORESA)", () => {
    const repaired = reconcileVatLines(
      [
        { label: "IVA 21%", amount: 1_146.59 },
        { label: "IVA 10,5%", amount: 503.73 },
      ],
      CORESA_VAT_OK,
      CORESA_NET,
    );
    assert.ok(repaired);
    assert.equal(repaired.length, 2);
    assert.equal(repaired[0]!.label, "IVA 21%");
    assert.ok(Math.abs(repaired[0]!.amount - 1_146.59) <= 0.02);
    assert.equal(repaired[1]!.label, "IVA 10,5%");
    assert.ok(Math.abs(repaired[1]!.amount - 50.73) <= 0.02);
    const sum = repaired.reduce((a, l) => a + l.amount, 0);
    assert.ok(Math.abs(sum - CORESA_VAT_OK) <= 0.01);
  });

  it("deja las líneas intactas cuando ya suman el IVA resuelto", () => {
    const lines = [
      { label: "IVA 21%", amount: 1_146.59 },
      { label: "IVA 10,5%", amount: 50.73 },
    ];
    const repaired = reconcileVatLines(lines, CORESA_VAT_OK, CORESA_NET);
    assert.deepEqual(repaired, lines);
  });

  it("ajusta una única línea de IVA al valor resuelto", () => {
    const repaired = reconcileVatLines(
      [{ label: "IVA 21%", amount: 999.99 }],
      CORESA_VAT_OK,
      CORESA_NET,
    );
    assert.ok(repaired);
    assert.equal(repaired.length, 1);
    assert.ok(Math.abs(repaired[0]!.amount - CORESA_VAT_OK) <= 0.01);
  });

  it("colapsa a un único renglón IVA si no puede repartir con confianza", () => {
    // 3 líneas: no hay regla de 2 alícuotas → un solo renglón con el IVA correcto.
    const repaired = reconcileVatLines(
      [
        { label: "IVA 21%", amount: 1_146.59 },
        { label: "IVA 10,5%", amount: 503.73 },
        { label: "IVA 27%", amount: 10 },
      ],
      CORESA_VAT_OK,
      CORESA_NET,
    );
    assert.ok(repaired);
    assert.equal(repaired.length, 1);
    assert.equal(repaired[0]!.label, "IVA");
    assert.ok(Math.abs(repaired[0]!.amount - CORESA_VAT_OK) <= 0.01);
  });
});
