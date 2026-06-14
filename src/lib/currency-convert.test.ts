import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { convertAiPayloadToArs, scaleAmount } from "@/lib/currency-convert";

describe("scaleAmount", () => {
  it("multiplica por el tipo de cambio y redondea a 2 decimales", () => {
    assert.equal(scaleAmount(100, 1460), 146000);
    assert.equal(scaleAmount(53385.12, 1), 53385.12);
    assert.equal(scaleAmount(123.456, 1), 123.46);
    assert.equal(scaleAmount(1779504, 1460), 2598075840);
  });
});

describe("convertAiPayloadToArs", () => {
  it("escala importes escalares y .amount de las líneas, sin mutar el original", () => {
    const original = {
      net_amount: 1000,
      vat_amount: 210,
      perceptions_amount: 50,
      total_amount: 1260,
      discount_amount: 0,
      vat_lines: [{ label: "IVA 21%", amount: 210 }],
      perception_lines: [{ label: "Perc. IVA", amount: 50, kind: "IVA" }],
      discount_lines: null,
      provider: "ACME",
    };
    const out = convertAiPayloadToArs(original, 1460) as Record<string, unknown>;

    assert.equal(out.net_amount, 1460000);
    assert.equal(out.vat_amount, 306600);
    assert.equal(out.total_amount, 1839600);
    assert.deepEqual(out.vat_lines, [{ label: "IVA 21%", amount: 306600 }]);
    assert.deepEqual(out.perception_lines, [
      { label: "Perc. IVA", amount: 73000, kind: "IVA" },
    ]);
    // No muta el original ni pierde campos no-importe.
    assert.equal(original.net_amount, 1000);
    assert.equal(out.provider, "ACME");
  });

  it("tolera payloads nulos o sin importes", () => {
    assert.equal(convertAiPayloadToArs(null, 1460), null);
    assert.deepEqual(convertAiPayloadToArs({ foo: "bar" }, 1460), { foo: "bar" });
  });
});
