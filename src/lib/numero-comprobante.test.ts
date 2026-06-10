import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  hasAfipPuntoDeVentaNumero,
  needsMissingPuntoDeVentaWarning,
  normalizeNumeroComprobanteFromAiOrNull,
} from "@/lib/numero-comprobante";

describe("hasAfipPuntoDeVentaNumero", () => {
  it("acepta formato PV-Nro con padding", () => {
    assert.equal(hasAfipPuntoDeVentaNumero("00004-00059991"), true);
    assert.equal(hasAfipPuntoDeVentaNumero("4-59991"), true);
    assert.equal(hasAfipPuntoDeVentaNumero("4 / 59991"), true);
  });

  it("rechaza null, vacío o un solo bloque sin separador", () => {
    assert.equal(hasAfipPuntoDeVentaNumero(null), false);
    assert.equal(hasAfipPuntoDeVentaNumero(""), false);
    assert.equal(hasAfipPuntoDeVentaNumero("00059991"), false);
    assert.equal(hasAfipPuntoDeVentaNumero("12345"), false);
  });
});

describe("needsMissingPuntoDeVentaWarning", () => {
  it("avisa cuando falta PV-Nro (factura o presupuesto)", () => {
    assert.equal(needsMissingPuntoDeVentaWarning(null), true);
    assert.equal(needsMissingPuntoDeVentaWarning("59991"), true);
    assert.equal(needsMissingPuntoDeVentaWarning("00004-00059991"), false);
  });
});

describe("normalizeNumeroComprobanteFromAiOrNull", () => {
  it("normaliza dos partes a 5-8 dígitos", () => {
    assert.equal(
      normalizeNumeroComprobanteFromAiOrNull("4-59991"),
      "00004-00059991",
    );
  });
});
