import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateUpgrade,
  isUpgradeUnlocked,
  nextCost,
  nextCostExact,
  parseCifiNumber,
  rankUpgrades,
  simulateBudget,
  weightedPower,
} from "../lib/cifi/upgrades/engine.ts";
import {
  DIAMOND_UPGRADES,
  TOKEN_UPGRADES,
  UPGRADE_RULESET_META,
} from "../lib/cifi/upgrades/rules.ts";
import {
  getGeneratorPresentation,
  getUpgradeVisualResources,
  UPGRADE_RESOURCE_PRESENTATION,
} from "../features/upgrade-optimizer/resourcePresentation.ts";

const zeroWeights = Object.freeze({ cells: 0, modPoints: 0, shards: 0, research: 0, academyPoints: 0, materials: 0 });
const unitWeights = Object.freeze({ cells: 1, modPoints: 1, shards: 1, research: 1, academyPoints: 1, materials: 1 });

function state(overrides = {}) {
  return {
    levels: { diamond: {}, token: {} },
    generators: {},
    ships: {},
    longRunHours: 0,
    ...overrides,
  };
}

function rule(catalog, id) {
  const found = catalog.find((candidate) => candidate.id === id);
  assert.ok(found, `missing test rule ${id}`);
  return found;
}

function closeTo(actual, expected, tolerance = 1e-12) {
  assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);
}

test("catalogs preserve the normalized 46/23 worksheet order", () => {
  assert.equal(DIAMOND_UPGRADES.length, 46);
  assert.equal(TOKEN_UPGRADES.length, 23);
  assert.equal(UPGRADE_RULESET_META.compatibility, "corrected");
  assert.equal(UPGRADE_RULESET_META.preservesLegacyBudgetBug, false);
  assert.deepEqual(DIAMOND_UPGRADES.map(({ id }) => id), [
    "MK1", "MK2", "MK3", "MK4", "MK5", "MK6", "MK7", "MK8",
    "Tokens", "Cells", "Mods", "Shards", "Research", "Academy", "AllGens", "Mats",
    "Alpha", "Beta", "Ceti", "Delta", "Epsilon", "Fenix", "Gamma", "Helion", "Ixion", "Juno", "Kappa", "Lyra",
    "Miko", "Nora", "Omega", "Pegasus", "Qoru", "Rigel", "Sigma", "Typhon", "Utopia", "Vex", "Xeno", "Zion",
    "Andromeda", "Beerus", "Centurion", "Dahl", "Elyisium", "Ferrick",
  ]);
  assert.deepEqual(TOKEN_UPGRADES.map(({ id }) => id), [
    "Token", "Diamond", "Cells", "Mods", "MK1", "MK2", "MK3", "MK4", "MK5", "MK6", "MK7", "MK8",
    "Token2", "Daily", "MPSH", "MK1MK2", "MK3MK4", "MK5MK6", "MK7MK8", "Token3", "Daily2", "GMPRP", "GSHAP",
  ]);
  assert.deepEqual(DIAMOND_UPGRADES.map(({ order }) => order), [...Array(46).keys()]);
  assert.deepEqual(TOKEN_UPGRADES.map(({ order }) => order), [...Array(23).keys()]);
});

test("upgrade presentation maps Generator and resource effects before currency styling", () => {
  assert.deepEqual(getUpgradeVisualResources(rule(DIAMOND_UPGRADES, "MK1")), ["generator"]);
  assert.equal(UPGRADE_RESOURCE_PRESENTATION.generator.accent, "#36d9d0");
  assert.equal(UPGRADE_RESOURCE_PRESENTATION.generator.icon, "./assets/resources/generator.png");
  assert.equal(UPGRADE_RESOURCE_PRESENTATION.diamond.icon, "./assets/resources/diamonds.png");
  assert.equal(UPGRADE_RESOURCE_PRESENTATION.token.label, "AD Tokens");
  assert.equal(UPGRADE_RESOURCE_PRESENTATION.token.icon, "./assets/resources/ad-tokens.png");
  assert.equal(UPGRADE_RESOURCE_PRESENTATION.arcadePoints.icon, "./assets/resources/arcade-points.png");
  assert.equal(UPGRADE_RESOURCE_PRESENTATION.materials.label, "Materials");
  assert.equal(UPGRADE_RESOURCE_PRESENTATION.materials.icon, "./assets/resources/materials.png");
  assert.equal(UPGRADE_RESOURCE_PRESENTATION.materials.accent, "#a96f5e");
  assert.equal(getGeneratorPresentation("MK1").accent, "#2ce3c8");
  assert.deepEqual(getUpgradeVisualResources(rule(TOKEN_UPGRADES, "Cells")), ["cells"]);
  assert.deepEqual(getUpgradeVisualResources(rule(TOKEN_UPGRADES, "Token")), ["token"]);
  assert.deepEqual(getUpgradeVisualResources(rule(TOKEN_UPGRADES, "Diamond")), ["diamond"]);
  assert.deepEqual(getUpgradeVisualResources(rule(TOKEN_UPGRADES, "MPSH")), ["modPoints", "shards"]);
  assert.deepEqual(getUpgradeVisualResources(rule(TOKEN_UPGRADES, "GMPRP")), ["generator", "modPoints", "research"]);
  assert.deepEqual(getUpgradeVisualResources(rule(DIAMOND_UPGRADES, "Ceti")), ["generator", "modPoints"]);
});

test("suffix/scientific parser and linear next-cost formulas match the workbook contract", () => {
  assert.equal(parseCifiNumber("1.25k"), 1_250);
  assert.equal(parseCifiNumber("2qa"), 2e15);
  assert.equal(parseCifiNumber("3.5e+6"), 3.5e6);
  assert.equal(parseCifiNumber("1,275"), 1_275);
  assert.throws(() => parseCifiNumber("not-a-number"), RangeError);
  assert.equal(nextCost(rule(DIAMOND_UPGRADES, "MK1"), 55), 65);
  assert.equal(nextCost(rule(TOKEN_UPGRADES, "MK5"), 585), 102.75);
  assert.equal(nextCostExact(rule(TOKEN_UPGRADES, "MK5"), 585), "102.75");
});

test("weighted Diamond/Token power and the Token Cells exception reproduce known values", () => {
  const tokenBooster = rule(TOKEN_UPGRADES, "Token");
  assert.deepEqual(tokenBooster.chestReward, { currency: "token", chest: "Token Chests", amountPerLevel: 0.2 });
  assert.deepEqual(tokenBooster.effects, { cells: [], modPoints: [], shards: [], research: [], academyPoints: [], materials: [] });
  const diamondBooster = rule(TOKEN_UPGRADES, "Diamond");
  assert.deepEqual(diamondBooster.chestReward, { currency: "diamond", chest: "Diamond Chests", amountPerLevel: 1 });

  const diamondMk1 = rule(DIAMOND_UPGRADES, "MK1");
  const diamondState = state({ generators: { MK1: { unlocked: true, purchased: 1 } } });
  const doubleCells = { ...zeroWeights, cells: 2 };
  closeTo(weightedPower(diamondMk1, diamondState, doubleCells), 1.01 ** 2);

  const alpha = rule(DIAMOND_UPGRADES, "Alpha");
  closeTo(weightedPower(alpha, diamondState, unitWeights), 1.3 * 1.78 * 1.54);

  const tokenMk5 = rule(TOKEN_UPGRADES, "MK5");
  const tokenState = state({
    levels: { diamond: {}, token: { MK5: 585 } },
    generators: { MK5: { unlocked: true, purchased: 1 } },
  });
  const evaluated = evaluateUpgrade(tokenMk5, tokenState, unitWeights);
  assert.equal(evaluated.nextCost, 102.75);
  closeTo(evaluated.power, 1.01);
  closeTo(evaluated.score, 1022.8917684210237);

  const cells = rule(TOKEN_UPGRADES, "Cells");
  const cellsState = state({
    levels: { diamond: {}, token: { Cells: 60 } },
    generators: { MK2: { unlocked: true, purchased: 1 } },
    longRunHours: 24,
  });
  closeTo(weightedPower(cells, cellsState, unitWeights), 131900 / 131400);
});

test("generator, ship, tier, and large-one-timer unlock gates are recalculated from state", () => {
  const diamondMk1 = rule(DIAMOND_UPGRADES, "MK1");
  assert.equal(isUpgradeUnlocked(diamondMk1, state({ generators: { MK1: { unlocked: true, purchased: 0 } } })), false);
  assert.equal(isUpgradeUnlocked(diamondMk1, state({ generators: { MK1: { unlocked: true, purchased: 1 } } })), true);

  const tokenMods = rule(TOKEN_UPGRADES, "Mods");
  assert.equal(isUpgradeUnlocked(tokenMods, state({ ships: { Zagreus: { unlocked: true, crew: 0 } } })), false);
  assert.equal(isUpgradeUnlocked(tokenMods, state({ ships: { Zagreus: { unlocked: true, crew: 1 } } })), true);

  const tier2State = state({ levels: { diamond: {}, token: { MK1: 5000, MK2: 5000 } } });
  assert.equal(isUpgradeUnlocked(rule(TOKEN_UPGRADES, "Token2"), tier2State), true);
  const tier2BelowBoundary = state({ levels: { diamond: {}, token: { MK1: 5000, MK2: 4999 } } });
  assert.equal(isUpgradeUnlocked(rule(TOKEN_UPGRADES, "Token2"), tier2BelowBoundary), false);

  const tier3State = state({ levels: { diamond: {}, token: {
    MK1: 5000, MK2: 5000, MK3: 5000, MK4: 5000,
    MK1MK2: 2500, MK3MK4: 2500, MK5MK6: 2500, MK7MK8: 2500,
  } } });
  assert.equal(isUpgradeUnlocked(rule(TOKEN_UPGRADES, "Token3"), tier3State), true);
  const tier3BelowBoundary = state({ levels: { diamond: {}, token: {
    MK1: 5000, MK2: 5000, MK3: 5000, MK4: 4999,
    MK1MK2: 2500, MK3MK4: 2500, MK5MK6: 2500, MK7MK8: 2500,
  } } });
  assert.equal(isUpgradeUnlocked(rule(TOKEN_UPGRADES, "Token3"), tier3BelowBoundary), false);

  const regularOneTimers = DIAMOND_UPGRADES.filter(({ category }) => category === "oneTimer");
  assert.equal(regularOneTimers.length, 24);
  const allCards = Object.fromEntries(regularOneTimers.map(({ id }) => [id, 1]));
  assert.equal(isUpgradeUnlocked(rule(DIAMOND_UPGRADES, "Andromeda"), state({ levels: { diamond: allCards, token: {} } })), true);
  delete allCards.Alpha;
  assert.equal(isUpgradeUnlocked(rule(DIAMOND_UPGRADES, "Andromeda"), state({ levels: { diamond: allCards, token: {} } })), false);
});

test("corrected simulator skips an unaffordable global winner and buys the best affordable rule", () => {
  const optimizerState = state({
    generators: {
      MK1: { unlocked: true, purchased: 1 },
      MK2: { unlocked: true, purchased: 1 },
    },
    longRunHours: 24,
  });
  assert.equal(rankUpgrades("token", optimizerState, unitWeights)[0].rule.id, "Token");

  const result = simulateBudget("token", 19, optimizerState, unitWeights, { maxSteps: 1 });
  assert.equal(result.compatibility, "corrected");
  assert.equal(result.steps[0].id, "MK1");
  assert.equal(result.steps[0].cost, "1");
  assert.equal(result.remaining, "18");
  assert.equal(result.summary.MK1, 1);
  assert.equal(result.finalState.levels.token.MK1, 1);
  assert.equal(result.truncated, true);
});

test("Token budget subtraction stays exact through sequential plan purchases", () => {
  const optimizerState = state({ generators: { MK1: { unlocked: true, purchased: 1 } } });
  const result = simulateBudget("token", "3.3", optimizerState, unitWeights, { maxSteps: 3 });

  assert.deepEqual(result.purchases.map((purchase) => purchase.cost), ["1", "1.1", "1.2"]);
  assert.deepEqual(result.purchases.map((purchase) => purchase.remainingBudget), ["2.3", "1.2", "0"]);
  assert.equal(result.initialBudget, "3.3");
  assert.equal(result.spent, "3.3");
  assert.equal(result.remainingBudget, "0");
});

test("extreme finite weights cannot leak Infinity or NaN into ranking scores", () => {
  const tokenMk1 = rule(TOKEN_UPGRADES, "MK1");
  const optimizerState = state({ generators: { MK1: { unlocked: true, purchased: 1 } } });
  const hugeWeights = { ...zeroWeights, cells: Number.MAX_VALUE };

  assert.equal(weightedPower(tokenMk1, optimizerState, hugeWeights), Number.MAX_VALUE);
  assert.equal(evaluateUpgrade(tokenMk1, optimizerState, hugeWeights).score, Number.MAX_VALUE);
});

test("exact score ties retain the original physical worksheet order", () => {
  const maxedDiamond = Object.fromEntries(
    DIAMOND_UPGRADES.filter(({ category }) => category === "generator" || category === "special")
      .map(({ id, maxLevel }) => [id, maxLevel]),
  );
  const generators = Object.fromEntries([...Array(8)].map((_, index) => [`MK${index + 1}`, { unlocked: true, purchased: 1 }]));
  const ships = Object.fromEntries(["Cradle", "Auxesia", "Zagreus", "Hephaestus", "Demeter", "Koios", "Zeus"].map((id) => [id, { unlocked: true, crew: 1 }]));
  const result = simulateBudget("diamond", 1000, state({
    levels: { diamond: maxedDiamond, token: {} }, generators, ships,
  }), zeroWeights, { maxSteps: 1 });
  assert.equal(result.steps[0].id, "Alpha");
});

test("overflowed display scores do not create false recommendation ties", () => {
  const optimizerState = state({ generators: Object.fromEntries([...Array(8)].map((_, index) => [`MK${index + 1}`, { unlocked: true, purchased: 1 }])) });
  const heavyCells = { ...unitWeights, cells: 1000 };
  assert.equal(rankUpgrades("diamond", optimizerState, heavyCells)[0].rule.id, "Qoru");
  assert.equal(simulateBudget("diamond", 5000, optimizerState, heavyCells, { maxSteps: 1 }).purchases[0].id, "Qoru");
  const extremeCells = { ...unitWeights, cells: Number.MAX_VALUE };
  assert.equal(rankUpgrades("diamond", optimizerState, extremeCells)[0].rule.id, "Qoru");
});
