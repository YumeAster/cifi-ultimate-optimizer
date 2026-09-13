import assert from "node:assert/strict";
import test from "node:test";
import reference from "../lib/cifi/mod-tree/reference.json" with { type: "json" };
import inputs from "../lib/cifi/mod-tree/game-display-inputs.json" with { type: "json" };
import fixture from "./fixtures/native-effect-precision-0.7.3.63.json" with { type: "json" };
import { GAME_EFFECT_CATALOG as catalog, compareGameEffects, gameEffectCoverage, summarizeGameEffects } from "../lib/cifi/mod-tree/gameEffects.ts";
import { blankModState } from "../lib/cifi/mod-tree/recommendations.ts";
import { deriveGameDisplayProfile, reconcileGameDisplayAnchors } from "../lib/cifi/mod-tree/gameDisplayProfile.ts";

const state = levels => ({ ...blankModState(), levels });
const profileKeys = new Set();
function visit(value) {
  if (!value || typeof value !== "object") return;
  if (value.kind === "profile") profileKeys.add(value.key);
  Object.values(value).forEach(visit);
}
visit(catalog.nodes);
const profile = Object.fromEntries([...profileKeys].map(key => [key, key === "level" ? "100" : "10"]));

test("every current-map node and effect has a native rule and every dependency has an input", () => {
  assert.deepEqual(Object.keys(catalog.nodes).sort(), reference.nodes.map(node => node.code).sort());
  assert.equal(gameEffectCoverage().filter(row => row.status === "verified").length, 274);
  assert.equal(gameEffectCoverage().filter(row => row.observed).length, 20);
  assert.equal(Object.values(catalog.nodes).reduce((n, node) => n + node.effects.length, 0), 428);
  for (const [code, node] of Object.entries(catalog.nodes)) {
    assert.equal(node.sourceKind, "native", code);
    assert.ok(node.effects.every(effect => effect.expression && !effect.target.startsWith("unmodeled")), code);
    assert.match(node.evidence, /native-game-effects-0\.7\.3\.63\.json#/);
  }
  for (const key of profileKeys) assert.ok(key === "level" || /^manualMk[1-8]$/.test(key) || inputs.some(input => input.key === key), key);
});

test("all 428 effects evaluate at zero, middle and base maximum without missing or invalid rows", () => {
  for (const [code, node] of Object.entries(catalog.nodes)) {
    const maximum = node.maxLevel ?? 1000;
    for (const level of new Set([0, 1, Math.floor(maximum / 2), maximum])) {
      for (const row of compareGameEffects(code, state({ [code]: level }), profile)) {
        assert.equal(row.status, "verified", `${code}/${row.target} L${level}: ${row.reason}`);
        assert.notEqual(row.currentExact, null);
        assert.notEqual(row.nextExact, null);
        assert.doesNotMatch(row.current + row.next, /NaN|Infinity|—/);
      }
    }
  }
});

test("native float32 and double paths match 30 independently calculated regression cases", () => {
  for (const sample of fixture.cases) {
    const rules = structuredClone(catalog);
    // Dynamic game caps may exceed the score sheet's base cap. This isolates
    // effect arithmetic without changing recommendation eligibility or prices.
    for (const [code, level] of Object.entries(sample.state)) if (rules.nodes[code].maxLevel !== null) rules.nodes[code].maxLevel = Math.max(rules.nodes[code].maxLevel, level);
    const effective = sample.baseline ? deriveGameDisplayProfile(sample.profile, state(sample.state), reconcileGameDisplayAnchors({}, sample.profile, state(sample.baseline))) : sample.profile;
    const row = compareGameEffects(sample.code, state(sample.state), effective, rules).find(row => row.target === sample.target);
    assert.notEqual(row?.currentExact, null, `${sample.code}/${sample.target}: ${row?.reason}`);
    const actual = Number(row.currentExact);
    assert.ok(Math.abs(actual - sample.expected) <= Math.max(1, Math.abs(sample.expected)) * 2e-12, `${sample.code}/${sample.target}: ${actual} != ${sample.expected}`);
  }
});

test("free-progress previews remain equal after purchase, undo and a restored display snapshot", () => {
  const original = { gameCradleRank: "100", gameCradleCrew: "50", gameZeusCrew: "70", currentLoopsDone: "100" };
  const before = state({ EU1: 2, EU2: 1, DU1: 2 });
  const anchors = reconcileGameDisplayAnchors({}, original, before);
  const preview = compareGameEffects("EU1", before, original).find(row => row.target === "allGenerators");
  const after = state({ EU1: 3, EU2: 2, DU1: 3 });
  const effective = deriveGameDisplayProfile(original, after, JSON.parse(JSON.stringify(anchors)));
  assert.equal(effective.gameCradleRank, "108");
  assert.equal(effective.gameCradleCrew, "51");
  assert.equal(effective.currentLoopsDone, "101");
  assert.equal(compareGameEffects("EU1", after, effective).find(row => row.target === "allGenerators").currentExact, preview.nextExact);
  assert.deepEqual(deriveGameDisplayProfile(original, before, anchors), original);
  const changed = { ...original, gameCradleCrew: "80" };
  const rebased = reconcileGameDisplayAnchors(anchors, changed, after);
  assert.equal(deriveGameDisplayProfile(changed, after, rebased).gameCradleCrew, "80");
  assert.equal(deriveGameDisplayProfile(changed, after, rebased).gameZeusCrew, "71");
  assert.deepEqual(original, { gameCradleRank: "100", gameCradleCrew: "50", gameZeusCrew: "70", currentLoopsDone: "100" });
});

test("profile syntax is shared with the input form and known current values survive missing next inputs", () => {
  const code = "D1L";
  const a = compareGameEffects(code, state({ [code]: 1 }), { currentLoopsDone: "1,000" })[0];
  const b = compareGameEffects(code, state({ [code]: 1 }), { currentLoopsDone: "1k" })[0];
  assert.equal(a.currentExact, b.currentExact);
  assert.equal(a.status, "verified");
  const row = compareGameEffects("F04", state({}), {}).find(row => row.target === "cells");
  assert.equal(row.currentExact, "1");
  assert.equal(row.nextExact, null);
  assert.equal(row.status, "missing-input");
  assert.equal(row.missingInput, "level");
});

test("all-generator effects fan out and shared miner shards are counted exactly once", () => {
  const summary = summarizeGameEffects(state({ DU2: 1 }), profile);
  for (let mk = 1; mk <= 8; mk++) assert.ok(summary.effects.some(row => row.target === `mk${mk}Output`));
  assert.ok(!summary.effects.some(row => row.target === "allGenerators"));
  for (const levels of [{ G04: 10 }, { G03: 4, G04: 402, G05: 5, G06: 1, G07: 4 }]) {
    const expected = compareGameEffects("G03", state(levels), profile).find(row => row.target === "minerShards");
    const shards = summarizeGameEffects(state(levels), profile).effects.find(row => row.target === "shards");
    assert.equal(shards.exact, expected.currentExact);
    assert.equal(shards.contributors.length, 1);
  }
});
