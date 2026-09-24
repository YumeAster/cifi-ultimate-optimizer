import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateEffects, evaluateInstall, formatInstallNumber, generateSequence,
  installEffects, installMaxLevel, installModePermission, rankInstalls,
  validateInstallContext, validateInstallSequence,
} from "../lib/cifi/ship-install/engine.ts";
import { getShipInstalls, SHIPS } from "../lib/cifi/ship-install/catalog.ts";
import { activeInstallGenerators, combineModLevels, readInstallDependency } from "../lib/cifi/ship-install/profile.ts";

const zeroWeights = { cells: "0", modPoints: "0", shards: "0", research: "0", academyPoints: "0", materials: "0" };
function profile(overrides = {}) {
  return {
    cells: "1", modPoints: "12", shards: "10", research: "8", academyPoints: "24", materials: "72",
    ...Object.fromEntries(SHIPS.flatMap(ship => [[`${ship.id.toLowerCase()}Crew`, "100"], [`${ship.id.toLowerCase()}Rank`, "9000"]])),
    ...Object.fromEntries(Array.from({ length: 8 }, (_, index) => [
      [`manualMk${index + 1}`, "10"], [`hardwareTechMk${index + 1}`, "2"], [`softwareTechMk${index + 1}`, "3"],
    ]).flat()),
    loopsFilled: "200", loopResets: "50", operationsDone: "500", studiesDone: "300", completedResearches: "10", totalResearchLevels: "100",
    manualMk9: "0", hardwareTechMk9To12: "0", softwareTechMk9To12: "0",
    automationsOwned: "30", ticksThisRun: "1000", missionsDone: "20", ...overrides,
  };
}
function context(overrides = {}) {
  return { ship: "Cradle", levels: {}, totalPoints: 20, profile: profile(), mode: "weights", modLevelsTotal: "100", ...overrides };
}
const node = (ship, position) => getShipInstalls(ship).find(item => item.position === position);

test("0→1 direct effects retain the +1 baseline, separate from marginal score", () => {
  const state = context({ profile: profile({ cradleCrew: "10" }) });
  const first = evaluateInstall(state, 1);
  assert.equal(first.effects[0].current, "1");
  assert.equal(first.effects[0].next, "2");
  const second = evaluateInstall({ ...state, levels: { 1: 1 } }, 1);
  assert.equal(second.effects[0].current, "2");
  assert.equal(second.effects[0].next, "3");
  assert.ok(Math.abs(second.score - Math.log(1.5)) < 1e-12);
  assert.ok(second.warnings.some(warning => warning.includes("기본 효과 모델")));
});

test("scientific Crew and progression survive without Number overflow", () => {
  const item = evaluateInstall(context({ profile: profile({ cradleCrew: "1e400" }), levels: { 1: 1 } }), 1);
  assert.ok(item.effects[0].current.includes("e399"));
  assert.ok(Number.isFinite(item.score));
  assert.ok(Math.abs(item.score - Math.log(2)) < 1e-10);
  assert.equal(formatInstallNumber("100000"), "1.000e5");
  assert.equal(formatInstallNumber("12345"), "12,345");
});

test("a missing field is not silently converted into a legitimate zero", () => {
  const missing = evaluateInstall(context({ profile: profile({ cradleCrew: "" }) }), 1);
  assert.equal(missing.effects[0].current, "1");
  assert.equal(missing.effects[0].next, null);
  assert.equal(missing.score, null);
  assert.ok(missing.missing.includes("cradleCrew"));
  const zero = evaluateInstall(context({ profile: profile({ cradleCrew: "0" }) }), 1);
  assert.equal(zero.effects[0].next, "1");
  assert.equal(zero.score, 0);
});

test("shared inputs are reused and zero dependencies remain zero", () => {
  const state = context({ levels: { 1: 25 }, profile: profile({ manualMk2: "0" }) });
  assert.equal(installEffects(state, 4)[0].next, "1");
  assert.equal(readInstallDependency(state, "T").coefficient, 4n);
  assert.equal(readInstallDependency(state, "T").exponent, 1);
  assert.equal(readInstallDependency(context({ modLevelsTotal: "1200" }), "LM").coefficient, 12n);
});

test("native totals include Manual MK9 and Tech MK9–12 without duplicating shared Software fields", () => {
  const state = context({ profile: profile({ manualMk9: "20", hardwareTechMk9To12: "14", softwareTechMk9To12: "16" }) });
  const exact = dependency => {
    const result = readInstallDependency(state, dependency);
    return Number(result.coefficient) * 10 ** result.exponent;
  };
  assert.equal(exact("G"), 100);
  assert.equal(exact("TH"), 30);
  assert.equal(exact("TS"), 40);
  assert.equal(exact("T"), 70);
  assert.ok(activeInstallGenerators(state).includes(9));
  const missing = evaluateInstall(context({ ship: "Auxesia", levels: { 1: 5 }, profile: profile({ softwareTechMk9To12: "" }) }), 3);
  assert.ok(missing.missing.includes("softwareTechMk9To12"));
  assert.equal(missing.effects[0].next, null);
});

test("native Loop Mods total adds shared extras and preserves unknown inputs", () => {
  assert.equal(combineModLevels("120", { extraModLevels: "30" }), "150");
  assert.equal(combineModLevels("0", { extraModLevels: "0" }), "0");
  assert.equal(combineModLevels(undefined, { extraModLevels: "30" }), undefined);
  assert.equal(combineModLevels("120", {}), undefined);
  assert.equal(combineModLevels("120", { extraModLevels: "" }), undefined);
  assert.equal(combineModLevels("120", { extraModLevels: "-1" }), undefined);
  assert.equal(combineModLevels("1e400", { extraModLevels: "1e400" }), "2e400");
  const total = combineModLevels("100", { extraModLevels: "50" });
  const effect = installEffects(context({ ship: "Zagreus", modLevelsTotal: total, profile: profile({ zagreusCrew: "1" }) }), 1)[0];
  assert.equal(effect.next, "1.75");
});

test("Rank never unlocks Install nodes; allocated levels gate every purchase", () => {
  const atZero = evaluateInstall(context({ totalPoints: 200, profile: profile({ cradleRank: "999999" }) }), 8);
  assert.equal(atZero.unlocked, false);
  assert.equal(evaluateInstall(context({ totalPoints: 101, levels: { 1: 99 } }), 8).unlocked, false);
  assert.equal(evaluateInstall(context({ totalPoints: 101, levels: { 1: 100 } }), 8).unlocked, true);
});

test("100 boundary sequence spends a prerequisite before buying the corner", () => {
  const state = context({ levels: { 1: 99 }, totalPoints: 101, profile: profile({ ...zeroWeights, shards: "1" }) });
  const plan = generateSequence(state);
  assert.equal(plan.steps.length, 2);
  assert.equal(plan.steps[0].reason, "prerequisite");
  assert.notEqual(plan.steps[0].position, 10);
  assert.equal(plan.steps[1].position, 10);
  assert.deepEqual(validateInstallSequence(state, plan.steps), []);
  assert.equal(Object.keys(plan.baselineLevels).length, 11);
});

test("caps use a boolean single x5 expansion, not an exponential level", () => {
  assert.equal(installMaxLevel(node("Cradle", 1)), 250);
  assert.equal(installMaxLevel(node("Cradle", 1), true), 1250);
  assert.equal(evaluateInstall(context({ totalPoints: 251, levels: { 1: 250 } }), 1).maxed, true);
  assert.equal(evaluateInstall(context({ totalPoints: 251, levels: { 1: 250 }, capExpanded: true }), 1).maxed, false);
  assert.equal(generateSequence(context({ levels: { 1: 250 }, totalPoints: 251, excluded: [2,3,4,5,6,7,8,9,10,11] })).steps.length, 0);
});

test("exclusions, invalid caps, impossible baselines and budgets are respected", () => {
  assert.deepEqual(rankInstalls(context({ excluded: [1] })), []);
  assert.ok(validateInstallContext(context({ levels: { 1: 251 }, totalPoints: 300 })).length);
  assert.ok(validateInstallContext(context({ levels: { 8: 100 }, totalPoints: 101 })).length);
  assert.ok(validateInstallContext(context({ levels: { 1: 10 }, totalPoints: 9 })).length);
  assert.equal(generateSequence(context({ totalPoints: Infinity })).stopped, "invalid-input");
  assert.equal(generateSequence(context({ totalPoints: 0 })).stopped, "budget");
});

test("MP mode cannot fabricate an MP target for Cradle", () => {
  const result = generateSequence(context({ mode: "mp", totalPoints: 300 }));
  assert.equal(result.stopped, "no-target");
  assert.equal(result.steps.length, 0);
  assert.equal(rankInstalls(context({ mode: "mp", totalPoints: 300 })).length, 0);
});

test("named resource modes hard-mask non-target main resources", () => {
  const state = context({ ship: "Zeus", mode: "mp" });
  assert.equal(installModePermission(node("Zeus", 2), state), "forbidden");
  assert.equal(installModePermission(node("Zeus", 4), state), "forbidden");
  assert.equal(installModePermission(node("Zeus", 5), state), "forbidden");
  assert.equal(installModePermission(node("Zeus", 7), state), "forbidden");
  assert.equal(installModePermission(node("Zeus", 6), state), "target");
  assert.equal(installModePermission(node("Zeus", 1), state), "auxiliary");
  const shard = { ...state, mode: "shards" };
  assert.equal(installModePermission(node("Zeus", 4), shard), "target");
  assert.equal(installModePermission(node("Zeus", 5), shard), "forbidden");
  const research = { ...state, mode: "research" };
  assert.equal(installModePermission(node("Zeus", 5), research), "target");
  assert.equal(installModePermission(node("Zeus", 4), research), "forbidden");
});

test("Cells/generator auxiliaries remain efficiency candidates beyond prerequisite-only levels", () => {
  const state = context({ ship: "Zagreus", levels: { 1: 5 }, totalPoints: 20, mode: "mp" });
  const ranked = rankInstalls(state);
  assert.ok(ranked.some(item => item.position === 1 && item.reason === "auxiliary"));
  assert.ok(ranked.some(item => item.position === 3 && item.reason === "target"));
  const plan = generateSequence(state);
  assert.ok(plan.steps.some(step => step.reason === "auxiliary"));
  assert.deepEqual(validateInstallSequence(state, plan.steps), []);
});

test("forbidden resource allocation happens only for indispensable affordable unlocks", () => {
  const state = context({ ship: "Demeter", totalPoints: 26, mode: "mp", excluded: [1,3,4,5,7,8,9,10,11] });
  const plan = generateSequence(state);
  assert.equal(plan.steps.length, 26);
  assert.deepEqual(plan.steps.slice(0, 25).map(step => [step.position, step.reason]), Array.from({ length: 25 }, () => [2, "prerequisite"]));
  assert.equal(plan.steps[25].position, 6);
  assert.deepEqual(validateInstallSequence(state, plan.steps), []);
  assert.equal(generateSequence({ ...state, totalPoints: 25 }).steps.length, 0);
  const unnecessary = { ...state, excluded: [1] };
  assert.ok(validateInstallSequence(unnecessary, plan.steps).length);
});

test("fixed weights zero produces no recommendation; changing weights changes ranking", () => {
  const levels = { 1: 100 };
  const shards = context({ levels, totalPoints: 101, profile: profile({ ...zeroWeights, shards: "1" }) });
  const research = { ...shards, profile: profile({ ...zeroWeights, research: "1" }) };
  assert.equal(rankInstalls(shards)[0].position, 10);
  assert.equal(rankInstalls(research)[0].position, 11);
  assert.equal(generateSequence({ ...shards, profile: profile(zeroWeights) }).steps.length, 0);
});

test("named modes use their own unit mask rather than the weight preset", () => {
  const state = context({ ship: "Zagreus", mode: "mp", levels: { 1: 10 }, totalPoints: 25 });
  const first = generateSequence(state);
  const changed = generateSequence({ ...state, profile: profile({ ...zeroWeights, cells: "999999", research: "88888" }) });
  assert.deepEqual(first.steps, changed.steps);
});

test("direct summaries do not exponentiate whole-generator effects into Cells", () => {
  const state = context({ levels: { 1: 100, 8: 1 }, totalPoints: 102, activeGenerators: [1, 2] });
  const effects = aggregateEffects(state);
  const all = effects.find(effect => effect.resource === "allGenerators");
  assert.equal(all.value, "1.4");
  assert.equal(effects.find(effect => effect.resource === "cells").value, "1001");
  const score = evaluateInstall(state, 8).score;
  const one = evaluateInstall({ ...state, activeGenerators: [1] }, 8).score;
  assert.ok(Math.abs(score - one * 2) < 1e-12);
  assert.deepEqual(activeInstallGenerators({ ...state, activeGenerators: [1,1,9] }), [1,9]);
});

test("Demeter Operations are additive, next-Run only, without fabricated score", () => {
  const state = context({ ship: "Demeter", levels: { 1: 1 }, totalPoints: 10 });
  const effect = installEffects(state, 1)[0];
  assert.equal(effect.kind, "additive");
  assert.equal(effect.current, "100");
  assert.equal(effect.next, "200");
  assert.equal(effect.logGain, null);
  assert.equal(evaluateInstall(state, 1).score, null);
  assert.equal(installEffects({ ...state, modifiers: { multiplier: "7", operationsMultiplier: "3" } }, 1)[0].current, "300");
});

test("plans are deterministic, bounded, and every prefix is legally purchasable", () => {
  for (const ship of SHIPS) {
    const state = context({ ship: ship.id, totalPoints: 120 });
    const first = generateSequence(state, 120), second = generateSequence(state, 120);
    assert.deepEqual(first, second, ship.id);
    assert.ok(first.steps.length <= 120);
    assert.deepEqual(validateInstallSequence(state, first.steps), [], ship.id);
    for (let i = 0; i < first.steps.length; i++) {
      // Non-forbidden prefixes remain a valid independent legal purchase sequence.
      const prefix = first.steps.slice(0, i + 1);
      assert.deepEqual(validateInstallSequence(state, prefix), [], `${ship.id} prefix ${i + 1}`);
    }
  }
  const limited = generateSequence(context({ totalPoints: 100 }), 3);
  assert.equal(limited.steps.length, 3);
  assert.equal(limited.stopped, "limit");
});
