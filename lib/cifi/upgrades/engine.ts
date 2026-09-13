import { DIAMOND_UPGRADES, UPGRADE_RULESETS } from "./rules.ts";
import {
  addCifiDecimals,
  compareCifiDecimals,
  decimalFromNumber,
  decimalToNumber,
  decimalToString,
  multiplyCifiDecimalByInteger,
  parseCifiDecimal,
  subtractCifiDecimals,
  type CifiDecimal,
} from "./decimal.ts";
import type {
  Currency,
  OptimizerState,
  SimulationOptions,
  SimulationResult,
  UpgradeEvaluation,
  UpgradeRule,
  UpgradeWeights,
  WeightKey,
} from "./types.ts";

const WEIGHT_KEYS: readonly WeightKey[] = ["cells", "modPoints", "shards", "research", "academyPoints", "materials"];
const MAX_EXPONENT_LOG = Math.log(Number.MAX_VALUE);
const MIN_EXPONENT_LOG = Math.log(Number.MIN_VALUE);

export function parseCifiNumber(input: number | string): number {
  return decimalToNumber(parseCifiDecimal(input));
}

function normalizedLevel(level: number | undefined): number {
  return Number.isFinite(level) && (level ?? 0) > 0 ? Math.floor(level as number) : 0;
}

function levelFor(rule: UpgradeRule, state: OptimizerState): number {
  return normalizedLevel(state.levels[rule.currency][rule.id]);
}

function assertWeights(weights: UpgradeWeights): void {
  for (const key of WEIGHT_KEYS) {
    if (!Number.isFinite(weights[key]) || weights[key] < 0) {
      throw new RangeError(`Upgrade weight ${key} must be a finite non-negative number.`);
    }
  }
}

function tokenTierLevelTotal(state: OptimizerState, throughTier: 1 | 2): number {
  return UPGRADE_RULESETS.token
    .filter((rule) => rule.category === "tier1" || (throughTier === 2 && rule.category === "tier2"))
    .reduce((total, rule) => total + normalizedLevel(state.levels.token[rule.id]), 0);
}

export function isUpgradeUnlocked(rule: UpgradeRule, state: OptimizerState): boolean {
  switch (rule.unlock.kind) {
    case "generator": {
      const progress = state.generators[rule.unlock.id];
      return progress?.unlocked === true && progress.purchased > 0;
    }
    case "ship": {
      const progress = state.ships[rule.unlock.id];
      return progress?.unlocked === true && progress.crew > 0;
    }
    case "tier":
      return rule.unlock.tier === 2
        ? tokenTierLevelTotal(state, 1) >= 10_000
        : tokenTierLevelTotal(state, 2) >= 30_000;
    case "large":
      return DIAMOND_UPGRADES
        .filter((candidate) => candidate.category === "oneTimer")
        .every((candidate) => normalizedLevel(state.levels.diamond[candidate.id]) >= candidate.maxLevel);
  }
}

export function nextCost(rule: UpgradeRule, level: number): number {
  return decimalToNumber(parseCifiDecimal(nextCostExact(rule, level)));
}

/** Returns the exact decimal cost used for affordability and budget subtraction. */
export function nextCostExact(rule: UpgradeRule, level: number): string {
  const currentLevel = normalizedLevel(level);
  const baseCost = decimalFromNumber(rule.baseCost);
  const scaledCost = multiplyCifiDecimalByInteger(decimalFromNumber(rule.costScaling), currentLevel);
  return decimalToString(addCifiDecimals(baseCost, scaledCost));
}

function tokenCellsPower(level: number, longRunHours: number): number {
  const seconds = Math.max(0, longRunHours) * 60 * 60;
  const tickFactor = Math.min(400, Math.floor(seconds / 140)) + Math.min(100, Math.floor(seconds / 300));
  const denominator = 60 * 60 * 24 + (30 + level) * tickFactor;
  return (60 * 60 * 24 + (30 + level + 1) * tickFactor) / denominator;
}

export function weightedPower(rule: UpgradeRule, state: OptimizerState, weights: UpgradeWeights): number {
  assertWeights(weights);

  if (rule.powerRule.kind === "constant") return rule.powerRule.value;
  if (rule.powerRule.kind === "tokenCells") return tokenCellsPower(levelFor(rule, state), state.longRunHours);

  const logarithm = WEIGHT_KEYS.reduce((total, key) => {
    const effectLogarithm = rule.effects[key].reduce((effectTotal, factor) => {
      if (!Number.isFinite(factor) || factor <= 0) throw new RangeError(`Upgrade effect factor for ${key} must be finite and positive.`);
      return effectTotal + Math.log(factor);
    }, 0);
    return total + effectLogarithm * weights[key];
  }, 0);
  if (!Number.isFinite(logarithm) || logarithm >= MAX_EXPONENT_LOG) return Number.MAX_VALUE;
  if (logarithm <= MIN_EXPONENT_LOG) return 0;
  return Math.exp(logarithm);
}

function boundedScore(value: number): number {
  if (Number.isNaN(value) || value <= 0) return 0;
  return Number.isFinite(value) ? value : Number.MAX_VALUE;
}

export function evaluateUpgrade(rule: UpgradeRule, state: OptimizerState, weights: UpgradeWeights): UpgradeEvaluation {
  const currentLevel = levelFor(rule, state);
  const unlocked = isUpgradeUnlocked(rule, state);
  const maxed = currentLevel >= rule.maxLevel;
  const costExact = nextCostExact(rule, currentLevel);
  const cost = decimalToNumber(parseCifiDecimal(costExact));
  const power = unlocked ? weightedPower(rule, state, weights) : 0;
  const eligible = unlocked && !maxed;
  const score = boundedScore(eligible
    ? rule.currency === "diamond"
      ? (1_000 * power) / cost
      : 1_000 * 10 ** (power / cost)
    : 0);

  return {
    rule,
    currentLevel,
    nextCost: cost,
    nextCostExact: costExact,
    level: currentLevel,
    cost,
    costExact,
    power,
    score,
    unlocked,
    maxed,
    atMax: maxed,
    eligible,
  };
}

export function rankUpgrades(currency: Currency, state: OptimizerState, weights: UpgradeWeights): readonly UpgradeEvaluation[] {
  return UPGRADE_RULESETS[currency]
    .map((rule) => evaluateUpgrade(rule, state, weights))
    .filter((evaluation) => evaluation.eligible)
    .sort((left, right) => -compareUpgradePriority(left, right, state, weights) || left.rule.order - right.rule.order);
}

/** Both score formulas are strictly increasing in power / cost. Compare its logarithm
 * instead of the display score, which can saturate at Number.MAX_VALUE.
 * A shared weight scale also prevents the logarithm itself overflowing for huge weights.
 */
export function compareUpgradePriority(left: UpgradeEvaluation, right: UpgradeEvaluation, state: OptimizerState, weights: UpgradeWeights): number {
  assertWeights(weights);
  const scale = Math.max(1, ...WEIGHT_KEYS.map((key) => weights[key]));
  const scaledLogPower = (rule: UpgradeRule): number => {
    if (rule.powerRule.kind === "constant") return Math.log(rule.powerRule.value) / scale;
    if (rule.powerRule.kind === "tokenCells") return Math.log(tokenCellsPower(levelFor(rule, state), state.longRunHours)) / scale;
    return WEIGHT_KEYS.reduce((sum, key) => sum + rule.effects[key].reduce((effectSum, factor) => effectSum + Math.log(factor), 0) * (weights[key] / scale), 0);
  };
  const powerDifference = scaledLogPower(left.rule) - scaledLogPower(right.rule);
  const costDifference = (Math.log(left.cost) - Math.log(right.cost)) / scale;
  return powerDifference - costDifference;
}

function isAffordable(cost: CifiDecimal, budget: CifiDecimal): boolean {
  return compareCifiDecimals(cost, budget) <= 0;
}

export function simulateBudget(
  currency: Currency,
  budgetInput: number | string,
  state: OptimizerState,
  weights: UpgradeWeights,
  options: SimulationOptions = {},
): SimulationResult {
  const initialBudget = parseCifiDecimal(budgetInput);
  if (initialBudget.coefficient < 0n) throw new RangeError("Upgrade budget must be non-negative.");

  const rules = UPGRADE_RULESETS[currency];
  const levels: Record<string, number> = { ...state.levels[currency] };
  const possibleSteps = rules.reduce(
    (total, rule) => total + Math.max(0, rule.maxLevel - normalizedLevel(levels[rule.id])),
    0,
  );
  const requestedMaxSteps = options.maxSteps ?? possibleSteps;
  if (!Number.isInteger(requestedMaxSteps) || requestedMaxSteps < 0) {
    throw new RangeError("maxSteps must be a non-negative integer.");
  }

  const maxSteps = Math.min(requestedMaxSteps, possibleSteps);
  const purchases: SimulationResult["purchases"][number][] = [];
  let remainingBudget = initialBudget;
  let stoppedForNoAffordableUpgrade = false;

  while (purchases.length < maxSteps) {
    const currentState: OptimizerState = {
      ...state,
      levels: { ...state.levels, [currency]: levels },
    };

    // Corrected behavior: reconsider only currently affordable candidates after every purchase.
    // The legacy sheet script picked the global recommendation first and could stop on an
    // unaffordable item even when a lower-scoring purchase was possible; that bug is omitted.
    let best: UpgradeEvaluation | undefined;
    for (const rule of rules) {
      const evaluation = evaluateUpgrade(rule, currentState, weights);
      if (!evaluation.eligible || !isAffordable(parseCifiDecimal(evaluation.nextCostExact), remainingBudget)) continue;
      if (!best || compareUpgradePriority(evaluation, best, currentState, weights) > 0) best = evaluation;
      // Equal scores deliberately keep the first rule: original physical worksheet order.
    }

    if (!best) {
      stoppedForNoAffordableUpgrade = true;
      break;
    }

    const levelAfter = best.currentLevel + 1;
    levels[best.rule.id] = levelAfter;
    remainingBudget = subtractCifiDecimals(remainingBudget, parseCifiDecimal(best.nextCostExact));
    purchases.push({
      step: purchases.length + 1,
      id: best.rule.id,
      name: best.rule.name,
      levelBefore: best.currentLevel,
      levelAfter,
      cost: best.nextCostExact,
      power: best.power,
      score: best.score,
      remainingBudget: decimalToString(remainingBudget),
    });
  }

  const finalState: OptimizerState = {
    ...state,
    levels: { ...state.levels, [currency]: Object.freeze({ ...levels }) },
  };
  const truncated = !stoppedForNoAffordableUpgrade && purchases.length === maxSteps && rules.some((rule) => {
    const evaluation = evaluateUpgrade(rule, finalState, weights);
    return evaluation.eligible && isAffordable(parseCifiDecimal(evaluation.nextCostExact), remainingBudget);
  });
  const summary = purchases.reduce<Record<string, number>>((counts, purchase) => {
    counts[purchase.id] = (counts[purchase.id] ?? 0) + 1;
    return counts;
  }, {});

  return {
    compatibility: "corrected",
    currency,
    initialBudget: decimalToString(initialBudget),
    steps: purchases,
    purchases,
    summary: Object.freeze(summary),
    finalState,
    finalLevels: finalState.levels[currency],
    spent: decimalToString(subtractCifiDecimals(initialBudget, remainingBudget)),
    remaining: decimalToString(remainingBudget),
    remainingBudget: decimalToString(remainingBudget),
    truncated,
    stoppedReason: truncated ? "max-steps" : "no-affordable-upgrades",
  };
}
