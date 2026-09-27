import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buyShipInstallLevel, applyShipInstallRecommendation } from "../lib/cifi/ship-install/actions.ts";
import { getShipInstalls } from "../lib/cifi/ship-install/catalog.ts";
import { createDefaultShipInstallState, updateShipInstallInput, selectShipInstallLoadout, serializeShipInstallState, restoreShipInstallState, undoShipInstallPurchase, resetShipInstallLoadout, saveShipInstallLoadout, renameShipInstallLoadout } from "../lib/cifi/ship-install/persistence.ts";

const ship = "Cradle";
const context = state => ({ ship, levels: state.ships[ship].levels, totalPoints: state.ships[ship].totalPoints,
  profile: {}, mode: "weights", excluded: [], capExpanded: false });
const levels = () => Object.fromEntries(getShipInstalls(ship).map(node => [node.position, 0]));
const initial = points => updateShipInstallInput(createDefaultShipInstallState(), ship, "totalPoints", String(points));
const plan = () => ({ baselineLevels: levels(), targetLevels: { ...levels(), 1: 2 },
  steps: [{ index: 1, position: 1, from: 0, to: 1, reason: "weighted", score: 1 },
    { index: 2, position: 1, from: 1, to: 2, reason: "weighted", score: 1 }],
  spent: 2, remaining: 1, stopped: "no-candidate", warnings: [], errors: [], strategy: "marginal-greedy-with-unlock-lookahead" });

test("double-click purchase and Buy button can share one game-rule action", () => {
  let state = initial(2);
  assert.equal(buyShipInstallLevel(state, context(state), 2), null, "locked Install must not be purchased");
  state = buyShipInstallLevel(state, context(state), 1);
  assert.equal(state.ships[ship].levels[1], 1);
  assert.equal(state.ships[ship].draftLevels[1], "1");
  state = buyShipInstallLevel(state, context(state), 1);
  assert.equal(state.ships[ship].levels[1], 2);
  assert.equal(buyShipInstallLevel(state, context(state), 1), null, "no remaining point");
  assert.equal(restoreShipInstallState(serializeShipInstallState(state)).state.ships[ship].levels[1], 2);
  const maxed = updateShipInstallInput(initial(251), ship, 1, "250");
  assert.equal(buyShipInstallLevel(maxed, context(maxed), 1), null, "cap remains enforced even with spare points");
});

test("bulk apply commits every generated step at once and refuses stale or forged plans", () => {
  const state = initial(3);
  const recommended = plan();
  const applied = applyShipInstallRecommendation(state, context(state), recommended);
  assert.equal(state.ships[ship].levels[1], 0, "the original state remains unchanged");
  assert.equal(applied.ships[ship].levels[1], 2);
  assert.equal(applied.ships[ship].draftLevels[1], "2");
  assert.equal(applied.ships[ship].totalPoints, 3);
  assert.equal(restoreShipInstallState(serializeShipInstallState(applied)).state.ships[ship].levels[1], 2);
  const savedShape = { baselineLevels: recommended.baselineLevels, targetLevels: recommended.targetLevels, steps: recommended.steps };
  assert.equal(applyShipInstallRecommendation(state, context(state), savedShape).ships[ship].levels[1], 2, "a freshly saved Loadout can also be applied");
  assert.throws(() => applyShipInstallRecommendation(applied, context(applied), recommended), /no longer current/);
  assert.throws(() => applyShipInstallRecommendation(state, context(state), { ...recommended, targetLevels: { ...levels(), 1: 3 } }), /does not match/);
  assert.throws(() => applyShipInstallRecommendation(state, context(state), { ...recommended, steps: [{ ...recommended.steps[0], position: 2 }] }), /구매|레벨/);
  assert.throws(() => applyShipInstallRecommendation(state, context(state), { ...recommended, errors: ["invalid"] }), /no longer current/);
});

test("bulk apply and manual purchase change only the selected Loadout", () => {
  let state = applyShipInstallRecommendation(initial(3), context(initial(3)), plan());
  state = selectShipInstallLoadout(state, ship, 2);
  assert.equal(state.ships[ship].levels[1], 0);
  state = buyShipInstallLevel(state, context(state), 1);
  assert.equal(state.ships[ship].levels[1], 1);
  state = selectShipInstallLoadout(state, ship, 3);
  assert.equal(state.ships[ship].levels[1], 0);
  state = restoreShipInstallState(serializeShipInstallState(state)).state;
  state = selectShipInstallLoadout(state, ship, 1);
  assert.equal(state.ships[ship].levels[1], 2);
  state = selectShipInstallLoadout(state, ship, 2);
  assert.equal(state.ships[ship].levels[1], 1);
});

test("Undo removes one latest purchase, including the last bulk step, only in the selected slot", () => {
  let state = applyShipInstallRecommendation(initial(3), context(initial(3)), plan());
  assert.deepEqual(state.ships[ship].slotPurchaseHistory[1], [1, 1]);
  state = selectShipInstallLoadout(state, ship, 2);
  state = buyShipInstallLevel(state, context(state), 1);
  state = undoShipInstallPurchase(state, ship);
  assert.equal(state.ships[ship].levels[1], 0);
  assert.equal(undoShipInstallPurchase(state, ship), null);
  state = selectShipInstallLoadout(state, ship, 1);
  state = undoShipInstallPurchase(state, ship);
  assert.equal(state.ships[ship].levels[1], 1);
  assert.deepEqual(state.ships[ship].slotPurchaseHistory[1], [1]);
  state = restoreShipInstallState(serializeShipInstallState(state)).state;
  assert.deepEqual(state.ships[ship].slotPurchaseHistory[1], [1]);
});

test("direct level edit clears Undo history; reset clears only selected slot allocation and saved plan", () => {
  let state = applyShipInstallRecommendation(initial(3), context(initial(3)), plan());
  state = selectShipInstallLoadout(state, ship, 2);
  state = buyShipInstallLevel(state, context(state), 1);
  state = renameShipInstallLoadout(state, ship, 2, "Cells focus");
  const recommended = plan();
  state = saveShipInstallLoadout(state, ship, 2, { ...recommended, mode: "weights", totalPoints: 3, evolution: 0, capExpanded: false, contextFingerprint: "test", savedAt: "2026-09-27T00:00:00.000Z" });
  state = updateShipInstallInput(state, ship, 1, "2");
  assert.equal(undoShipInstallPurchase(state, ship), null);
  state = resetShipInstallLoadout(state, ship);
  assert.equal(state.ships[ship].levels[1], 0);
  assert.equal(state.ships[ship].loadouts[2], null);
  assert.equal(state.ships[ship].loadoutNames[2], "Cells focus");
  state = selectShipInstallLoadout(state, ship, 1);
  assert.equal(state.ships[ship].levels[1], 2);
  assert.deepEqual(state.ships[ship].slotPurchaseHistory[1], [1, 1]);
});

test("Ship Install UI exposes double-click and fresh-recommendation bulk controls", async () => {
  const view = await readFile(new URL("../features/ship-install/ShipInstall.tsx", import.meta.url), "utf8");
  assert.match(view, /onDoubleClick=\{event => \{ event\.preventDefault\(\); buy\(position\); \}\}/);
  assert.match(view, /onClick=\{\(\) => buy\(detail\.position\)\}/);
  assert.match(view, /추천 일괄 적용/);
  assert.match(view, /applyShipInstallRecommendation\(stateRef\.current, context, plan\)/);
});
