import { getShipInstalls } from "./catalog.ts";
import {
  addGameEffectDecimals, compareGameEffectDecimals, gameEffectExact, multiplyGameEffectDecimals,
  parseGameEffectDecimal, type GameEffectDecimal,
} from "../mod-tree/gameEffectDecimal.ts";
import { activeInstallGenerators, MissingShipInput, readInstallDependency, readInstallWeight, readShipNumber, shipProfileKey } from "./profile.ts";
import type { InstallDefinition, InstallEffectRule, InstallEffectValue, InstallEvaluation, InstallLevels, InstallResource, InstallSequence, InstallSequenceStep, ShipInstallContext } from "./types.ts";

export const MAX_INSTALL_PLAN_STEPS = 2_000;
export const INSTALL_RECOMMENDATION_MODES = [
  { id: "mp", label: "MP 위주" },
  { id: "shards-research", label: "Shard / RP 위주" },
  { id: "shards", label: "Shard 위주" },
  { id: "research", label: "RP 위주" },
  { id: "weights", label: "가중치 프리셋 사용" },
] as const;
export const INSTALL_RESOURCE_LABELS: Readonly<Record<InstallResource, string>> = {
  cells: "Cells", modPoints: "MP", shards: "Shards", research: "Research Points", academyPoints: "Academy Points", materials: "Materials",
  mk1: "MK1 생산량", mk2: "MK2 생산량", mk3: "MK3 생산량", mk4: "MK4 생산량", mk5: "MK5 생산량", mk6: "MK6 생산량", mk7: "MK7 생산량", mk8: "MK8 생산량", mk9: "MK9 생산량",
  allGenerators: "전체 발전기", hardware: "Hardware Tech", software: "Software Tech", operations: "다음 Run Operations",
};
const ZERO = parseGameEffectDecimal("0"), ONE = parseGameEffectDecimal("1");
const unique = <T,>(values: readonly T[]) => [...new Set(values)];
const mainResources = new Set<InstallResource>(["modPoints", "shards", "research", "academyPoints", "materials"]);
const auxiliary = (resource: InstallResource) => resource === "cells" || /^mk[1-9]$/.test(resource) || resource === "allGenerators" || resource === "hardware" || resource === "software";
export const allocatedInstallPoints = (levels: InstallLevels): number => Object.values(levels).reduce((sum, level) => sum + level, 0);
export const installMaxLevel = (node: InstallDefinition, capExpanded = false): number => node.maxLevel * (capExpanded ? 5 : 1);

function targets(context: ShipInstallContext): readonly InstallResource[] {
  switch (context.mode) {
    case "mp": return ["modPoints"];
    case "shards-research": return ["shards", "research"];
    case "shards": return ["shards"];
    case "research": return ["research"];
    default: return [];
  }
}

/** Mixed effects cannot be separated: a target + incidental resource remains a target.
 * A forbidden main resource + auxiliary-only effect cannot bypass the restriction. */
export function installModePermission(node: InstallDefinition, context: ShipInstallContext): InstallEvaluation["reason"] {
  if (context.mode === "weights") return "weighted";
  if (node.effects.some(effect => targets(context).includes(effect.resource))) return "target";
  if (node.effects.some(effect => mainResources.has(effect.resource))) return "forbidden";
  return node.effects.every(effect => auxiliary(effect.resource)) ? "auxiliary" : "forbidden";
}

export function validateInstallContext(context: ShipInstallContext): string[] {
  const errors: string[] = [];
  const nodes = getShipInstalls(context.ship);
  if (nodes.length !== 11) errors.push("지원하지 않는 함선입니다.");
  if (!Number.isSafeInteger(context.totalPoints) || context.totalPoints < 0 || context.totalPoints > 1_000_000) errors.push("Current Installs는 0~1,000,000 사이의 정수여야 합니다.");
  if (!INSTALL_RECOMMENDATION_MODES.some(mode => mode.id === context.mode)) errors.push("추천 방식을 확인하세요.");
  if (context.capExpanded !== undefined && typeof context.capExpanded !== "boolean") errors.push("상한 확대는 연구 해금 여부로 지정해야 합니다.");
  for (const [key, level] of Object.entries(context.levels)) {
    const node = nodes.find(item => item.position === Number(key));
    if (!node || !Number.isSafeInteger(level) || level < 0 || level > installMaxLevel(node, context.capExpanded)) errors.push(`Install ${key} 레벨 또는 상한을 확인하세요.`);
  }
  if (context.excluded?.some(position => !nodes.some(node => node.position === position))) errors.push("제외할 Install 번호를 확인하세요.");
  const allocated = allocatedInstallPoints(context.levels);
  if (Number.isFinite(allocated) && allocated > context.totalPoints) errors.push("배분한 레벨 합계가 Current Installs를 초과합니다.");
  // Prove that the baseline can be reached without buying a locked node first.
  if (!errors.length) {
    const pending = nodes.filter(node => (context.levels[node.position] ?? 0) > 0);
    let reachable = 0;
    while (pending.length) {
      const index = pending.findIndex(node => node.unlockAt <= reachable);
      if (index < 0) { errors.push("현재 배분에 해금 조건을 충족하지 못한 Install이 있습니다."); break; }
      const [node] = pending.splice(index, 1);
      reachable += context.levels[node.position] ?? 0;
    }
  }
  return errors;
}

/** UI convention only; exact decimal values remain available separately. */
export function formatInstallNumber(raw: string): string {
  const value = parseGameEffectDecimal(raw);
  if (!value.coefficient) return "0";
  const digits = value.coefficient.toString(), magnitude = digits.length + value.exponent - 1;
  if (magnitude >= 5) {
    const padded = digits.padEnd(5, "0");
    let rounded = Number(padded.slice(0, 4)) + (Number(padded[4]) >= 5 ? 1 : 0);
    let exponent = magnitude;
    if (rounded === 10_000) { rounded = 1_000; exponent++; }
    const mantissa = rounded.toString().padStart(4, "0");
    return `${mantissa[0]}.${mantissa.slice(1)}e${exponent}`;
  }
  const numeric = Number(raw);
  return numeric.toLocaleString("en-US", { maximumFractionDigits: 3 });
}
const display = (raw: string | null, kind: "multiplier" | "additive") => raw === null ? "입력 확인" : `${kind === "multiplier" ? "×" : "+"}${formatInstallNumber(raw)}`;
function decimalLog(value: GameEffectDecimal): number {
  if (value.coefficient <= 0n) return -Infinity;
  const digits = value.coefficient.toString(), head = digits.slice(0, 16);
  return (value.exponent + digits.length - head.length) * Math.LN10 + Math.log(Number(head));
}

function directValue(node: InstallDefinition, rule: InstallEffectRule, level: number, context: ShipInstallContext): GameEffectDecimal {
  const kind = rule.kind ?? "multiplier";
  if (level === 0) return kind === "multiplier" ? ONE : ZERO;
  const crew = readShipNumber(context.profile, shipProfileKey(context.ship, "Crew"));
  let dependency = readInstallDependency(context, rule.dependency);
  if (rule.dependencyZeroPolicy === "at-least-one" && compareGameEffectDecimals(dependency, ONE) < 0) dependency = ONE;
  if (rule.dependencyZeroPolicy === "one-plus") dependency = addGameEffectDecimals(ONE, dependency);
  const modifierKey = kind === "additive" ? "operationsMultiplier" : "multiplier";
  const rawModifier = context.modifiers?.byPosition?.[node.position] ?? context.modifiers?.[modifierKey];
  const modifier = rawModifier === undefined || rawModifier === "" ? ONE : readShipNumber({ modifier: rawModifier }, "modifier");
  const factors = [parseGameEffectDecimal(String(rule.coefficientPercent)), dependency, crew, parseGameEffectDecimal(String(level)), modifier];
  let bonus = factors.reduce(multiplyGameEffectDecimals, ONE);
  if (kind === "multiplier") bonus = multiplyGameEffectDecimals(bonus, parseGameEffectDecimal("0.01"));
  return kind === "multiplier" ? addGameEffectDecimals(ONE, bonus) : bonus;
}

export function installEffects(context: ShipInstallContext, position: number, nextLevel?: number): InstallEffectValue[] {
  const node = getShipInstalls(context.ship).find(item => item.position === position);
  if (!node) return [];
  const currentLevel = context.levels[position] ?? 0;
  const next = nextLevel ?? Math.min(currentLevel + 1, installMaxLevel(node, context.capExpanded));
  return node.effects.map(rule => {
    const kind = rule.kind ?? "multiplier";
    const missing: string[] = [], warnings = [...(node.notes ?? [])];
    if (context.modifiers?.byPosition?.[position] === undefined && !context.modifiers?.[kind === "additive" ? "operationsMultiplier" : "multiplier"])
      warnings.push("기본 효과 모델: Gear·Badge·연구의 추가 배율은 반영하지 않았습니다.");
    else warnings.push("입력한 보정 배율을 사용한 효과 모델입니다. 모든 게임 분기의 실측 검증을 의미하지 않습니다.");
    if (rule.dependency && !rule.dependencyZeroPolicy) warnings.push("진행도 0 보정 규칙은 미검증이며 입력한 값을 그대로 사용합니다.");
    if (kind === "additive") warnings.push("다음 Run에 적용되는 추가 Operations입니다. 현재 자원 배율과 별개입니다.");
    let currentValue: GameEffectDecimal | null = null, nextValue: GameEffectDecimal | null = null;
    for (const [level, isNext] of [[currentLevel, false], [next, true]] as const) {
      try {
        // Conflicting native tooltip/base values must not be sold as a verified game effect.
        if (node.verification === "native-tooltip-conflict" && level > 0) throw new MissingShipInput([`${node.id}:effectVerification`]);
        const value = directValue(node, rule, level, context);
        if (isNext) nextValue = value; else currentValue = value;
      } catch (error) {
        missing.push(...(error instanceof MissingShipInput ? error.keys : [`${node.id}:effectRange`]));
      }
    }
    const current = currentValue === null ? null : gameEffectExact(currentValue);
    const nextRaw = nextValue === null ? null : gameEffectExact(nextValue);
    // Additive operations need a separately reviewed time/operation valuation, not a fake multiplier.
    const logGain = kind === "multiplier" && currentValue && nextValue ? Math.max(0, decimalLog(nextValue) - decimalLog(currentValue)) : null;
    return { resource: rule.resource, label: INSTALL_RESOURCE_LABELS[rule.resource], kind, current, next: nextRaw,
      currentDisplay: display(current, kind), nextDisplay: display(nextRaw, kind), missing: unique(missing), warnings: unique(warnings), logGain };
  });
}

/** Recommendation model: weighted marginal logarithms, not the displayed effect.
 * Named modes use an independent unit mask, with Cells/chain efficiency eligible.
 * An auxiliary may beat every direct-target purchase (and consume the whole
 * finite budget); the user explicitly permits efficiency-based extra allocation.
 * "Target" is a resource eligibility rule, not an artificial infinite priority.
 * Only the explicit weights mode consumes the current weight preset. This local
 * marginal heuristic does not establish a globally optimal final allocation. */
function effectScore(effect: InstallEffectValue, context: ShipInstallContext): number {
  if (effect.logGain === null) throw new MissingShipInput([`${effect.resource}:scoreModel`]);
  const resource = effect.resource;
  if (context.mode !== "weights" && mainResources.has(resource) && !targets(context).includes(resource)) return 0;
  if (resource === "operations") throw new MissingShipInput(["operations:scoreModel"]);
  const weight = (key: string) => context.mode === "weights" ? readInstallWeight(context, key) : 1;
  if (resource === "allGenerators") return effect.logGain * activeInstallGenerators(context).length * weight("cells");
  if (/^mk[1-9]$/.test(resource)) {
    const id = Number(resource.slice(2));
    const active = context.activeGenerators !== undefined ? activeInstallGenerators(context).includes(id)
      : compareGameEffectDecimals(readShipNumber(context.profile, `manualMk${id}`), ZERO) > 0;
    return effect.logGain * (active ? 1 : 0) * weight("cells");
  }
  // Tech effects are shown directly. Their downstream conversion is not established.
  if (resource === "hardware" || resource === "software") throw new MissingShipInput([`${resource}:scoreModel`]);
  return effect.logGain * weight(resource);
}

export function evaluateInstall(context: ShipInstallContext, position: number): InstallEvaluation {
  const node = getShipInstalls(context.ship).find(item => item.position === position);
  if (!node) throw new RangeError(`Unknown Install: ${context.ship}-${position}`);
  const errors = validateInstallContext(context);
  const level = context.levels[position] ?? 0, maxLevel = installMaxLevel(node, context.capExpanded);
  const allocated = allocatedInstallPoints(context.levels), remaining = Math.max(0, context.totalPoints - allocated);
  const reason = installModePermission(node, context), effects = installEffects(context, position);
  const missing = effects.flatMap(effect => effect.missing), warnings = effects.flatMap(effect => effect.warnings);
  let score: number | null = 0;
  for (const effect of effects) {
    try { score += effectScore(effect, context); }
    catch (error) { score = null; missing.push(...(error instanceof MissingShipInput ? error.keys : ["scoreRange"])); break; }
  }
  if (score !== null && !Number.isFinite(score)) { score = null; missing.push("scoreRange"); }
  return { node, position, level, maxLevel, allocated, remaining,
    unlocked: allocated >= node.unlockAt, affordable: !errors.length && remaining >= 1,
    maxed: level >= maxLevel, excluded: context.excluded?.includes(position) ?? false,
    permitted: reason !== "forbidden", reason, effects, missing: unique(missing), warnings: unique(warnings), score,
    error: errors.length ? errors.join(" ") : null };
}

export function evaluateInstalls(context: ShipInstallContext): InstallEvaluation[] {
  return getShipInstalls(context.ship).map(node => evaluateInstall(context, node.position));
}
export function rankInstalls(context: ShipInstallContext): InstallEvaluation[] {
  if (context.mode !== "weights" && !getShipInstalls(context.ship).some(node => installModePermission(node, context) === "target")) return [];
  return evaluateInstalls(context).filter(item => item.unlocked && item.affordable && !item.maxed && !item.excluded && item.permitted && !item.error && item.score !== null && item.score > 0)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.position - b.position);
}

export type InstallAggregateEffect = Readonly<{
  resource: InstallResource; label: string; kind: "multiplier" | "additive";
  value: string | null; display: string; missing: readonly string[]; warnings: readonly string[]; contributors: readonly number[];
}>;
/** Direct per-resource products only. No chain-power or weights enter this tab. */
export function aggregateEffects(context: ShipInstallContext): InstallAggregateEffect[] {
  const groups = new Map<InstallResource, { kind: "multiplier" | "additive"; value: GameEffectDecimal | null; missing: string[]; warnings: string[]; contributors: number[] }>();
  for (const node of getShipInstalls(context.ship)) {
    if ((context.levels[node.position] ?? 0) <= 0) continue;
    for (const effect of installEffects(context, node.position, context.levels[node.position])) {
      const current = groups.get(effect.resource) ?? { kind: effect.kind, value: effect.kind === "multiplier" ? ONE : ZERO, missing: [], warnings: [], contributors: [] };
      current.value = effect.current === null || current.value === null ? null : (effect.kind === "multiplier" ? multiplyGameEffectDecimals : addGameEffectDecimals)(current.value, parseGameEffectDecimal(effect.current));
      current.missing.push(...effect.missing); current.warnings.push(...effect.warnings); current.contributors.push(node.position);
      groups.set(effect.resource, current);
    }
  }
  return [...groups].map(([resource, result]) => {
    const value = result.value === null ? null : gameEffectExact(result.value);
    return { resource, label: INSTALL_RESOURCE_LABELS[resource], kind: result.kind, value, display: display(value, result.kind), missing: unique(result.missing), warnings: unique(result.warnings), contributors: result.contributors };
  });
}

function purchasable(item: InstallEvaluation): boolean {
  return item.unlocked && item.affordable && !item.maxed && !item.excluded && !item.error;
}
function sortedCandidates(items: readonly InstallEvaluation[]): InstallEvaluation[] {
  return [...items].sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.position - b.position);
}

/** The unlock gate depends solely on cumulative allocations. Prefer allowed nodes;
 * forbidden resources are a last-resort filler, and only until a real target is
 * reachable within this budget. This minimizes the count of forbidden allocations.
 * Returned paths are an unlock lookahead heuristic, not a global optimality proof. */
function unlockPath(context: ShipInstallContext, target: InstallEvaluation): InstallSequenceStep[] | null {
  const needed = target.node.unlockAt - allocatedInstallPoints(context.levels);
  const available = context.totalPoints - allocatedInstallPoints(context.levels);
  if (needed < 0 || needed + 1 > available || needed + 1 > MAX_INSTALL_PLAN_STEPS) return null;
  const levels: Record<number, number> = { ...context.levels }, path: InstallSequenceStep[] = [];
  while (allocatedInstallPoints(levels) < target.node.unlockAt) {
    const state = { ...context, levels }, items = evaluateInstalls(state).filter(purchasable);
    const allowed = items.filter(item => item.permitted);
    // A zero/unknown efficiency still can legally satisfy an indispensable unlock.
    const candidate = sortedCandidates(allowed.length ? allowed : items)[0];
    if (!candidate) return null;
    path.push({ index: path.length + 1, position: candidate.position, from: candidate.level, to: candidate.level + 1, reason: "prerequisite", score: candidate.score ?? 0 });
    levels[candidate.position] = candidate.level + 1;
  }
  const unlocked = evaluateInstall({ ...context, levels }, target.position);
  if (!purchasable(unlocked) || !unlocked.permitted || unlocked.score === null || unlocked.score <= 0) return null;
  path.push({ index: path.length + 1, position: unlocked.position, from: unlocked.level, to: unlocked.level + 1, reason: unlocked.reason as InstallSequenceStep["reason"], score: unlocked.score });
  return path;
}

export function generateSequence(context: ShipInstallContext, maxSteps = MAX_INSTALL_PLAN_STEPS): InstallSequence {
  const errors = validateInstallContext(context), warnings = ["한계 효율과 해금 경로를 비교하는 휴리스틱입니다. 전역 최적해를 보장하지 않습니다."];
  const baselineLevels: Record<number, number> = Object.fromEntries(getShipInstalls(context.ship).map(node => [node.position, context.levels[node.position] ?? 0]));
  const levels: Record<number, number> = { ...baselineLevels }, steps: InstallSequenceStep[] = [];
  let stopped: InstallSequence["stopped"] = "no-candidate";
  const limit = Number.isSafeInteger(maxSteps) ? Math.max(0, Math.min(MAX_INSTALL_PLAN_STEPS, maxSteps)) : 0;
  if (errors.length) stopped = "invalid-input";
  else if (context.mode !== "weights" && !getShipInstalls(context.ship).some(node => installModePermission(node, context) === "target")) {
    stopped = "no-target"; warnings.push("이 함선에는 선택한 목표 자원의 직접 효과가 없습니다. 다른 추천 방식을 선택하세요.");
  } else {
    while (steps.length < limit && allocatedInstallPoints(levels) < context.totalPoints) {
      const state = { ...context, levels }, items = evaluateInstalls(state);
      const eligible = sortedCandidates(items.filter(item => purchasable(item) && item.permitted && item.score !== null && item.score > 0));
      let path: InstallSequenceStep[] | null = eligible[0] ? [{ index: 1, position: eligible[0].position, from: eligible[0].level, to: eligible[0].level + 1, reason: eligible[0].reason as InstallSequenceStep["reason"], score: eligible[0].score ?? 0 }] : null;
      let pathScore = path?.[0].score ?? -Infinity;
      // Positive permitted purchases already advance every cumulative unlock.
      // Look ahead only at a dead end; doing a fresh 100-point simulation for
      // every candidate at every step would freeze the interactive planner.
      for (const target of (!path ? items : []).filter(item => !item.unlocked && !item.maxed && !item.excluded && item.permitted && item.score !== null && item.score > 0 && (context.mode === "weights" || item.reason === "target"))) {
        const candidate = unlockPath(state, target);
        if (!candidate || candidate.length > limit - steps.length) continue;
        const average = candidate.reduce((sum, step) => sum + step.score, 0) / candidate.length;
        if (!path || average > pathScore) { path = candidate; pathScore = average; }
      }
      if (!path) {
        const missing = unique(items.filter(item => item.permitted && !item.maxed && !item.excluded).flatMap(item => item.missing));
        if (missing.length) warnings.push(`일부 효과/효율 계산에 필요한 입력 또는 검증: ${missing.join(", ")}`);
        break;
      }
      for (const step of path) {
        steps.push({ ...step, index: steps.length + 1 }); levels[step.position] = step.to;
      }
    }
    if (allocatedInstallPoints(levels) >= context.totalPoints) stopped = "budget";
    else if (steps.length >= limit) stopped = "limit";
  }
  return { steps, baselineLevels, targetLevels: levels, spent: steps.length,
    remaining: Math.max(0, context.totalPoints - allocatedInstallPoints(levels)), stopped, warnings: unique(warnings), errors,
    strategy: "marginal-greedy-with-unlock-lookahead" };
}

/** Revalidate saved/imported queues against *current* caps, budget and unlocks. */
export function validateInstallSequence(context: ShipInstallContext, steps: readonly InstallSequenceStep[]): string[] {
  const errors = validateInstallContext(context), levels = { ...context.levels };
  if (steps.length > MAX_INSTALL_PLAN_STEPS) errors.push("구매 순서가 허용 길이를 초과합니다.");
  if (errors.length) return errors;
  for (const [index, step] of steps.entries()) {
    const node = getShipInstalls(context.ship).find(item => item.position === step.position);
    if (!node) { errors.push(`${index + 1}번째 Install 번호 오류`); break; }
    const item = evaluateInstall({ ...context, levels }, step.position);
    if (step.index !== index + 1 || step.from !== (levels[step.position] ?? 0) || step.to !== step.from + 1 || !purchasable(item)) { errors.push(`${index + 1}번째 구매의 레벨·해금·예산·제외 조건 오류`); break; }
    if (!item.permitted) {
      const allowedFiller = evaluateInstalls({ ...context, levels }).some(candidate => purchasable(candidate) && candidate.permitted);
      const futureTarget = steps.slice(index + 1).some(future => {
        const target = getShipInstalls(context.ship).find(candidate => candidate.position === future.position);
        return target && target.unlockAt > allocatedInstallPoints(levels) && installModePermission(target, context) === "target";
      });
      if (step.reason !== "prerequisite" || allowedFiller || !futureTarget) { errors.push(`${index + 1}번째 구매는 목표 해금에 필요한 최소 배분이 아닙니다.`); break; }
    }
    levels[step.position] = step.to;
  }
  return errors;
}
