import assert from "node:assert/strict";
import test from "node:test";
import { GAME_EFFECT_CATALOG, compareGameEffects } from "../lib/cifi/mod-tree/gameEffects.ts";
import { blankModState } from "../lib/cifi/mod-tree/recommendations.ts";

const c = value => ({ kind: "constant", value: String(value) });
function evaluate(expression, level = 1, profile = {}) {
  const rules = structuredClone(GAME_EFFECT_CATALOG);
  rules.nodes.A01.effects = [{ target: "cells", expression }];
  return compareGameEffects("A01", { ...blankModState(), levels: { A01: level } }, profile, rules)[0];
}

test("native formula arithmetic handles real powers without overflow or fake sheet values", () => {
  assert.equal(evaluate({ kind: "power", base: c(4), exponent: c("0.5") }).current, "×2.00");
  assert.equal(evaluate({ kind: "power", base: c(10), exponent: c(50000) }).current, "×1.00e50000");
  assert.equal(evaluate({ kind: "power", base: c(4), exponent: c(-1) }).current, "×0.25");
  assert.equal(evaluate({ kind: "divide", numerator: c(1), denominator: c(3) }).current, "×0.33");
  assert.equal(evaluate({ kind: "divide", numerator: c(1), denominator: c(0) }).status, "invalid");
  assert.equal(evaluate({ kind: "power", base: c(10), exponent: c("1e99") }).status, "invalid");
});

test("native branches evaluate only the selected arm and clamp or round explicitly", () => {
  assert.equal(evaluate({ kind: "ifZero", condition: c(0), zero: c(1), otherwise: { kind: "profile", key: "missing" } }).current, "×1.00");
  assert.equal(evaluate({ kind: "max", args: [c(1), c(-20)] }).current, "×1.00");
  assert.equal(evaluate({ kind: "min", args: [c(4), c(2)] }).current, "×2.00");
  assert.equal(evaluate({ kind: "max", args: [c("1e50000"), c(1)] }).current, "×1.00e50000");
  assert.ok(Number(evaluate({ kind: "power", base: c("1.000000000000001"), exponent: c("1e15") }).currentExact) > 3);
  assert.equal(evaluate({ kind: "floor", value: c("1.99") }).currentExact, "1");
  assert.equal(evaluate({ kind: "truncate", value: c("1.99") }).currentExact, "1");
  assert.equal(evaluate({ kind: "float32", value: c("1.1") }).currentExact, "1.100000023841858");
  assert.equal(evaluate({ kind: "ifLess", left: c(42), right: c(43), then: c(30), otherwise: c(60) }).currentExact, "30");
});

test("the original level stays fixed while previewing stat changes caused by a purchase", () => {
  const result = evaluate({ kind: "add", args: [
    c(1), { kind: "level" },
    { kind: "multiply", args: [c(-1), { kind: "baselineLevel" }] },
  ] }, 2);
  assert.equal(result.currentExact, "1");
  assert.equal(result.nextExact, "2");
});
