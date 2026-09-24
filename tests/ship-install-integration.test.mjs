import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { commitInputEdit, restoreCalculationProfile } from "../app/content/inputProfile.ts";
import { DEFAULT_WEIGHT_VALUES, commitWeightPreset, storeWeightPreset } from "../app/content/weightPresets.ts";
import { SHIPS, INSTALL_ROWS, getShipInstalls } from "../lib/cifi/ship-install/catalog.ts";
import { SHIP_INSTALL_EXTRA_FIELDS, shipProfileKey } from "../lib/cifi/ship-install/profile.ts";
import { INSTALL_RECOMMENDATION_MODES, rankInstalls, generateSequence, validateInstallSequence, aggregateEffects } from "../lib/cifi/ship-install/engine.ts";
import {
  createDefaultShipInstallState, updateShipInstallInput, saveShipInstallLoadout,
  selectShipInstallLoadout, serializeShipInstallState, restoreShipInstallState,
  fingerprintShipInstallContext, isShipLoadoutStale,
} from "../lib/cifi/ship-install/persistence.ts";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const shipFields = SHIPS.flatMap(ship => ["Rank", "Crew"].map(field => ({ key: shipProfileKey(ship.id, field), kind: "integer" })));
const fields = [...Object.keys(DEFAULT_WEIGHT_VALUES).map(key => ({ key, kind: "positive" })), ...shipFields, ...SHIP_INSTALL_EXTRA_FIELDS.map(field => ({ key: field.key, kind: "short" }))];
const defaults = { ...DEFAULT_WEIGHT_VALUES, ...Object.fromEntries(shipFields.map(field => [field.key, ""])) };
const profile = {
  ...defaults, demeterCrew: "100", demeterRank: "37", operationsDone: "100",
  studiesDone: "10", loopsFilled: "10", loopResets: "10", totalResearchLevels: "10", completedResearches: "5",
  ...Object.fromEntries(Array.from({ length: 8 }, (_, index) => [`manualMk${index + 1}`, "100"])),
};
const context = values => ({ ship: "Demeter", levels: {}, totalPoints: 8, mode: "weights", profile: values });

test("release version is consistently v0.4", async () => {
  const [page, packageText, lockText] = await Promise.all([read("app/page.tsx"), read("package.json"), read("package-lock.json")]);
  const pkg = JSON.parse(packageText), lock = JSON.parse(lockText);
  assert.match(page, /const APP_VERSION = "v0\.4"/);
  assert.equal(pkg.version, "0.4.0");
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[""].version, pkg.version);
});

test("Ship Install reuses shared player fields and calculation values instead of a duplicate profile", async () => {
  const [page, view] = await Promise.all([read("app/page.tsx"), read("features/ship-install/ShipInstall.tsx")]);
  assert.match(page, /const allFields = \[\.\.\.weightFields, \.\.\.playerFields, \.\.\.shipFields, \.\.\.shipExtraFields\]/);
  assert.match(page, /<ShipInstall[^>]*profile=\{saved\}[^>]*draft=\{draft\}[^>]*onInput=\{updateValue\}/);
  assert.doesNotMatch(page, /renderShipProgress\(\)/, "the old separate ship input panel must not remain mounted");
  assert.match(view, /onInput\(`\$\{ship\.toLowerCase\(\)\}Rank`, event\.target\.value\)/);
  assert.match(view, /onInput\(`\$\{ship\.toLowerCase\(\)\}Crew`, event\.target\.value\)/);
  assert.doesNotMatch(view, /mtc-weight-presets|mtc-inputs\.v1/);
  assert.equal(shipFields.length, 14);
  for (const ship of SHIPS) {
    let stored;
    const key = shipProfileKey(ship.id, "Crew");
    const edited = commitInputEdit(defaults, defaults, key, "204", fields, DEFAULT_WEIGHT_VALUES, "preset-a", payload => { stored = payload; });
    assert.equal(edited.saved[key], "204");
    const restored = restoreCalculationProfile(stored.values, stored.calculationValues, defaults, fields, DEFAULT_WEIGHT_VALUES);
    assert.equal(restored[key], "204");
  }
});

test("weight preset switches change Ship recommendation scores but never Ship progress or saved Loadouts", () => {
  const originalContext = context(profile);
  const recommendedBefore = rankInstalls(originalContext);
  const sequence = generateSequence(originalContext, 8);
  assert.equal(sequence.errors.length, 0);
  assert.ok(sequence.steps.length > 0);
  assert.deepEqual(validateInstallSequence(originalContext, sequence.steps), []);
  const originalFingerprint = fingerprintShipInstallContext(originalContext);
  let state = updateShipInstallInput(createDefaultShipInstallState(), "Demeter", "totalPoints", "8");
  state = saveShipInstallLoadout(state, "Demeter", 1, {
    ...sequence, mode: "weights", totalPoints: 8, evolution: 0, capExpanded: false,
    contextFingerprint: originalFingerprint, savedAt: "2026-09-20T12:00:00.000Z",
  });
  const slotBefore = structuredClone(state.ships.Demeter.loadouts[1]);
  const switched = commitWeightPreset(profile, profile, { ...DEFAULT_WEIGHT_VALUES, cells: "1000" }, DEFAULT_WEIGHT_VALUES, "cells", () => {});
  assert.equal(switched.saved.demeterRank, "37");
  assert.equal(switched.saved.demeterCrew, "100");
  assert.notEqual(rankInstalls(context(switched.saved))[0].position, recommendedBefore[0].position);
  const newFingerprint = fingerprintShipInstallContext(context(switched.saved));
  assert.equal(isShipLoadoutStale(state.ships.Demeter.loadouts[1], newFingerprint), true);
  state = selectShipInstallLoadout(state, "Demeter", 2);
  state = selectShipInstallLoadout(state, "Demeter", 1);
  assert.deepEqual(state.ships.Demeter.loadouts[1], slotBefore);
  const restored = restoreShipInstallState(serializeShipInstallState(state));
  assert.equal(restored.status, "restored");
  assert.deepEqual(restored.state.ships.Demeter.loadouts[1], slotBefore);
  const library = storeWeightPreset([], "cells", "Cells", switched.draft, DEFAULT_WEIGHT_VALUES, "2026-09-20T12:00:00.000Z", () => {});
  assert.deepEqual(Object.keys(library[0].values).sort(), Object.keys(DEFAULT_WEIGHT_VALUES).sort());
  assert.equal(library[0].values.demeterCrew, undefined);
});

test("shared incomplete crew edits stay durable while prior valid effects remain calculable", () => {
  let payload;
  const edited = commitInputEdit(profile, profile, "demeterCrew", "1e", fields, DEFAULT_WEIGHT_VALUES, "preset-a", saved => { payload = saved; });
  assert.equal(payload.values.demeterCrew, "1e");
  assert.equal(payload.calculationValues.demeterCrew, "100");
  assert.deepEqual(rankInstalls(context(edited.saved)).map(row => [row.position, row.score]), rankInstalls(context(profile)).map(row => [row.position, row.score]));
});

test("generated targets expose newly purchased resources independently of baseline aggregate order", () => {
  const base = context(profile);
  const sequence = generateSequence(base, 8);
  const current = aggregateEffects(base);
  const target = aggregateEffects({ ...base, levels: sequence.targetLevels });
  assert.equal(current.length, 0);
  assert.ok(target.length > 0, "effects UI must union current and target resource keys, not map only current effects");
  for (const row of target) {
    assert.equal(typeof row.display, "string");
    assert.equal(row.currentDisplay, undefined, "aggregate contract uses display, unlike next-level effect cards");
  }
});

test("approved game node arrangement and exactly five recommendation modes remain stable", async () => {
  assert.deepEqual(INSTALL_ROWS, [[8, 4, 6, 9], [2, 1, 3], [10, 7, 5, 11]]);
  assert.deepEqual(INSTALL_RECOMMENDATION_MODES.map(mode => mode.id), ["mp", "shards-research", "shards", "research", "weights"]);
  assert.equal(SHIPS.length, 7);
  for (const ship of SHIPS) assert.equal(getShipInstalls(ship.id).length, 11);
  const view = await read("features/ship-install/ShipInstall.tsx");
  for (const label of ["MP 위주", "Shard / RP 위주", "Shard 위주", "RP 위주", "가중치 프리셋 사용"]) assert.ok(view.includes(label));
  for (const className of ["si-side", "si-recommendations", "si-detail", "si-queue"]) assert.ok(view.includes(className));
  assert.doesNotMatch(view, /코너 Install 해금|목표 배분 비교|가중치 프리셋과는 별도/);
});
