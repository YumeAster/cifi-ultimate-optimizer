import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import data from "../lib/cifi/mod-tree/recommendation-data.json" with { type: "json" };
import reference from "../lib/cifi/mod-tree/reference.json" with { type: "json" };
import baseline from "./fixtures/mod-game-effects-recommendation-baseline.json" with { type: "json" };
import { createModContext, evaluateMods, modNextCost, rankMods, simulateMods } from "../lib/cifi/mod-tree/recommendations.ts";
import { evaluateFormula, wideNumber } from "../lib/cifi/mod-tree/formula.ts";

const sha256 = text => createHash("sha256").update(text).digest("hex");
const digest = value => sha256(JSON.stringify(value));
const stateFor = scenario => ({
  ...structuredClone(scenario.state),
  ...(scenario.levelStrategy ? { levels: Object.fromEntries(reference.nodes.map(node => [node.code, Math.min(10, node.maxLevel - 1)])) } : {}),
});
// Twelve significant digits tolerate platform floating-point noise, while
// exact decimal prices, prerequisites and all boolean decisions remain exact.
const evaluationSnapshot = row => ({
  code: row.code, level: row.level, maxLevel: row.maxLevel, missing: row.missing,
  maxed: row.maxed, ignored: row.ignored, unlocked: row.unlocked, affordable: row.affordable,
  cost: row.cost, costLog: Number(row.costLog.toPrecision(12)),
  powerLog: Number(row.powerLog.toPrecision(12)), score: Number(row.score.toPrecision(12)),
  error: row.error, priority: row.priority,
});

test("game effect corrections preserve the source workbook hash and the entire recommendation model", async () => {
  assert.equal(data.sha256, baseline.sourceSha256);
  assert.equal(data.version, baseline.sourceVersion);
  // JSON canonicalization and LF normalization exclude checkout line endings,
  // not any formula, source cell, cost, prerequisite or score-model change.
  assert.equal(digest(data), baseline.sha256["recommendation-data.json"]);
  assert.equal(digest(reference), baseline.sha256["reference.json"]);
  for (const file of ["recommendations.ts", "formula.ts"]) {
    const source = await readFile(new URL(`../lib/cifi/mod-tree/${file}`, import.meta.url), "utf8");
    assert.equal(sha256(source.replace(/\r\n/g, "\n")), baseline.sha256[file], file);
  }
});

for (const scenario of baseline.scenarios) {
  test(`game presentation does not change 274-node eligibility, prices or rankings: ${scenario.id}`, () => {
    const state = stateFor(scenario), before = structuredClone(state);
    const rows = evaluateMods(state, scenario.profile);
    assert.equal(rows.length, 274);
    assert.equal(digest(rows.map(evaluationSnapshot)), scenario.rowsSha256);
    assert.deepEqual(rankMods(rows).slice(0, 10).map(row => row.code), scenario.rankedTopTen);
    const plan = simulateMods(state, scenario.profile, 5);
    assert.equal(digest(plan), scenario.planSha256);
    assert.deepEqual(plan.steps.map(row => row.code), scenario.planCodes);
    assert.equal(plan.next.budget, scenario.planBudget);
    assert.deepEqual(state, before);
  });
}

test("raw CR effects stay positive unrounded log10 values for recommendation scoring", () => {
  const state = stateFor(baseline.scenarios[0]);
  for (const [code, column, divisor] of [["C1c", 25, 1500], ["C4c", 28, 400_000_000]]) {
    const formula = data.nodes.find(row => row.code === code).effects[column];
    const log = wideNumber(evaluateFormula(formula, createModContext(state, {})));
    assert.equal(log, Math.log10(divisor), code);
    assert.ok(log > 0, code);
    assert.notEqual(log, Number(log.toFixed(2)), `${code}: rounding raw CR would corrupt inverse conversion`);
  }
  // Do not replace H12's source recommendation heuristic with a cost divisor.
  const h12 = data.nodes.find(row => row.code === "H12").effects[11];
  assert.equal(typeof h12, "string");
  assert.match(h12, /12/);
  assert.match(h12, /10/);
});

test("the eight visually observed next-price samples remain exact local model results", () => {
  for (const [code, level, exact] of [
    ["A07", 9, "3e+53"],
    ["A08", 2, "6.9999299999999910000000018e+55"],
    ["C4o", 57, "1.360714951986909448063174710149876515347236407097e+49"],
    ["C1o", 175, "1.2707943956805089623448552621958806801133490752269e+49"],
    ["H12", 19, "1.5912721154148773800225025589658360634692e+49"],
    ["H15", 2, "9.261e+52"],
    ["I04", 0, "1e+123"],
    ["IU3", 0, "2.5e+303"],
  ]) assert.equal(modNextCost(code, level).exact, exact, code);
});
