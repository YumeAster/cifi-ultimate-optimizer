import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SHIP_INSTALL_STORAGE_KEY, SHIP_INSTALL_SHIPS, SHIP_INSTALL_SLOTS,
  MAX_SAVED_SHIP_STEPS, MAX_SHIP_INSTALL_STORAGE_LENGTH,
  createDefaultShipInstallState, restoreShipInstallState, serializeShipInstallState,
  readShipInstallState, commitShipInstallState, parseShipInstallInteger,
  updateShipInstallInput, updateShipInstallWorkspace, setShipInstallLevels,
  selectShipInstallShip, selectShipInstallLoadout, saveShipInstallLoadout, isShipLoadoutStale, fingerprintShipInstallContext,
} from "../lib/cifi/ship-install/persistence.ts";
import { SHIP_MAX_EVOLUTION } from "../lib/cifi/ship-install/catalog.ts";

const levels = (values = {}) => ({ ...Object.fromEntries(Array.from({ length: 11 }, (_, index) => [index + 1, 0])), ...values });
function plan(overrides = {}) {
  return {
    baselineLevels: levels({ 5: 1 }), targetLevels: levels({ 5: 2, 6: 1 }),
    steps: [
      { index: 1, position: 6, from: 0, to: 1, reason: "weighted", score: 0.3 },
      { index: 2, position: 5, from: 1, to: 2, reason: "auxiliary", score: 0.2 },
    ],
    mode: "weights", totalPoints: 10, evolution: 0, capExpanded: false,
    contextFingerprint: "profile-v1/weights-v1", savedAt: "2026-09-20T12:00:00.000Z",
    ...overrides,
  };
}

test("defaults allocate independent 7 x 3 fixed slots and complete level maps", () => {
  const state = createDefaultShipInstallState();
  assert.equal(state.version, 1);
  assert.equal(state.selectedShip, "Cradle");
  assert.equal(SHIP_INSTALL_SHIPS.length, 7);
  for (const ship of SHIP_INSTALL_SHIPS) {
    assert.deepEqual(Object.keys(state.ships[ship].loadouts), ["1", "2", "3"]);
    assert.equal(Object.keys(state.ships[ship].levels).length, 11);
    assert.ok(SHIP_INSTALL_SLOTS.every(slot => state.ships[ship].loadouts[slot] === null));
  }
  assert.notEqual(state.ships.Cradle.levels, state.ships.Auxesia.levels);
  assert.notEqual(state.ships.Cradle.loadouts, state.ships.Auxesia.loadouts);
  assert.deepEqual(restoreShipInstallState(serializeShipInstallState(state)), { state, status: "restored", issues: [] });
});

test("valid edits, selected ship and mode survive serialization without leaking to other ships", () => {
  const initial = createDefaultShipInstallState();
  let state = updateShipInstallInput(initial, "Zagreus", 4, "12");
  state = updateShipInstallInput(state, "Zagreus", "totalPoints", "103");
  state = updateShipInstallInput(state, "Zagreus", "evolution", "3");
  state = updateShipInstallWorkspace(state, "Zagreus", { mode: "mp", excluded: [11, 1, 11], capExpanded: true });
  state = selectShipInstallShip(state, "Zagreus");
  state = selectShipInstallLoadout(state, "Zagreus", 3);
  const restored = restoreShipInstallState(serializeShipInstallState(state));
  assert.equal(restored.status, "restored");
  assert.equal(restored.state.ships.Zagreus.levels[4], 12);
  assert.equal(restored.state.ships.Zagreus.totalPoints, 103);
  assert.equal(restored.state.ships.Zagreus.evolution, 3);
  assert.equal(restored.state.ships.Zagreus.selectedSlot, 3);
  assert.equal(restored.state.ships.Zagreus.mode, "mp");
  assert.equal(restored.state.ships.Zagreus.capExpanded, true);
  assert.deepEqual(restored.state.ships.Zagreus.excluded, [1, 11]);
  assert.deepEqual(restored.state.ships.Cradle, initial.ships.Cradle);
  assert.equal(initial.ships.Zagreus.levels[4], 0);
});

test("evolution inputs enforce each ship cap and repair legacy 7-stage values", () => {
  let state = createDefaultShipInstallState();
  for (const ship of SHIP_INSTALL_SHIPS) {
    const cap = SHIP_MAX_EVOLUTION[ship];
    state = updateShipInstallInput(state, ship, "evolution", String(cap));
    assert.equal(state.ships[ship].evolution, cap);
    state = updateShipInstallInput(state, ship, "evolution", String(cap + 1));
    assert.equal(state.ships[ship].evolution, cap);
    assert.equal(state.ships[ship].draftEvolution, String(cap + 1));
  }
  const raw = JSON.parse(serializeShipInstallState(createDefaultShipInstallState()));
  raw.ships.Demeter.evolution = 7;
  raw.ships.Demeter.draftEvolution = "7";
  const restored = restoreShipInstallState(raw);
  assert.equal(restored.status, "repaired");
  assert.equal(restored.state.ships.Demeter.evolution, 3);
  assert.equal(restored.state.ships.Demeter.draftEvolution, "3");
});

test("incomplete/invalid raw input remains durable but does not enter calculation levels", () => {
  let state = updateShipInstallInput(createDefaultShipInstallState(), "Cradle", 1, "23");
  state = updateShipInstallInput(state, "Cradle", "totalPoints", "100");
  state = updateShipInstallInput(state, "Cradle", "evolution", "4");
  for (const bad of ["-1", "1.5", "1e4", "Infinity", "9007199254740992", "NaN", "1,234", "n/a"]) {
    state = updateShipInstallInput(state, "Cradle", 1, bad);
    const restored = restoreShipInstallState(serializeShipInstallState(state));
    assert.equal(restored.status, "restored");
    assert.equal(restored.state.ships.Cradle.levels[1], 23);
    assert.equal(restored.state.ships.Cradle.draftLevels[1], bad);
  }
  state = updateShipInstallInput(state, "Cradle", "totalPoints", "-2");
  state = updateShipInstallInput(state, "Cradle", "evolution", "8");
  const restored = restoreShipInstallState(serializeShipInstallState(state)).state;
  assert.equal(restored.ships.Cradle.totalPoints, 100);
  assert.equal(restored.ships.Cradle.draftTotalPoints, "-2");
  assert.equal(restored.ships.Cradle.evolution, 4);
  assert.equal(restored.ships.Cradle.draftEvolution, "8");
  assert.equal(parseShipInstallInteger(""), 0);
  assert.equal(parseShipInstallInteger(" 004 "), 4);
});

test("all fixed slots store independent plans and selection never rewrites actual progress", () => {
  let state = setShipInstallLevels(createDefaultShipInstallState(), "Cradle", levels({ 2: 12 }));
  state = updateShipInstallInput(state, "Cradle", "totalPoints", "80");
  for (const slot of SHIP_INSTALL_SLOTS) state = saveShipInstallLoadout(state, "Cradle", slot, plan({ contextFingerprint: `slot-${slot}` }));
  state = saveShipInstallLoadout(state, "Auxesia", 1, plan({ mode: "research", contextFingerprint: "auxesia" }));
  for (const slot of SHIP_INSTALL_SLOTS) {
    state = selectShipInstallLoadout(state, "Cradle", slot);
    assert.equal(state.ships.Cradle.loadouts[slot].contextFingerprint, `slot-${slot}`);
    assert.deepEqual(state.ships.Cradle.levels, levels({ 2: 12 }));
    assert.equal(state.ships.Cradle.totalPoints, 80);
    assert.equal(state.ships.Cradle.mode, "weights");
  }
  assert.equal(state.ships.Auxesia.loadouts[1].mode, "research");
  assert.equal(state.ships.Auxesia.loadouts[2], null);
  assert.throws(() => selectShipInstallLoadout(state, "Cradle", 4), /slot/);
  assert.throws(() => saveShipInstallLoadout(state, "Cradle", 0, plan()), /slot/);
});

test("saved plans clone queue and level maps and only explicit saves update them", () => {
  const candidate = plan();
  let state = saveShipInstallLoadout(createDefaultShipInstallState(), "Cradle", 1, candidate);
  const original = JSON.stringify(state.ships.Cradle.loadouts[1]);
  candidate.baselineLevels[5] = 99;
  candidate.targetLevels[5] = 999;
  candidate.steps[0].position = 11;
  state = updateShipInstallWorkspace(state, "Cradle", { mode: "mp" });
  state = updateShipInstallInput(state, "Cradle", 7, "4");
  assert.equal(JSON.stringify(state.ships.Cradle.loadouts[1]), original);
  assert.equal(isShipLoadoutStale(state.ships.Cradle.loadouts[1], "new-profile"), true);
  assert.equal(isShipLoadoutStale(state.ships.Cradle.loadouts[1], "profile-v1/weights-v1"), false);
  assert.equal(isShipLoadoutStale(null, "new-profile"), false);
});

test("Ship Loadouts never serialize, apply or merge shared player inputs/weight presets", () => {
  const state = createDefaultShipInstallState();
  const input = { ...state, weights: { modPoints: 999 }, weightPresetId: "secret-slot", player: { cradleRank: "900", cradleCrew: "1000" } };
  input.ships.Cradle = { ...input.ships.Cradle, rank: 900, crew: 1000, weights: { modPoints: 999 } };
  const restored = restoreShipInstallState(input).state;
  const saved = serializeShipInstallState(restored);
  for (const key of ["weightPresetId", "modPoints", "cradleRank", "cradleCrew", '"rank"', '"crew"']) assert.equal(saved.includes(key), false);
  assert.notEqual(SHIP_INSTALL_STORAGE_KEY, "cifi-orbit.mtc-weight-presets.v1");
  assert.notEqual(SHIP_INSTALL_STORAGE_KEY, "cifi-orbit.mtc-inputs.v1");
});

test("corrupt JSON, unsupported versions and unavailable storage are visibly failed", () => {
  assert.equal(restoreShipInstallState(null).status, "empty");
  assert.equal(restoreShipInstallState("{").status, "failed");
  assert.equal(restoreShipInstallState("[]").status, "failed");
  assert.equal(restoreShipInstallState({ version: 2, ships: {} }).status, "failed");
  assert.equal(restoreShipInstallState(" ".repeat(MAX_SHIP_INSTALL_STORAGE_LENGTH + 1)).status, "failed");
  const readFailure = readShipInstallState(() => { throw new Error("SecurityError"); });
  assert.equal(readFailure.status, "failed");
  assert.ok(readFailure.issues.length);
  assert.throws(() => commitShipInstallState(createDefaultShipInstallState(), () => { throw new Error("QuotaExceededError"); }), /QuotaExceededError/);
  let payload;
  const state = createDefaultShipInstallState();
  assert.equal(commitShipInstallState(state, value => { payload = value; }), state);
  assert.equal(restoreShipInstallState(payload).status, "restored");
});

test("repair preserves valid ships/slots while reporting malformed fields", () => {
  let state = saveShipInstallLoadout(createDefaultShipInstallState(), "Cradle", 1, plan());
  state = updateShipInstallInput(state, "Zagreus", 3, "9");
  const raw = JSON.parse(serializeShipInstallState(state));
  raw.selectedShip = "__proto__";
  raw.ships.Cradle.loadouts[2] = { ...plan(), steps: [{ position: 1, from: 0, to: 10 }] };
  raw.ships.Cradle.loadouts[4] = plan();
  raw.ships.Koios.levels[4] = -1;
  raw.ships.Koios.draftLevels[4] = "bad";
  raw.ships.Koios.totalPoints = Number.MAX_SAFE_INTEGER + 1;
  raw.ships.Koios.draftTotalPoints = "bad";
  raw.ships.Koios.excluded = [1, 1, 12, -1, "2", 3];
  raw.ships.Koios.mode = "invalid";
  raw.ships.Zeus.draftTotalPoints = "9".repeat(129);
  raw.ships.Zeus.draftEvolution = { invalid: true };
  const restored = restoreShipInstallState(raw);
  assert.equal(restored.status, "repaired");
  assert.ok(restored.issues.length > 0);
  assert.equal(restored.state.ships.Zagreus.levels[3], 9);
  assert.deepEqual(restored.state.ships.Cradle.loadouts[1], plan());
  assert.equal(restored.state.ships.Cradle.loadouts[2], null);
  assert.deepEqual(Object.keys(restored.state.ships.Cradle.loadouts), ["1", "2", "3"]);
  assert.equal(restored.state.ships.Koios.levels[4], 0);
  assert.equal(restored.state.ships.Koios.totalPoints, 0);
  assert.deepEqual(restored.state.ships.Koios.excluded, [1, 3]);
  assert.equal(restored.state.ships.Zeus.draftTotalPoints, "0");
  assert.equal(restored.state.ships.Zeus.draftEvolution, "0");
});

test("restore only copies whitelisted own properties and never prototype payloads", () => {
  const defaults = createDefaultShipInstallState();
  const malicious = JSON.parse(serializeShipInstallState(defaults));
  malicious.ships.Cradle.levels = JSON.parse('{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},"1":8}');
  malicious.ships.Cradle.draftLevels = { 1: "8" };
  const raw = JSON.stringify(malicious).replace('"ships":{', '"__proto__":{"polluted":true},"ships":{"__proto__":{"polluted":true},');
  const restored = restoreShipInstallState(raw);
  assert.equal({}.polluted, undefined);
  assert.equal(restored.state.polluted, undefined);
  assert.equal(restored.state.ships.Cradle.levels[1], 8);
  assert.equal(Object.hasOwn(restored.state.ships.Cradle.levels, "__proto__"), false);
  const inherited = Object.create({ version: 1, ships: defaults.ships });
  assert.equal(restoreShipInstallState(inherited).status, "failed");
});

test("queues must replay exactly and are rejected instead of silently truncated", () => {
  const initial = createDefaultShipInstallState();
  const badPlans = [
    plan({ targetLevels: levels({ 5: 5 }) }),
    plan({ totalPoints: 1 }),
    plan({ steps: [{ ...plan().steps[0], index: 0 }, plan().steps[1]] }),
    plan({ steps: [{ ...plan().steps[0], from: 2 }, plan().steps[1]] }),
    plan({ steps: [{ ...plan().steps[0], to: 2 }, plan().steps[1]] }),
    plan({ steps: [{ ...plan().steps[0], score: Infinity }, plan().steps[1]] }),
    plan({ steps: [{ ...plan().steps[0], reason: "unknown" }, plan().steps[1]] }),
    plan({ contextFingerprint: "" }), plan({ savedAt: "not a date" }),
    plan({ steps: Array.from({ length: MAX_SAVED_SHIP_STEPS + 1 }, (_, index) => ({ index: index + 1, position: 1, from: index, to: index + 1, reason: "weighted", score: 1 })) }),
  ];
  for (const candidate of badPlans) assert.throws(() => saveShipInstallLoadout(initial, "Cradle", 1, candidate), /Invalid or oversized/);
  const empty = plan({ baselineLevels: levels(), targetLevels: levels(), steps: [] });
  assert.equal(saveShipInstallLoadout(initial, "Cradle", 1, empty).ships.Cradle.loadouts[1].steps.length, 0);
});

test("update API blocks invalid ships, positions, unsupported values and excessive raw input", () => {
  const state = createDefaultShipInstallState();
  assert.throws(() => selectShipInstallShip(state, "Unknown"), /Unknown/);
  assert.throws(() => updateShipInstallInput(state, "Cradle", 0, "1"), /position/);
  assert.throws(() => updateShipInstallInput(state, "Cradle", 12, "1"), /position/);
  assert.throws(() => updateShipInstallInput(state, "Cradle", 1, "2".repeat(129)), /Invalid/);
  assert.throws(() => updateShipInstallInput(state, "Cradle", "weights", "2"), /Unknown/);
  assert.throws(() => updateShipInstallWorkspace(state, "Cradle", { excluded: [-1] }), /exclusions/);
  assert.throws(() => updateShipInstallWorkspace(state, "Cradle", { mode: "unknown" }), /mode/);
  assert.throws(() => updateShipInstallWorkspace(state, "Cradle", { capExpanded: "true" }), /cap/);
  assert.throws(() => setShipInstallLevels(state, "Cradle", levels({ 1: -1 })), /levels/);
});

test("context fingerprints sort object keys but preserve values and ordered arrays", () => {
  const initial = { ship: "Cradle", levels: levels({ 5: 2 }), profile: { research: "8", cells: "1", cradleCrew: "300" }, mode: "weights", excluded: [1, 3], modTotal: 100 };
  const reordered = { modTotal: 100, excluded: [1, 3], profile: { cradleCrew: "300", cells: "1", research: "8" }, mode: "weights", levels: Object.fromEntries(Object.entries(initial.levels).reverse()), ship: "Cradle" };
  const fingerprint = fingerprintShipInstallContext(initial);
  assert.equal(fingerprint, fingerprintShipInstallContext(reordered));
  assert.ok(fingerprint.length < 2_048);
  for (const change of [
    { profile: { ...initial.profile, research: "9" } }, { levels: levels({ 5: 3 }) },
    { excluded: [3, 1] }, { modTotal: 101 }, { mode: "mp" },
  ]) assert.notEqual(fingerprint, fingerprintShipInstallContext({ ...initial, ...change }));
  const cyclic = {}; cyclic.self = cyclic;
  assert.throws(() => fingerprintShipInstallContext(cyclic), /cycles/);
  assert.throws(() => fingerprintShipInstallContext({ bad: Infinity }), /finite/);
  assert.throws(() => fingerprintShipInstallContext("x".repeat(100_001)), /large/);
});
