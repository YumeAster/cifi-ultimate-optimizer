import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { DEFAULT_WEIGHT_PRESET_ID, commitWeightPreset, matchingWeightPreset, normalizeWeightValues, sameWeightValues, storeWeightPreset } from "../app/content/weightPresets.ts";
import { restoreWeightPresets, validateInput } from "../app/content/profileValidation.ts";
import { createModContext, blankModState } from "../lib/cifi/mod-tree/recommendations.ts";

const defaults = { cells: "1", modPoints: "12", shards: "10", research: "8", academyPoints: "24", materials: "72", costReduction: "6", rankPoints: "1" };
const preset = (id, values) => ({ id, name: id, values, updatedAt: "2026-09-13T00:00:00.000Z" });

test("blank, whitespace and absent weights use the same defaults as normal calculations", () => {
  const normalized = normalizeWeightValues({ cells: "", shards: "  ", modPoints: "120" }, defaults);
  assert.deepEqual(normalized, { ...defaults, modPoints: "120" });
  assert.equal(validateInput("positive", ""), undefined);
  assert.equal(createModContext(blankModState(), normalized).scalar("Weight_Cells"), 1);
  assert.equal(createModContext(blankModState(), normalized).scalar("Weight_MP"), 120);
  assert.equal(Object.keys(normalized).length, 8);
  assert.deepEqual(normalizeWeightValues({ ...defaults, level: "999" }, defaults), defaults);
  for (const cells of ["0", "-1", "oops", "0x10", "1e400", "1e-400", 10, null]) {
    assert.throws(() => normalizeWeightValues({ cells }, defaults), /Invalid weight: cells/);
  }
});

test("blank and partial legacy presets survive restore and resolve to defaults", () => {
  const restored = restoreWeightPresets([
    preset("blank", Object.fromEntries(Object.keys(defaults).map(key => [key, ""]))),
    preset("partial", { cells: "2", research: "  " }),
    preset("bad", { cells: "0" }),
  ], Object.keys(defaults));
  assert.deepEqual(restored.map(row => row.id), ["blank", "partial"]);
  assert.deepEqual(normalizeWeightValues(restored[0].values, defaults), defaults);
  assert.deepEqual(normalizeWeightValues(restored[1].values, defaults), { ...defaults, cells: "2" });
});

test("apply writes only weights to saved progress and retains unrelated invalid/unsaved draft values", () => {
  const saved = { ...defaults, level: "100", studiesDone: "10", gameCradleRank: "88", __gameDisplayInputsVersion: "2" };
  const draft = { ...saved, level: "invalid", studiesDone: "999", cells: "invalid" };
  const originalSaved = structuredClone(saved), originalDraft = structuredClone(draft);
  const writes = [];
  const next = commitWeightPreset(draft, saved, { cells: "20", research: "" }, defaults, "cells-run", payload => writes.push(JSON.parse(JSON.stringify(payload))));
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0], { version: 1, values: { ...draft, cells: "20", research: "8" }, calculationValues: { ...saved, cells: "20" }, weightPresetId: "cells-run" });
  assert.deepEqual(next.saved, { ...saved, cells: "20" });
  assert.deepEqual(next.draft, { ...draft, cells: "20" });
  assert.equal(next.saved.level, "100");
  assert.equal(next.draft.level, "invalid");
  assert.equal(createModContext(blankModState(), next.saved).scalar("Weight_Cells"), 20);
  assert.deepEqual(saved, originalSaved);
  assert.deepEqual(draft, originalDraft);
});

test("write failures return no new state and invalid preset weights never reach storage", () => {
  const saved = { ...defaults, level: "100" }, draft = { ...saved, level: "101" };
  const before = structuredClone({ saved, draft });
  let calls = 0;
  assert.throws(() => commitWeightPreset(draft, saved, { cells: "2" }, defaults, "p", () => { calls++; throw new Error("quota"); }), /quota/);
  assert.equal(calls, 1);
  assert.deepEqual({ saved, draft }, before);
  assert.throws(() => commitWeightPreset(draft, saved, { cells: "-2" }, defaults, "p", () => { calls++; }), /Invalid weight/);
  assert.equal(calls, 1);
});

test("applied identity survives reload and does not follow selection or duplicate numeric formats", () => {
  const presets = [preset("first", { ...defaults, cells: "1000" }), preset("second", { ...defaults, cells: "1k" })];
  assert.ok(sameWeightValues(presets[0].values, presets[1].values, defaults));
  assert.ok(sameWeightValues({ cells: "1e0" }, { cells: "1.0" }, defaults));
  let stored;
  commitWeightPreset(defaults, defaults, presets[1].values, defaults, "second", payload => { stored = JSON.stringify(payload); });
  const restored = JSON.parse(stored);
  assert.equal(matchingWeightPreset(restored.values, presets, defaults, restored.weightPresetId), "second");
  assert.equal(matchingWeightPreset(restored.values, presets, defaults), "first");
  assert.equal(matchingWeightPreset(defaults, presets, defaults, "second"), DEFAULT_WEIGHT_PRESET_ID);
  assert.equal(matchingWeightPreset({ cells: "9" }, presets, defaults, "second"), null);
  assert.equal(matchingWeightPreset({ cells: "invalid" }, presets, defaults), null);
});

test("removing the active preset preserves weights, and restore matching never falsely selects defaults", () => {
  const saved = { ...defaults, cells: "2", level: "100" };
  const rows = [preset("active", { ...defaults, cells: "2" }), preset("unrelated", { ...defaults, cells: "3" })];
  assert.equal(matchingWeightPreset(saved, rows, defaults), "active");
  assert.equal(matchingWeightPreset(saved, rows.filter(row => row.id !== "active"), defaults, "active"), null);
  assert.equal(saved.cells, "2");
  assert.equal(matchingWeightPreset({ ...saved, cells: "1" }, [], defaults, "active"), DEFAULT_WEIGHT_PRESET_ID);
});

test("saving a library preset normalizes values without changing the calculation profile", () => {
  const saved = { ...defaults, level: "100" }, draft = { ...saved, cells: "5", research: "" };
  const newPreset = preset("new", normalizeWeightValues(draft, defaults));
  assert.equal(newPreset.values.cells, "5");
  assert.equal(newPreset.values.research, "8");
  assert.equal(matchingWeightPreset(saved, [newPreset], defaults), DEFAULT_WEIGHT_PRESET_ID);
  assert.equal(saved.cells, "1");
  assert.equal(draft.research, "");
});

test("the merged form selects and applies a preset immediately, with a separate weight-library save", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const apply = page.slice(page.indexOf("const applyPreset ="), page.indexOf("const saveWeightPreset ="));
  assert.match(apply, /commitWeightPreset\(current.draft, currentSaved/);
  assert.ok(apply.indexOf("commitWeightPreset(") < apply.indexOf("acceptProfile("));
  assert.doesNotMatch(apply, /Object\.keys\(errors\)|weightFields\.some/);
  assert.match(page, /setSelectedPresetId\(restoredPresetId\)/);
  assert.match(page, /onChange=\{id => applyPreset\(id\)\}/);
  assert.match(page, /activePresetId === selectedPresetId/);
  assert.match(page, /text.saveWeights/);
  assert.match(page, /fieldPanel\(weightFields, "weights"\)/);
  assert.match(page, /fieldPanel\(playerFields, "player"\)/);
  assert.doesNotMatch(page, /const saveValues =|onClick=\{saveValues\}|key: "weights"|key: "player"/);
});

test("explicit weight save replaces the selected preset and never stores progression", () => {
  const original = [preset("p", { ...defaults, cells: "2" }), preset("q", defaults)];
  let stored;
  const next = storeWeightPreset(original, "p", "p", { ...defaults, cells: "42", level: "900", manualMk1: "1e20", cradleCrew: "5" }, defaults, "2026-09-13T10:00:00.000Z", rows => { stored = JSON.parse(JSON.stringify(rows)); });
  assert.equal(next.length, 2);
  assert.equal(next[0].id, "p");
  assert.equal(next[0].values.cells, "42");
  assert.equal(original[0].values.cells, "2");
  assert.deepEqual(Object.keys(next[0].values).sort(), Object.keys(defaults).sort());
  assert.deepEqual(restoreWeightPresets(stored, Object.keys(defaults)), next);
  assert.throws(() => storeWeightPreset(original, "p", "p", defaults, defaults, "", () => { throw Error("quota"); }), /quota/);
  assert.equal(original[0].values.cells, "2");
  assert.throws(() => storeWeightPreset(original, DEFAULT_WEIGHT_PRESET_ID, "Default", defaults, defaults, "", () => {}));
});
