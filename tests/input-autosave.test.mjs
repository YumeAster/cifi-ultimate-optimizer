import assert from "node:assert/strict";
import test from "node:test";
import { calculationProfile, commitInputEdit, restoreCalculationProfile } from "../app/content/inputProfile.ts";
import { DEFAULT_WEIGHT_VALUES as weights, commitWeightPreset, storeWeightPreset } from "../app/content/weightPresets.ts";
import { evaluateMods, blankModState } from "../lib/cifi/mod-tree/recommendations.ts";
import { evaluateUpgrade, rankUpgrades } from "../lib/cifi/upgrades/engine.ts";
import { DIAMOND_UPGRADES, TOKEN_UPGRADES } from "../lib/cifi/upgrades/rules.ts";

const fields = [...Object.keys(weights).map(key => ({ key, kind: "positive" })), ...["level", "totalResearchLevels", "completedResearches", "cradleCrew"].map(key => ({ key, kind: "integer" }))];
const defaults = { ...weights, level: "", totalResearchLevels: "", completedResearches: "", cradleCrew: "" };
const initial = { ...defaults, level: "100", totalResearchLevels: "10", completedResearches: "5" };

test("each edit is persisted immediately without writing to the preset library", () => {
  const writes = [];
  let state = { draft: initial, saved: initial };
  for (const [key, value] of [["level", "101"], ["modPoints", "120"], ["cradleCrew", "99"]]) {
    state = commitInputEdit(state.draft, state.saved, key, value, fields, weights, "p", payload => writes.push(payload));
  }
  assert.equal(writes.length, 3);
  assert.equal(writes[2].values.level, "101");
  assert.equal(writes[2].values.cradleCrew, "99");
  assert.equal(writes[2].calculationValues.modPoints, "120");
  assert.equal(writes[2].weightPresetId, "p", "editing never loses the target preset");
  assert.deepEqual(restoreCalculationProfile(writes[2].values, writes[2].calculationValues, defaults, fields, weights), state.saved);
});

test("incomplete numbers survive reload without poisoning calculations or blocking other inputs", () => {
  let stored;
  let state = commitInputEdit(initial, initial, "modPoints", "1e", fields, weights, "p", payload => { stored = payload; });
  assert.equal(stored.values.modPoints, "1e");
  assert.equal(stored.calculationValues.modPoints, "12");
  state = commitInputEdit(state.draft, state.saved, "level", "123", fields, weights, "p", payload => { stored = payload; });
  assert.equal(state.saved.level, "123");
  assert.equal(state.saved.modPoints, "12");
  assert.deepEqual(restoreCalculationProfile(stored.values, stored.calculationValues, defaults, fields, weights), state.saved);
  state = commitInputEdit(state.draft, state.saved, "modPoints", "1e2", fields, weights, "p", payload => { stored = payload; });
  assert.equal(state.saved.modPoints, "1e2");
  state = commitInputEdit(state.draft, state.saved, "modPoints", "", fields, weights, "p", payload => { stored = payload; });
  assert.equal(stored.values.modPoints, "");
  assert.equal(state.saved.modPoints, "12", "all calculation screens receive the same fallback");
});

test("research pair constraints and invalid legacy profiles retain a safe calculation snapshot", () => {
  const invalid = calculationProfile({ ...initial, totalResearchLevels: "3" }, initial, fields, weights);
  assert.equal(invalid.totalResearchLevels, "10");
  assert.equal(invalid.completedResearches, "5");
  const corrected = calculationProfile({ ...initial, totalResearchLevels: "3", completedResearches: "2" }, invalid, fields, weights);
  assert.equal(corrected.totalResearchLevels, "3");
  assert.equal(corrected.completedResearches, "2");
  const restored = restoreCalculationProfile({ ...initial, modPoints: "bad" }, { ...initial, modPoints: "bad" }, defaults, fields, weights);
  assert.equal(restored.modPoints, "12");
});

test("preset switching changes only weight inputs and preserves raw invalid progress", () => {
  const draft = { ...initial, level: "1e" };
  let stored;
  const next = commitWeightPreset(draft, initial, { modPoints: "120" }, weights, "mp", payload => { stored = payload; });
  assert.equal(next.draft.level, "1e");
  assert.equal(next.saved.level, "100");
  assert.equal(next.draft.modPoints, "120");
  assert.deepEqual(restoreCalculationProfile(stored.values, stored.calculationValues, defaults, fields, weights), next.saved);
  const library = storeWeightPreset([], "mp", "MP", next.draft, weights, "2026-09-13T00:00:00Z", () => {});
  assert.equal(Object.keys(library[0].values).length, 8);
  assert.equal(library[0].values.level, undefined);
});

test("failed writes do not advance calculations; the next successful save catches up", () => {
  assert.throws(() => commitInputEdit(initial, initial, "level", "200", fields, weights, "p", () => { throw Error("quota"); }), /quota/);
  const retainedDraft = { ...initial, level: "200" };
  const nextSaved = calculationProfile(retainedDraft, initial, fields, weights);
  const next = commitWeightPreset(retainedDraft, nextSaved, { modPoints: "120" }, weights, "p", () => {});
  assert.equal(next.saved.level, "200");
});

test("switching the same weight profile changes actual Mod Tree and Diamond/Token scores and ranks", () => {
  const before = calculationProfile(initial, defaults, fields, weights);
  const after = commitWeightPreset(before, before, { ...weights, modPoints: "1200" }, weights, "mp", () => {}).saved;
  const state = blankModState();
  const modBefore = evaluateMods(state, before), modAfter = evaluateMods(state, after);
  assert.ok(modBefore.some((row, i) => row.powerLog !== modAfter[i].powerLog));
  const numeric = values => Object.fromEntries(Object.entries(weights).map(([key]) => [key, Number(values[key])]));
  for (const [currency, catalog] of [["diamond", DIAMOND_UPGRADES], ["token", TOKEN_UPGRADES]]) {
    const levels = Object.fromEntries(catalog.map(rule => [rule.id, rule.id === "MK1" || rule.id === "Mods" ? 0 : rule.maxLevel]));
    const optimizer = { levels: { diamond: {}, token: {}, [currency]: levels }, generators: { MK1: { unlocked: true, purchased: 1 } }, ships: { Zagreus: { unlocked: true, crew: 1 } }, longRunHours: 0 };
    const rule = catalog.find(rule => rule.id === "Mods");
    assert.notEqual(evaluateUpgrade(rule, optimizer, numeric(before)).power, evaluateUpgrade(rule, optimizer, numeric(after)).power);
    assert.notEqual(rankUpgrades(currency, optimizer, numeric(before))[0].rule.id, rankUpgrades(currency, optimizer, numeric(after))[0].rule.id);
  }
});
