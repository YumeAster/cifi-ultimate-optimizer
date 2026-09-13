import assert from "node:assert/strict";
import test from "node:test";
import { validateInput, researchCountExceedsTotal, restoreWeightPresets } from "../app/content/profileValidation.ts";
import { restoreOptimizerProfile } from "../lib/cifi/upgrades/profile.ts";
import { TOKEN_UPGRADES } from "../lib/cifi/upgrades/rules.ts";

test("input grammar rejects hex and fractional integers without rounding", () => {
  assert.equal(validateInput("positive", "0x10"), "invalidNumber");
  assert.equal(validateInput("integer", "9007199254740992.1"), "integer");
  assert.equal(validateInput("integer", "9007199254740993"), undefined);
  assert.equal(validateInput("short", "1.5k"), undefined);
  assert.equal(validateInput("short", "1e10001"), "invalidShort");
  assert.equal(validateInput("bar", "10.0000000000000001"), "integer");
});
test("research comparison supports grouped and exact large counts", () => {
  assert.equal(researchCountExceedsTotal("2,000", "1,000"), true);
  assert.equal(researchCountExceedsTotal("9007199254740993", "9007199254740992"), true);
  assert.equal(researchCountExceedsTotal("", "1"), false);
  assert.equal(researchCountExceedsTotal("invalid", "1"), false);
});
test("malformed presets cannot inject non-string or null values", () => {
  const presets = restoreWeightPresets([
    { id: "null", name: "Null", values: null },
    { id: "number", name: "Number", values: { cells: 5 } },
    { id: "negative", name: "Negative", values: { cells: "-1" } },
    { id: "good", name: " Good ", values: { cells: "1" }, updatedAt: "broken" },
    { id: "good", name: "Duplicate", values: { cells: "2" } },
  ], ["cells"]);
  assert.deepEqual(presets, [{ id: "good", name: "Good", values: { cells: "1" }, updatedAt: "" }]);
});
test("persisted optimizer levels are safe, bounded, and catalog-only", () => {
  const profile = restoreOptimizerProfile({ longRunHours: 999, levels: { token: { MK1: 1e100, MK2: -5, MK3: 3.7, Cells: "5", bogus: 99 }, diamond: null } });
  assert.equal(profile.longRunHours, 24);
  assert.equal(profile.levels.token.MK1, TOKEN_UPGRADES.find(rule => rule.id === "MK1").maxLevel);
  assert.equal(profile.levels.token.MK2, 0);
  assert.equal(profile.levels.token.MK3, 3);
  assert.equal(profile.levels.token.Cells, undefined);
  assert.equal(profile.levels.token.bogus, undefined);
  assert.deepEqual(profile.levels.diamond, {});
});
