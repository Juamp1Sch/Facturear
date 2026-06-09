import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isUsdTipoMoneda,
  parseTipoMonedaForStorage,
  tipoMonedaToCurrencyValue,
} from "@/lib/tipo-moneda";

describe("tipo-moneda", () => {
  it("isUsdTipoMoneda acepta variantes de casing y espacios", () => {
    assert.equal(isUsdTipoMoneda("usd"), true);
    assert.equal(isUsdTipoMoneda(" USD "), true);
    assert.equal(isUsdTipoMoneda(null), false);
    assert.equal(isUsdTipoMoneda("ars"), false);
  });

  it("parseTipoMonedaForStorage normaliza a null o usd", () => {
    assert.equal(parseTipoMonedaForStorage("USD"), "usd");
    assert.equal(parseTipoMonedaForStorage("ars"), null);
    assert.equal(parseTipoMonedaForStorage(""), null);
    assert.equal(parseTipoMonedaForStorage(null), null);
  });

  it("tipoMonedaToCurrencyValue mapea al toggle UI", () => {
    assert.equal(tipoMonedaToCurrencyValue("usd"), "usd");
    assert.equal(tipoMonedaToCurrencyValue(null), "ars");
    assert.equal(tipoMonedaToCurrencyValue("ARS"), "ars");
  });
});
