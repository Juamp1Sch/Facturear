import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildVatLinesFromRates,
  classifyVatRate,
  groupVatLinesByRate,
  sumVatFromRates,
} from "@/lib/vat-rate";

describe("buildVatLinesFromRates", () => {
  it("arma renglones I21 e I10,5", () => {
    const lines = buildVatLinesFromRates(2100, 105);
    assert.ok(lines);
    assert.equal(lines.length, 2);
    assert.equal(lines[0]!.label, "IVA 21%");
    assert.equal(lines[1]!.label, "IVA 10,5%");
  });

  it("sumVatFromRates coincide con la suma de renglones", () => {
    const total = sumVatFromRates(2100, 105);
    assert.equal(total, 2205);
  });
});

describe("classifyVatRate", () => {
  it("detecta IVA 10,5% en el label", () => {
    const c = classifyVatRate("IVA 10,5%");
    assert.equal(c.ivaCode, "I10");
  });

  it("usa I21 por defecto", () => {
    const c = classifyVatRate("Impuesto");
    assert.equal(c.ivaCode, "I21");
  });
});

describe("groupVatLinesByRate", () => {
  it("agrupa varias líneas de la misma alícuota", () => {
    const groups = groupVatLinesByRate([
      { label: "IVA 21%", amount: 100 },
      { label: "IVA 21%", amount: 50 },
    ]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0]!.vatAmount, 150);
  });
});
