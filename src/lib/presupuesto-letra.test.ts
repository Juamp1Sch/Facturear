import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  normalizePresupuestoLetra,
  validatePresupuestoLetra,
} from "@/lib/presupuesto-letra";

describe("normalizePresupuestoLetra", () => {
  it("recorta espacios y pasa a mayúsculas", () => {
    assert.equal(normalizePresupuestoLetra("  x  "), "X");
    assert.equal(normalizePresupuestoLetra("ab"), "AB");
  });

  it("vacío o solo espacios → null", () => {
    assert.equal(normalizePresupuestoLetra(""), null);
    assert.equal(normalizePresupuestoLetra("   "), null);
    assert.equal(normalizePresupuestoLetra(null), null);
    assert.equal(normalizePresupuestoLetra(undefined), null);
  });

  it("limita a 5 caracteres", () => {
    assert.equal(normalizePresupuestoLetra("abcdef"), "ABCDE");
  });
});

describe("validatePresupuestoLetra", () => {
  it("acepta letras válidas", () => {
    assert.deepEqual(validatePresupuestoLetra("x"), { ok: true, letra: "X" });
    assert.deepEqual(validatePresupuestoLetra("AB"), { ok: true, letra: "AB" });
  });

  it("vacío → null (limpiar)", () => {
    assert.deepEqual(validatePresupuestoLetra(""), { ok: true, letra: null });
    assert.deepEqual(validatePresupuestoLetra("   "), {
      ok: true,
      letra: null,
    });
  });

  it("rechaza dígitos y símbolos", () => {
    assert.equal(validatePresupuestoLetra("123").ok, false);
    assert.equal(validatePresupuestoLetra("A1").ok, false);
    assert.equal(validatePresupuestoLetra("X-").ok, false);
  });
});
