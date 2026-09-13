import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { GAME_DISPLAY_EXTRA_INPUTS, GAME_DISPLAY_INPUT_ALIASES, SOFTWARE_BASE_KEYS, SOFTWARE_EXTRA_KEY, migrateGameDisplayInputs, readGameDisplayInput } from "../lib/cifi/mod-tree/gameDisplayInputs.ts";
import { GAME_EFFECT_CATALOG, compareGameEffects } from "../lib/cifi/mod-tree/gameEffects.ts";
import { deriveGameDisplayProfile, reconcileGameDisplayAnchors, restoreGameDisplayAnchors } from "../lib/cifi/mod-tree/gameDisplayProfile.ts";
import { blankModState, createModContext } from "../lib/cifi/mod-tree/recommendations.ts";
import { getInputFieldHelp, getInputFieldLabel } from "../app/content/inputCopy.ts";

const state = levels => ({ ...blankModState(), levels });
const software = Object.fromEntries(SOFTWARE_BASE_KEYS.map(key => [key, "10"]));

test("20 native dependencies reuse the original saved profile; all 274 nodes still evaluate", () => {
  assert.equal(Object.keys(GAME_DISPLAY_INPUT_ALIASES).length, 20);
  const shared = { level: "100", ...software, [SOFTWARE_EXTRA_KEY]: "0", extraJerrehLevels: "0", extraModLevels: "0" };
  for (const key of Object.values(GAME_DISPLAY_INPUT_ALIASES)) shared[key] = "100";
  for (let mk = 1; mk <= 8; mk++) shared[`manualMk${mk}`] = "100";
  const before = structuredClone(shared);
  const native = Object.fromEntries(Object.entries(GAME_DISPLAY_INPUT_ALIASES).map(([key, value]) => [key, shared[value]]));
  Object.assign(native, { level: "100", totalSoftwareLevelsMK1To12: "80", extraJerrehLevels: "0", extraModLevels: "0" });
  for (let mk = 1; mk <= 8; mk++) native[`manualMk${mk}`] = "100";
  for (const code of Object.keys(GAME_EFFECT_CATALOG.nodes)) {
    const current = state({ [code]: 1 });
    const rows = compareGameEffects(code, current, shared);
    const expected = compareGameEffects(code, current, native);
    assert.ok(rows.every(row => row.status === "verified"), code);
    assert.deepEqual(rows.map(row => [row.currentExact, row.nextExact]), expected.map(row => [row.currentExact, row.nextExact]), code);
  }
  assert.deepEqual(shared, before);
});

test("only three additional controls remain, without reintroducing the 20 duplicate fields", async () => {
  assert.deepEqual(GAME_DISPLAY_EXTRA_INPUTS.map(input => input.key), ["extraJerrehLevels", "extraModLevels", SOFTWARE_EXTRA_KEY]);
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /GAME_DISPLAY_EXTRA_INPUTS as gameDisplayInputs/);
  assert.doesNotMatch(page, /추천 점수용 최고 기록과 별도로|인게임 효과 표시용 현재 진행도/);
  assert.match(getInputFieldHelp({ key: SOFTWARE_EXTRA_KEY, group: "player", label: "Software" }, "ko"), /MK1~MK8은 기존 입력에서 자동 합산/);
});

test("MK1–8 plus MK9–12 subtotal is exact, reactive, and separate from sheet scoring", () => {
  const profile = { ...software, softwareTechMk1: "1,000", softwareTechMk2: "2k", [SOFTWARE_EXTRA_KEY]: "40" };
  assert.equal(readGameDisplayInput(profile, "totalSoftwareLevelsMK1To12"), "3100");
  assert.equal(readGameDisplayInput({ ...profile, softwareTechMk1: "1001" }, "totalSoftwareLevelsMK1To12"), "3101");
  assert.equal(createModContext(state({}), profile).scalar("ModValues_SWTech"), 3060);
  assert.equal(readGameDisplayInput({ ...software, softwareTechMk1: "9007199254740993", [SOFTWARE_EXTRA_KEY]: "1" }, "totalSoftwareLevelsMK1To12"), "9.007199254741064e+15");
  assert.throws(() => readGameDisplayInput(software, "totalSoftwareLevelsMK1To12"), /Missing profile input: softwareTechMk9To12/);
  assert.throws(() => readGameDisplayInput({ ...profile, softwareTechMk2: "" }, "totalSoftwareLevelsMK1To12"), /Missing profile input: softwareTechMk2/);
  assert.throws(() => readGameDisplayInput({ ...profile, [SOFTWARE_EXTRA_KEY]: "-1" }, "totalSoftwareLevelsMK1To12"), /Invalid profile input/);
});

test("migration fills only missing shared values, retains conflicts and derives the unentered Software subtotal", () => {
  const old = { ...software, cradleRank: "100", gameCradleRank: "200", gameZeusCrew: "17", totalSoftwareLevelsMK1To12: "100" };
  const before = structuredClone(old);
  const migration = migrateGameDisplayInputs(old);
  const restored = { ...old, ...migration.values };
  assert.equal(restored.cradleRank, "100");
  assert.equal(restored.gameCradleRank, "200");
  assert.equal(restored.zeusCrew, "17");
  assert.equal(restored[SOFTWARE_EXTRA_KEY], "20");
  assert.equal(restored.totalSoftwareLevelsMK1To12, "100");
  assert.deepEqual(migration.conflicts, ["cradleRank"]);
  assert.equal(readGameDisplayInput(restored, "gameCradleRank"), "100");
  assert.equal(readGameDisplayInput(restored, "totalSoftwareLevelsMK1To12"), "100");
  assert.deepEqual(old, before);
  const cleared = JSON.parse(JSON.stringify({ ...restored, zeusCrew: "", [SOFTWARE_EXTRA_KEY]: "" }));
  const reloaded = { ...cleared, ...migrateGameDisplayInputs(cleared).values };
  assert.equal(reloaded.zeusCrew, "");
  assert.equal(reloaded[SOFTWARE_EXTRA_KEY], "");
  assert.throws(() => readGameDisplayInput(reloaded, "gameZeusCrew"), /Missing profile input: zeusCrew/);
});

test("ambiguous legacy Software totals are preserved without inventing missing or negative values", () => {
  for (const original of [{ totalSoftwareLevelsMK1To12: "100" }, { ...software, totalSoftwareLevelsMK1To12: "50" }]) {
    const migration = migrateGameDisplayInputs(original);
    assert.equal(migration.softwareNeedsReview, true);
    assert.equal(migration.values[SOFTWARE_EXTRA_KEY], undefined);
    assert.equal(migration.values.totalSoftwareLevelsMK1To12, original.totalSoftwareLevelsMK1To12);
  }
  assert.equal(migrateGameDisplayInputs({ ...software, [SOFTWARE_EXTRA_KEY]: "5", totalSoftwareLevelsMK1To12: "100" }).values[SOFTWARE_EXTRA_KEY], undefined);
});

test("existing native anchors migrate across numeric formatting and only post-input free progress is added", () => {
  const profile = { cradleRank: "1000", cradleCrew: "50", loopsFilled: "100" };
  const baseline = state({ EU1: 2, EU2: 4, DU1: 7 });
  const old = { gameCradleRank: "1k", gameCradleCrew: "50", currentLoopsDone: "100" };
  const anchors = restoreGameDisplayAnchors(JSON.parse(JSON.stringify(reconcileGameDisplayAnchors({}, old, baseline))));
  const after = state({ EU1: 3, EU2: 5, DU1: 8 });
  const migrated = reconcileGameDisplayAnchors(anchors, profile, after);
  const effective = deriveGameDisplayProfile(profile, after, migrated);
  assert.equal(effective.cradleRank, "1008");
  assert.equal(effective.cradleCrew, "51");
  assert.equal(effective.loopsFilled, "101");
  assert.equal(profile.cradleRank, "1000");
  assert.equal(deriveGameDisplayProfile(profile, baseline, migrated).cradleRank, "1000");
  const preview = compareGameEffects("EU1", baseline, profile).find(row => row.target === "allGenerators");
  assert.equal(compareGameEffects("EU1", after, effective).find(row => row.target === "allGenerators").currentExact, preview.nextExact);
  const changed = { ...profile, cradleRank: "2000" };
  assert.equal(deriveGameDisplayProfile(changed, after, reconcileGameDisplayAnchors(migrated, changed, after)).cradleRank, "2000");
});

test("missing-field feedback names the visible original controls or the precise missing Software component", () => {
  const row = compareGameEffects("E03", state({ E03: 1 }), { cradleRank: "", gameCradleRank: "100" })[0];
  assert.equal(row.missingInput, "cradleRank");
  assert.equal(getInputFieldLabel(row.missingInput, "ko"), "Cradle 랭크");
  assert.equal(getInputFieldLabel("currentLoopsDone", "ko"), "Loop Filled");
  assert.equal(getInputFieldLabel("softwareTechMk3", "en"), "MK3 Software Tech");
  assert.equal(getInputFieldLabel(SOFTWARE_EXTRA_KEY, "ko"), "Software Tech 합계 (MK9–12)");
});
