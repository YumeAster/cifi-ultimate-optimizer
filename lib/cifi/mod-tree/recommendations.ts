import catalogue from "./reference.json" with { type: "json" };
import source from "./recommendation-data.json" with { type: "json" };
import { addCifiDecimals, compareCifiDecimals, decimalToNumber, decimalToString, multiplyCifiDecimalByInteger, parseCifiDecimal, subtractCifiDecimals, type CifiDecimal } from "../upgrades/decimal.ts";
import { evaluateFormula, finite, wideCompare, wideLog, wideNumber, type FormulaContext, type Wide } from "./formula.ts";
import { normalizeModBudgetInput, parseModBudget } from "./budget.ts";
export { parseModBudget } from "./budget.ts";

export const MOD_RECOMMENDATION_SOURCE = source.url;
export const MOD_RECOMMENDATION_VERSION = source.version;
export const MOD_STORAGE_KEY = "cifi-ultimate.mod-tree.v1";
export const MAX_PLAN_STEPS = 200;
export type ModState = { version: 1; budget: string; costImportance: number; levels: Record<string, number>; ignored: string[] };
export type PlayerProfile = Readonly<Record<string, string>>;
export type ModEvaluation = {
  code: string; name: string; level: number; maxLevel: number; missing: string[];
  maxed: boolean; ignored: boolean; unlocked: boolean; affordable: boolean;
  cost: string | null; costLog: number; powerLog: number; score: number;
  effects: { label: string; value: string }[]; error: string | null; priority: boolean;
};
export type ModPlan = { steps: { code: string; from: number; to: number; cost: string }[]; next: ModState; spent: string; stopped: "limit" | "no-candidate" };
const reference = new Map(catalogue.nodes.map(row => [row.code, row]));
const rules = new Map(source.nodes.map(row => [row.code, row]));
export const modMaximumLevel = (code: string) => reference.get(code)?.maxLevel ?? 0;
export const modLevelLimit = (code: string) => Math.min(modMaximumLevel(code), 99_999);
export const blankModState = (): ModState => ({ version: 1, budget: "0", costImportance: 50, levels: {}, ignored: [] });
const weights = { cells: 1, modPoints: 12, shards: 10, research: 8, academyPoints: 24, materials: 72, costReduction: 6, rankPoints: 1 };
const scalarKeys: Record<string, string> = {
  ModValues_Level: "level", ModValues_Loops: "loopsFilled", ModValues_Resets: "loopResets", ModValues_Ops: "operationsDone", ModValues_Studies: "studiesDone",
  ModValues_Doubler: "lpDoublerBarFill", ModValues_Tickspeed: "shardTickspeed", ModValues_Equipment: "equipmentBought", ModValues_Levels: "totalResearchLevels", ModValues_Researches: "completedResearches",
  Weight_Cells: "cells", Weight_MP: "modPoints", Weight_Shards: "shards", Weight_Research: "research", Weight_AP: "academyPoints", Weight_Mats: "materials", Weight_CR: "costReduction", Weight_RP: "rankPoints",
};
const ships = ["cradle", "auxesia", "zagreus", "hephaestus", "demeter", "koios", "zeus"];
export const MOD_EFFECT_LABELS = ["Cells", ...Array.from({ length: 8 }, (_, i) => `MK${i + 1} Output`), "MP", "Shards", "Research", "AP", "Materials", "LP", ...ships.map(s => `${s} RP`), "Tick speed", "Tick/Loop req.", "Loop Reset req.", ...Array.from({ length: 8 }, (_, i) => `MK${i + 1} CR`), ...ships.map(s => `${s} CR`)];
export const isModEffectMultiplier = (index: number) => index < 14 || index === 22;
ships.forEach((name, index) => ["Rank", "Crew"].forEach(field => { scalarKeys[`${field}_${["Cra", "Aux", "Zag", "Hep", "Dem", "Koi", "Zeu"][index]}`] = `${name}${field}`; }));
for (let i = 1; i <= 8; i++) scalarKeys[`ModValues_mk${i}`] = `manualMk${i}`;

export function restoreModState(value: unknown): ModState {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid Mod Tree save");
  const input = value as Record<string, unknown>;
  if (input.version !== 1 || typeof input.budget !== "string" || typeof input.costImportance !== "number" || !Number.isFinite(input.costImportance) || input.costImportance < 0 || input.costImportance > 100) throw new Error("Invalid Mod Tree save version/settings");
  const budget = normalizeModBudgetInput(input.budget);
  if (!input.levels || typeof input.levels !== "object" || Array.isArray(input.levels) || !Array.isArray(input.ignored)) throw new Error("Invalid Mod Tree levels");
  const levels: Record<string, number> = {};
  for (const [code, level] of Object.entries(input.levels)) {
    if (!reference.has(code) || typeof level !== "number" || !Number.isSafeInteger(level) || level < 0 || level > modLevelLimit(code)) throw new Error(`Invalid level: ${code}`);
    levels[code] = level;
  }
  if (input.ignored.some(code => typeof code !== "string" || !reference.has(code))) throw new Error("Invalid ignored node");
  return { version: 1, budget, costImportance: input.costImportance, levels, ignored: [...new Set(input.ignored as string[])] };
}

export const canPurchaseMod = (row: ModEvaluation | undefined): boolean =>
  Boolean(row && row.unlocked && row.affordable && !row.maxed && !row.error && row.cost);

/** Explicit manual purchases do not depend on display count or exclusions.
 * Recommendations/plans still respect exclusions. All balances are rounded. */
export function purchaseMod(state: ModState, profile: PlayerProfile, code: string): ModState | null {
  const current = restoreModState(state);
  const item = evaluateMods(current, profile).find(row => row.code === code);
  if (!canPurchaseMod(item) || !item?.cost) return null;
  return { ...current, budget: normalizeModBudgetInput(decimalToString(subtractCifiDecimals(parseModBudget(current.budget), parseModBudget(item.cost)))), levels: { ...current.levels, [code]: item.level + 1 } };
}
export function profileNumber(profile: PlayerProfile, key: string): number {
  const raw = profile[key];
  if (raw === undefined || raw.trim() === "") return weights[key as keyof typeof weights] ?? 0;
  const n = decimalToNumber(parseCifiDecimal(raw));
  if (n < 0) throw new Error(`Invalid profile input: ${key}`);
  return n;
}
export function createModContext(state: ModState, profile: PlayerProfile, requireProfile = false): FormulaContext {
  const readProfile = (key: string) => {
    if (requireProfile && !(key in weights) && !profile[key]?.trim()) throw new Error(`Missing profile input: ${key}`);
    return profileNumber(profile, key);
  };
  return {
    level(code) { if (!reference.has(code)) throw new Error(`Unknown Mod: ${code}`); return state.levels[code] ?? 0; },
    scalar(name) {
      if (name === "ModLevels_Total") return Object.entries(state.levels).reduce((sum, [code, level]) => sum + (["A13", "IU4"].includes(code) ? 0 : level), 0);
      // The source has one Software Tech total. Keep the eight independent web
      // fields and explicitly aggregate their sum only for the G01 sheet rule.
      if (name === "ModValues_SWTech") return finite(Array.from({ length: 8 }, (_, i) => readProfile(`softwareTechMk${i + 1}`)).reduce((a, b) => a + b, 0));
      const key = scalarKeys[name];
      if (!key) throw new Error(`Unknown sheet input: ${name}`);
      return readProfile(key);
    },
  };
}

export function decimalLog(value: CifiDecimal): number {
  if (value.coefficient <= 0n) return -Infinity;
  const digits = value.coefficient.toString();
  const head = digits.slice(0, 15);
  return value.exponent + digits.length - head.length + Math.log10(Number(head));
}
const costCache = new Map<string, { exact: string | null; log: number }>();
export function modNextCost(code: string, level: number): { exact: string | null; log: number } {
  const rule = rules.get(code);
  if (!rule || !Number.isSafeInteger(level) || level < 0 || level > modLevelLimit(code)) throw new RangeError("Invalid Mod cost input");
  const key = `${code}:${level}`, cached = costCache.get(key);
  if (cached) return cached;
  const ctx = createModContext({ ...blankModState(), levels: { [code]: level } }, {});
  const constant = (formula: string | number) => parseCifiDecimal(wideNumber(evaluateFormula(formula, ctx)).toPrecision(15));
  const linear = addCifiDecimals(parseCifiDecimal(rule.startCost), multiplyCifiDecimalByInteger(parseCifiDecimal(rule.costGrowth), level));
  const base = addCifiDecimals(constant(rule.startBase), multiplyCifiDecimalByInteger(constant(rule.baseGrowth), level));
  // ModRef Local F2: IU3 has additional eleven-order jumps at levels 10..19.
  const extra = code !== "IU3" || level < 10 || level >= 20 ? 0 : 11 * (level - (level < 13 ? 9 : [8, 7, 6, 4, 2, -1, -4][level - 13]));
  const log = finite(decimalLog(linear) + level * decimalLog(base) + extra);
  let exact: string | null = null;
  if (log < 10_000) {
    const coefficient = linear.coefficient * base.coefficient ** BigInt(level);
    const exponent = linear.exponent + base.exponent * level + extra;
    // Floor only after the complete decimal product, not each factor.
    const integer = exponent < 0 ? coefficient / 10n ** BigInt(-exponent) : coefficient * 10n ** BigInt(exponent);
    if (integer <= 0n) throw new Error("Non-positive Mod cost");
    exact = decimalToString(parseCifiDecimal(integer.toString()));
  }
  const result = { exact, log: exact ? decimalLog(parseCifiDecimal(exact)) : log };
  if (costCache.size > 4096) costCache.clear();
  costCache.set(key, result); return result;
}

/** ModCalc Local AP2 -> AQ2. Score uses log10(power), not raw power. */
export function modPower(code: string, state: ModState, profile: PlayerProfile): { log: number; effects: ModEvaluation["effects"] } {
  const rule = rules.get(code);
  if (!rule) throw new Error("Unknown Mod");
  const ctx = createModContext(state, profile);
  const b = rule.effects.map(formula => evaluateFormula(formula, ctx));
  const w = Object.fromEntries(Object.keys(weights).map(key => [key, profileNumber(profile, key)])) as typeof weights;
  const scalar = (name: string) => ctx.scalar(name);
  const lv = (c: string) => Math.max(1, ctx.level(c));
  const n = (i: number) => wideNumber(b[i]);
  const logAtLeastOne = (v: Wide) => wideCompare(v, 1) > 0 ? wideLog(v) : 0;
  let log = b.slice(0, 9).reduce<number>((sum, v) => sum + logAtLeastOne(v) * w.cells, 0);
  [w.modPoints, w.shards, w.research, w.academyPoints, w.materials].forEach((weight, i) => { log += logAtLeastOne(b[9 + i]) * weight; });
  // Retain the source's CR clamp-to-one and LP baseline; they are part of the
  // source heuristic, not claims about the game's actual multiplicative gain.
  const crWeights = [2.75, .45, .25, .2, .15, .1, .05, .01, 1, 2.375, 4.75, 3.25, 2.1, 2.5, 10];
  log += Math.log10(1.05) * w.costReduction * crWeights.reduce((sum, weight, i) => sum + Math.max(1, n(25 + i)) * weight, 0);
  log += Math.log10(2) * (Math.floor((scalar("ModValues_Doubler") + n(14)) / 10) + (n(14) % 10) / 100) * (w.cells + w.modPoints + w.shards);
  const delta = lv("F10"), gen = [4, 5, 6, 7, 8].map(i => lv(`C${i}u`));
  const rpLevels = ["E01", "E06", "E10", "E14", "E18", "E22", "E26"].map(lv);
  const ranks = ["Cra", "Aux", "Zag", "Hep", "Dem", "Koi", "Zeu"].map(ship => scalar(`Rank_${ship}`));
  const hep = 30 + Math.max(1, ranks[3]) + rpLevels[3];
  const denominators = [30 + ranks[0] + rpLevels[0] + delta * 3, 30 + ranks[1] + rpLevels[1] + delta * 3, 30 + ranks[2] + rpLevels[2], Math.max(hep, hep * hep / 45), 30 + ranks[4] + rpLevels[4] + delta * 3, 30 + ranks[5] + rpLevels[5], 30 + ranks[6] + rpLevels[6]];
  const numerators = [w.cells * 29, w.cells * (55 + 13 * gen.reduce((a, b) => a + b, 0)), w.cells * 35 + w.modPoints * 6, w.cells * 85 + w.modPoints * 7, w.cells * 27 + w.modPoints + w.shards * 9, w.cells * 29 + w.modPoints * 7 + w.shards * 7 + w.research * 3, w.cells * 15 + w.modPoints * 12 + w.shards * 8 + w.research * 8 + w.academyPoints * 4 + w.materials * 2];
  [5, 2.5, 2, 8, 4, 5, 10].forEach((divisor, i) => { log += Math.log1p(w.rankPoints / divisor) / Math.LN10 * n(15 + i) * numerators[i] / denominators[i]; });
  log += logAtLeastOne(b[22]) * (w.cells + w.modPoints + gen[1] * w.shards + gen[2] * w.research + gen[4]);
  log += Math.log1p(n(23) * Math.sqrt(scalar("ModValues_Loops") + 1) / 2000) / Math.LN10 * w.modPoints;
  log += Math.log10(1.1) * n(24) * w.modPoints * w.modPoints / 10000;
  const effects = b.flatMap((value, i) => {
    const multiplier = isModEffectMultiplier(i);
    if (wideCompare(value, multiplier ? 1 : 0) === 0) return [];
    return [{ label: MOD_EFFECT_LABELS[i], value: `${multiplier ? "×" : "+"}${formatWide(value)}` }];
  });
  return { log: finite(log), effects };
}
export function formatLog(log: number): string {
  if (!Number.isFinite(log)) return "—";
  if (log < 6 && log > -4) return Number((10 ** log).toPrecision(6)).toLocaleString("en-US", { maximumSignificantDigits: 6 });
  let exponent = Math.floor(log), mantissa = Number((10 ** (log - exponent)).toPrecision(4));
  if (mantissa >= 10) { mantissa = 1; exponent++; }
  return `${mantissa}e${exponent}`;
}
export function formatWide(value: Wide): string {
  if (typeof value !== "number") return `${value.sign < 0 ? "-" : ""}${formatLog(value.log)}`;
  if (value === 0) return "0";
  return `${value < 0 ? "-" : ""}${formatLog(Math.log10(Math.abs(value)))}`;
}
export function evaluateMods(state: ModState, profile: PlayerProfile): ModEvaluation[] {
  const budget = parseModBudget(state.budget), budgetLog = decimalLog(budget);
  return catalogue.nodes.map(row => {
    const level = state.levels[row.code] ?? 0;
    const missing = row.prerequisites.filter(parent => !(state.levels[parent] > 0));
    const maxed = level >= modLevelLimit(row.code);
    const result: ModEvaluation = { code: row.code, name: row.name, level, maxLevel: modLevelLimit(row.code), missing, unlocked: missing.length === 0 && (row.prerequisites.length > 0 || ["A01", "G22"].includes(row.code)), maxed, ignored: state.ignored.includes(row.code), affordable: false, cost: null, costLog: 0, powerLog: 0, score: 0, effects: [], error: null, priority: ["A02", "A03", "G22"].includes(row.code) };
    if (maxed) return result;
    try {
      const cost = modNextCost(row.code, level);
      result.cost = cost.exact; result.costLog = cost.log;
      result.affordable = cost.exact !== null && compareCifiDecimals(budget, parseCifiDecimal(cost.exact)) >= 0;
      const power = modPower(row.code, state, profile);
      result.powerLog = power.log; result.effects = power.effects;
      // Source E30 uses ModCalc AQ (log power), not AP (raw power).
      result.score = result.affordable ? finite(power.log * ((state.costImportance / 100) * Math.max(0, budgetLog - cost.log) + 1 - state.costImportance / 100)) : 0;
    } catch (error) { result.error = error instanceof Error ? error.message : "Calculation failed"; }
    return result;
  });
}
export function rankMods(evaluations: ModEvaluation[]): ModEvaluation[] {
  return evaluations.filter(row => row.unlocked && row.affordable && !row.maxed && !row.ignored && !row.error).sort((a, b) => Number(b.priority) - Number(a.priority) || b.score - a.score || a.costLog - b.costLog || a.code.localeCompare(b.code));
}
export function simulateMods(state: ModState, profile: PlayerProfile, limit = 25): ModPlan {
  const next = restoreModState(state);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_PLAN_STEPS) throw new RangeError("Invalid plan limit");
  const steps: ModPlan["steps"] = [];
  let budget = parseModBudget(next.budget), spent = parseCifiDecimal("0");
  while (steps.length < limit) {
    const best = rankMods(evaluateMods(next, profile))[0];
    if (!best?.cost) break;
    const cost = parseCifiDecimal(best.cost);
    budget = subtractCifiDecimals(budget, cost); spent = addCifiDecimals(spent, cost);
    if (budget.coefficient < 0n) throw new Error("Plan exceeded its budget");
    next.budget = normalizeModBudgetInput(decimalToString(budget));
    budget = parseModBudget(next.budget);
    next.levels[best.code] = best.level + 1;
    steps.push({ code: best.code, from: best.level, to: best.level + 1, cost: best.cost });
  }
  return { next, steps, spent: decimalToString(spent), stopped: steps.length === limit ? "limit" : "no-candidate" };
}
