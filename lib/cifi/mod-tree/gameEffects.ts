import catalogue from "./game-effects.json" with { type: "json" };
import reference from "./reference.json" with { type: "json" };
import type { ModState, PlayerProfile } from "./recommendations.ts";
import { parseCifiDecimal } from "../upgrades/decimal.ts";
import { readGameDisplayInput } from "./gameDisplayInputs.ts";
import { addGameEffectDecimals, compareGameEffectDecimals, divideGameEffectDecimals, formatGameEffectDecimal, gameEffectExact, multiplyGameEffectDecimals, parseGameEffectDecimal, powerGameEffectDecimal, realPowerGameEffectDecimal, roundGameEffectDecimal, type GameEffectDecimal } from "./gameEffectDecimal.ts";

export type GameEffectOperation = "add" | "mult" | "divisor" | "percent" | "unlock" | "count";
export type GameEffectExpression =
  | { kind: "constant"; value: string }
  | { kind: "level"; code?: string }
  | { kind: "baselineLevel"; code?: string }
  | { kind: "profile"; key: string }
  | { kind: "add" | "multiply" | "min" | "max"; args: GameEffectExpression[] }
  | { kind: "divide"; numerator: GameEffectExpression; denominator: GameEffectExpression }
  | { kind: "floor" | "truncate" | "float32"; value: GameEffectExpression }
  | { kind: "totalLevels"; excludeCodes?: string[] }
  | { kind: "ifZero"; condition: GameEffectExpression; zero: GameEffectExpression; otherwise: GameEffectExpression }
  | { kind: "ifLess"; left: GameEffectExpression; right: GameEffectExpression; then: GameEffectExpression; otherwise: GameEffectExpression }
  | { kind: "power"; base: GameEffectExpression; exponent: GameEffectExpression };
export type GameEffectTarget = {
  label: string; labelKo: string; iconCategory: string; generator?: string;
  operation: GameEffectOperation; unit: string; aggregate: "sum" | "product" | "none";
  summaryTargets?: string[];
};
export type GameEffectNode = {
  maxLevel: number | null; observedLevel: number | null; basis: string; observed: string[]; evidence?: string;
  effects: { target: string; expression?: GameEffectExpression }[];
  sourceKind?: "game" | "wiki" | "native";
};
export type GameEffectCatalog = {
  schemaVersion: 1; gameVersion: string; observedAt: string; evidence: string;
  verificationBoundary: string; targets: Record<string, GameEffectTarget>; nodes: Record<string, GameEffectNode>;
};
export type GameEffectSource = {
  version: string; observedAt: string; evidence: string; basis: string;
  observedLevel: number | null; observed: readonly string[]; purchaseVerified: false;
};
export type GameEffectComparison = GameEffectTarget & {
  code: string; target: string; index: number;
  current: string; next: string; currentExact: string | null; nextExact: string | null;
  currentValue: string | null; nextValue: string | null;
  level: number; nextLevel: number; verified: boolean; uncertain: boolean;
  status: "verified" | "documented" | "pending" | "missing-input" | "invalid";
  sourceVersion: string | null; source: GameEffectSource | null;
  missingInput?: string; reason?: string;
};
const referenceByCode = new Map(reference.nodes.map(node => [node.code, node]));
const operations = new Set(["add", "mult", "divisor", "percent", "unlock", "count"]);
const aggregates = new Set(["sum", "product", "none"]);
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string" && value.length > 0;
function validateExpression(value: unknown, depth = 0): void {
  if (!object(value) || depth > 32) throw new Error("Invalid game effect expression");
  if (value.kind === "constant") {
    if (typeof value.value !== "string") throw new Error("Effect constants must be exact strings");
    parseGameEffectDecimal(value.value); return;
  }
  if (value.kind === "level" || value.kind === "baselineLevel") {
    if (value.code !== undefined && (typeof value.code !== "string" || !referenceByCode.has(value.code))) throw new Error("Unknown effect level reference");
    return;
  }
  if (value.kind === "profile" && text(value.key)) return;
  if (["add", "multiply", "min", "max"].includes(String(value.kind)) && Array.isArray(value.args) && value.args.length > 0 && value.args.length <= 64) {
    value.args.forEach(child => validateExpression(child, depth + 1)); return;
  }
  if (value.kind === "power") {
    validateExpression(value.base, depth + 1); validateExpression(value.exponent, depth + 1); return;
  }
  if (value.kind === "divide") {
    validateExpression(value.numerator, depth + 1); validateExpression(value.denominator, depth + 1); return;
  }
  if (value.kind === "floor" || value.kind === "truncate" || value.kind === "float32") {
    validateExpression(value.value, depth + 1); return;
  }
  if (value.kind === "ifZero") {
    validateExpression(value.condition, depth + 1); validateExpression(value.zero, depth + 1); validateExpression(value.otherwise, depth + 1); return;
  }
  if (value.kind === "ifLess") {
    validateExpression(value.left, depth + 1); validateExpression(value.right, depth + 1); validateExpression(value.then, depth + 1); validateExpression(value.otherwise, depth + 1); return;
  }
  if (value.kind === "totalLevels" && (value.excludeCodes === undefined || (Array.isArray(value.excludeCodes) && value.excludeCodes.every(code => typeof code === "string" && referenceByCode.has(code))))) return;
  throw new Error("Unsupported game effect expression");
}
/** Only declarative reviewed rules are accepted; raw observed text never executes. */
export function validateGameEffectCatalog(value: unknown): asserts value is GameEffectCatalog {
  if (!object(value) || value.schemaVersion !== 1 || !text(value.gameVersion) || !text(value.observedAt) || !text(value.evidence) || !text(value.verificationBoundary) || !object(value.targets) || !object(value.nodes)) throw new Error("Invalid game effect catalog");
  for (const target of Object.values(value.targets)) {
    if (!object(target) || !text(target.label) || !text(target.labelKo) || !text(target.iconCategory) || typeof target.unit !== "string" || !operations.has(String(target.operation)) || !aggregates.has(String(target.aggregate))) throw new Error("Invalid game effect target");
    if (target.generator !== undefined && (typeof target.generator !== "string" || !/^MK[1-8]$/.test(target.generator))) throw new Error("Invalid effect generator");
    if (target.summaryTargets !== undefined && (!Array.isArray(target.summaryTargets) || !target.summaryTargets.length || target.summaryTargets.length > 16 || new Set(target.summaryTargets).size !== target.summaryTargets.length || target.summaryTargets.some(key => typeof key !== "string" || !Object.hasOwn(value.targets as Record<string, unknown>, key)))) throw new Error("Invalid summary target");
    if ((target.operation === "mult" || target.operation === "divisor") && target.aggregate === "sum") throw new Error("A multiplier or divisor cannot be summed");
    if ((target.operation === "add" || target.operation === "percent") && target.aggregate === "product") throw new Error("An additive effect cannot be multiplied");
  }
  for (const [code, node] of Object.entries(value.nodes)) {
    if (!referenceByCode.has(code) || !object(node) || (node.maxLevel !== null && (!Number.isSafeInteger(node.maxLevel) || Number(node.maxLevel) < 1)) || (node.observedLevel !== null && (!Number.isSafeInteger(node.observedLevel) || Number(node.observedLevel) < 0 || (node.maxLevel !== null && Number(node.observedLevel) > Number(node.maxLevel)))) || !text(node.basis) || !Array.isArray(node.observed) || !node.observed.length || node.observed.some(item => typeof item !== "string") || !Array.isArray(node.effects) || !node.effects.length) throw new Error(`Invalid game effect node: ${code}`);
    if (node.evidence !== undefined && !text(node.evidence)) throw new Error(`Invalid node evidence: ${code}`);
    const seen = new Set<string>();
    for (const effect of node.effects) {
      if (!object(effect) || typeof effect.target !== "string" || !Object.hasOwn(value.targets, effect.target) || seen.has(effect.target)) throw new Error(`Invalid or duplicate game effect: ${code}`);
      seen.add(effect.target);
      // A directly observed target may remain explicitly unmodeled when shared
      // counters or conditional rules have not yet been verified.
      if (effect.expression !== undefined) validateExpression(effect.expression);
    }
  }
}
validateGameEffectCatalog(catalogue);
export const GAME_EFFECT_CATALOG: GameEffectCatalog = catalogue;
export const GAME_EFFECT_VERSION = GAME_EFFECT_CATALOG.gameVersion;
export function gameEffectCoverage(rules: GameEffectCatalog = GAME_EFFECT_CATALOG) {
  return reference.nodes.map(node => ({
    code: node.code,
    status: rules.nodes[node.code]?.effects.every(effect => effect.expression !== undefined) ? rules.nodes[node.code].sourceKind === "wiki" ? "documented" as const : "verified" as const : "pending" as const,
    observed: Boolean(rules.nodes[node.code] && rules.nodes[node.code].observedLevel !== null),
    sourceVersion: rules.nodes[node.code] ? sourceFor(rules.nodes[node.code], rules).version : null,
  }));
}
const pendingTarget: GameEffectTarget = { label: "Unverified game effect", labelKo: "인게임 효과 확인 대기", iconCategory: "unverified", operation: "add", unit: "", aggregate: "none" };
const zero = () => parseGameEffectDecimal("0");
const one = () => parseGameEffectDecimal("1");
function readLevel(code: string, state: ModState, rules: GameEffectCatalog): number {
  const node = referenceByCode.get(code);
  if (!node) throw new Error(`Unknown Mod: ${code}`);
  const level = state.levels[code] ?? 0;
  const declared = rules.nodes[code];
  const maximum = Math.min(declared ? declared.maxLevel ?? 99_999 : node.maxLevel, 99_999);
  if (!Number.isSafeInteger(level) || level < 0 || level > maximum) throw new Error(`Invalid level: ${code}`);
  return level;
}
function evaluateExpression(expression: GameEffectExpression, code: string, state: ModState, profile: PlayerProfile, rules: GameEffectCatalog, baseline: ModState = state): GameEffectDecimal {
  const evaluate = (value: GameEffectExpression) => evaluateExpression(value, code, state, profile, rules, baseline);
  switch (expression.kind) {
    case "constant": return parseGameEffectDecimal(expression.value);
    case "level": return parseGameEffectDecimal(String(readLevel(expression.code ?? code, state, rules)));
    case "baselineLevel": return parseGameEffectDecimal(String(readLevel(expression.code ?? code, baseline, rules)));
    case "profile": {
      const input = readGameDisplayInput(profile, expression.key);
      const parsed = parseCifiDecimal(input);
      if (parsed.coefficient < 0n) throw new Error(`Invalid profile input: ${expression.key}`);
      return parsed;
    }
    case "add": return expression.args.reduce((total, item) => addGameEffectDecimals(total, evaluate(item)), zero());
    case "multiply": return expression.args.reduce((total, item) => multiplyGameEffectDecimals(total, evaluate(item)), one());
    case "min": case "max": return expression.args.map(evaluate).reduce((a, b) => compareGameEffectDecimals(a, b) * (expression.kind === "min" ? 1 : -1) <= 0 ? a : b);
    case "divide": return divideGameEffectDecimals(evaluate(expression.numerator), evaluate(expression.denominator));
    case "floor": case "truncate": return roundGameEffectDecimal(evaluate(expression.value), expression.kind);
    case "float32": {
      const value = Math.fround(Number(gameEffectExact(evaluate(expression.value))));
      if (!Number.isFinite(value)) throw new Error("Non-finite native float effect");
      return parseGameEffectDecimal(String(value));
    }
    case "ifZero": return evaluate(evaluate(expression.condition).coefficient === 0n ? expression.zero : expression.otherwise);
    case "ifLess": return evaluate(compareGameEffectDecimals(evaluate(expression.left), evaluate(expression.right)) < 0 ? expression.then : expression.otherwise);
    case "totalLevels": return parseGameEffectDecimal(String(reference.nodes.reduce((sum, node) => sum + (expression.excludeCodes?.includes(node.code) ? 0 : readLevel(node.code, state, rules)), 0)));
    case "power": {
      const power = evaluate(expression.exponent);
      const base = evaluate(expression.base);
      const exponent = Number(gameEffectExact(power));
      // Preserve exact small integer powers. Large and noninteger native
      // powers are deliberately evaluated in mantissa/exponent form.
      const size = base.coefficient.toString().length * Math.abs(exponent);
      if (Number.isSafeInteger(exponent) && exponent >= 0 && exponent <= 99_999 && size <= 18_000) return powerGameEffectDecimal(base, exponent);
      return realPowerGameEffectDecimal(base, power);
    }
  }
}
export function formatGameEffectValue(value: GameEffectDecimal | string, target: Pick<GameEffectTarget, "operation" | "unit">): string {
  const decimal = typeof value === "string" ? parseGameEffectDecimal(value) : value;
  if (target.operation === "unlock") return decimal.coefficient > 0n ? "Unlocked" : "Locked";
  const prefix = target.operation === "mult" ? "×" : target.operation === "divisor" ? "/" : target.operation === "count" ? "" : decimal.coefficient >= 0n ? "+" : "";
  const suffix = target.unit === "%" || target.unit === "x" ? target.unit : target.unit ? ` ${target.unit}` : "";
  const formatted = formatGameEffectDecimal(decimal);
  return prefix + (target.operation === "count" || target.unit === "miners" ? formatted.replace(/\.00$/, "") : formatted) + (target.unit === "miners" ? "" : suffix);
}
function sourceFor(node: GameEffectNode, rules: GameEffectCatalog): GameEffectSource {
  return { version: node.sourceKind === "wiki" ? "Wiki · game version unconfirmed" : rules.gameVersion, observedAt: rules.observedAt, evidence: node.evidence ?? rules.evidence, basis: node.basis, observedLevel: node.observedLevel, observed: node.observed, purchaseVerified: false };
}
export function compareGameEffects(code: string, state: ModState, profile: PlayerProfile, rules: GameEffectCatalog = GAME_EFFECT_CATALOG): GameEffectComparison[] {
  if (!referenceByCode.has(code)) throw new Error(`Unknown Mod: ${code}`);
  const node = rules.nodes[code];
  let level = state.levels[code] ?? 0, nextLevel = level, invalid: string | undefined;
  try { level = readLevel(code, state, rules); nextLevel = Math.min(level + 1, node ? node.maxLevel ?? 99_999 : referenceByCode.get(code)!.maxLevel, 99_999); }
  catch (error) { invalid = error instanceof Error ? error.message : "Invalid level"; }
  const declarations: GameEffectNode["effects"] = node?.effects ?? [{ target: "unverified" }];
  return declarations.map((effect, index): GameEffectComparison => {
    const target = rules.targets[effect.target] ?? pendingTarget;
    const result: GameEffectComparison = { ...target, code, target: effect.target, index, level, nextLevel, current: "—", next: "—", currentExact: null, nextExact: null, currentValue: null, nextValue: null, verified: false, uncertain: true, status: invalid ? "invalid" : "pending", sourceVersion: node ? sourceFor(node, rules).version : null, source: node ? sourceFor(node, rules) : null, reason: invalid ?? (node ? "Documented target; cumulative rule not yet verified" : "Node not yet observed in game") };
    if (invalid || !effect.expression) return result;
    const errors: string[] = [];
    const at = (value: number): GameEffectDecimal | null => {
      try {
        const evaluated = evaluateExpression(effect.expression!, code, { ...state, levels: { ...state.levels, [code]: value } }, profile, rules, state);
        if ((target.operation === "mult" || target.operation === "divisor") && evaluated.coefficient <= 0n) throw new Error("Non-positive direct multiplier");
        return evaluated;
      } catch (error) { errors.push(error instanceof Error ? error.message : "Invalid game effect"); return null; }
    };
    const current = at(level), next = at(nextLevel);
    const values = {
      current: current ? formatGameEffectValue(current, target) : "—", next: next ? formatGameEffectValue(next, target) : "—",
      currentExact: current ? gameEffectExact(current) : null, nextExact: next ? gameEffectExact(next) : null,
      currentValue: current ? gameEffectExact(current) : null, nextValue: next ? gameEffectExact(next) : null,
    };
    if (errors.length) {
      const reason = errors.find(error => !error.startsWith("Missing profile input: ")) ?? errors[0];
      const missingInput = reason.startsWith("Missing profile input: ") ? reason.slice(23) : undefined;
      return { ...result, ...values, status: missingInput ? "missing-input" : "invalid", reason, missingInput };
    }
    return { ...result, ...values, verified: node.sourceKind !== "wiki", uncertain: false, status: node.sourceKind === "wiki" ? "documented" : "verified", reason: undefined };
  });
}
export type GameEffectSummaryRow = GameEffectTarget & {
  target: string; value: string; exact: string; partial: boolean; sourceVersion: string;
  contributors: { code: string; exact: string; source: GameEffectSource | null }[];
};
/** A model-derived subtotal of registered direct effects, not an observed
 * whole-game total. Pending owned nodes make all totals explicitly partial. */
export function summarizeGameEffects(state: ModState, profile: PlayerProfile, rules: GameEffectCatalog = GAME_EFFECT_CATALOG) {
  const recorded = Object.entries(state.levels).filter(([, level]) => level !== 0).sort(([a], [b]) => a.localeCompare(b));
  const values = new Map<string, { target: GameEffectTarget; value: GameEffectDecimal; contributors: GameEffectSummaryRow["contributors"] }>();
  const uncertain = new Set<string>();
  const minersWithoutHQ = !state.levels.G03 && ["G04", "G05", "G06", "G07"].some(code => state.levels[code] > 0);
  const contributors = minersWithoutHQ ? [...recorded, ["G03", 0] as const] : recorded;
  for (const [code] of contributors) {
    if (!referenceByCode.has(code)) { uncertain.add(code); continue; }
    for (const effect of compareGameEffects(code, state, profile, rules)) {
      if (minersWithoutHQ && code === "G03" && effect.target !== "minerShards") continue;
      if (effect.currentExact === null) { uncertain.add(code); continue; }
      if (effect.aggregate === "none" || effect.operation === "unlock") continue;
      const current = parseGameEffectDecimal(effect.currentExact);
      for (const key of effect.summaryTargets ?? [effect.target]) {
      const previous = values.get(key);
      try {
        const value = previous ? (effect.aggregate === "product" ? multiplyGameEffectDecimals(previous.value, current) : addGameEffectDecimals(previous.value, current)) : current;
        values.set(key, { target: rules.targets[key], value, contributors: [...(previous?.contributors ?? []), { code, exact: effect.currentExact, source: effect.source }] });
      } catch {
        // A precision-limited contribution must not crash or silently produce a
        // full-looking subtotal. Retain only the successfully evaluated terms.
        uncertain.add(code);
      }
      }
    }
  }
  const partial = uncertain.size > 0;
  const effects: GameEffectSummaryRow[] = [...values].map(([target, item]) => ({ ...item.target, target, value: formatGameEffectValue(item.value, item.target), exact: gameEffectExact(item.value), partial: partial || item.contributors.some(entry => entry.source?.basis.startsWith("wiki")), sourceVersion: rules.gameVersion, contributors: item.contributors }));
  const coverage = gameEffectCoverage(rules);
  return { effects, uncertain: [...uncertain], purchasedNodes: recorded.filter(([, level]) => level > 0).length, partial, coverage, sourceVersion: rules.gameVersion, aggregationVerifiedInGame: false as const };
}
