import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  pickBestReconcilingFields,
  reanchorWithTrustedNetVat,
  reconcileAmounts,
  tryFixVatOnly,
} from "@/lib/amount-reconcile";

/** Números reales factura Jeluz 00003-00075339 */
const JELUZ_VAT = 1_530_603.74;
const JELUZ_PERC = 422_100.67;
const JELUZ_NET = 8_442_013.36;
const JELUZ_TOTAL = 10_394_717.77;

describe("pickBestReconcilingFields", () => {
  it("elige neto y total correctos cuando hay dos candidatos leídos (Jeluz)", () => {
    const primary = {
      net: JELUZ_TOTAL,
      vat: JELUZ_VAT,
      perceptions: JELUZ_PERC,
      total: JELUZ_NET,
    };
    const supplement = {
      net: JELUZ_NET,
      vat: JELUZ_VAT,
      perceptions: JELUZ_PERC,
      total: JELUZ_TOTAL,
    };

    const picked = pickBestReconcilingFields(primary, supplement);
    assert.ok(picked);
    assert.ok(Math.abs(picked.net! - JELUZ_NET) <= 0.05);
    assert.equal(picked.total, JELUZ_TOTAL);
    assert.ok(reconcileAmounts(picked).reconciled);
  });

  it("prefiere el neto gravado menor cuando hay varias combinaciones que cierran", () => {
    const primary = {
      net: 10_394_717.77,
      vat: 1_530_603.74,
      perceptions: 422_100.67,
      total: 12_390_717.62,
    };
    const supplement = {
      net: 8_442_013.36,
      vat: 1_530_603.74,
      perceptions: 422_100.67,
      total: 10_394_717.77,
    };

    const picked = pickBestReconcilingFields(primary, supplement);
    assert.ok(picked);
    assert.ok(Math.abs(picked.net! - 8_442_013.36) <= 0.05);
    assert.equal(picked.total, 10_394_717.77);
  });

  it("no inventa neto cuando solo hay un importe leído y no cierra", () => {
    const primary = {
      net: null,
      vat: JELUZ_VAT,
      perceptions: JELUZ_PERC,
      total: JELUZ_NET,
    };

    const picked = pickBestReconcilingFields(primary);
    assert.equal(picked, null);
    assert.equal(
      reconcileAmounts({
        net: null,
        vat: JELUZ_VAT,
        perceptions: JELUZ_PERC,
        total: JELUZ_NET,
      }).reconciled,
      false,
    );
  });

  it("no reconcilia con subtotal mal asignado a net y total sin segundo candidato", () => {
    const primary = {
      net: JELUZ_NET,
      vat: JELUZ_VAT,
      perceptions: JELUZ_PERC,
      total: JELUZ_NET,
    };

    const picked = pickBestReconcilingFields(primary);
    assert.equal(picked, null);
  });
});

/** Números reales factura CORESA 0006-00141462 (IVA 10,5% leído 503,73 = 50,73). */
const CORESA_NET = 5_943.12;
const CORESA_PERC = 297.16;
const CORESA_VAT_OK = 1_197.32; // 1146,59 + 50,73
const CORESA_VAT_BAD = 1_650.32; // 1146,59 + 503,73 (10,5% mal leído)
const CORESA_TOTAL_OK = 7_437.6;

describe("tryFixVatOnly (corrige IVA con neto/percepciones/total confiables)", () => {
  it("corrige el IVA mal leído usando el total impreso (CORESA)", () => {
    const fixed = tryFixVatOnly({
      net: CORESA_NET,
      vat: CORESA_VAT_BAD,
      perceptions: CORESA_PERC,
      total: CORESA_TOTAL_OK,
    });
    assert.ok(fixed);
    assert.ok(Math.abs(fixed.vat! - CORESA_VAT_OK) <= 0.01);
    assert.ok(reconcileAmounts(fixed).reconciled);
  });

  it("no toca nada cuando la suma ya cierra", () => {
    const ok = {
      net: CORESA_NET,
      vat: CORESA_VAT_OK,
      perceptions: CORESA_PERC,
      total: CORESA_TOTAL_OK,
    };
    assert.equal(tryFixVatOnly(ok), null);
  });

  it("no corrige si el IVA derivado no es una alícuota plausible", () => {
    // total absurdo → IVA derivado = total - net - perc no es 10,5/21/27% del neto
    const fixed = tryFixVatOnly({
      net: CORESA_NET,
      vat: CORESA_VAT_BAD,
      perceptions: CORESA_PERC,
      total: 9_999.99,
    });
    assert.equal(fixed, null);
  });
});

describe("reanchorWithTrustedNetVat no fabrica un total mayor al impreso", () => {
  it("no infla el total cuando neto+IVA(mal leído) ya superan el total leído (CORESA)", () => {
    // IVA inflado (1650,32 ≈ 27% del neto) pasa vatConsistentWithNet; sin el guard
    // fabricaría total = net+vat+perc = 7890,60. Con el guard, no lo hace.
    const result = reanchorWithTrustedNetVat({
      net: CORESA_NET,
      vat: CORESA_VAT_BAD,
      perceptions: CORESA_PERC,
      total: CORESA_TOTAL_OK,
    });
    if (result) {
      assert.ok(result.total! <= CORESA_TOTAL_OK + 0.5);
    }
  });
});
