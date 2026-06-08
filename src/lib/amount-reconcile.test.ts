import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  pickBestReconcilingFields,
  reconcileAmounts,
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
