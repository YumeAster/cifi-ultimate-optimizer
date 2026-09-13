import { DIAMOND_UPGRADES, TOKEN_UPGRADES } from "./rules.ts";
import type { Currency, UpgradeRule } from "./types.ts";

export type StoredOptimizerProfile = {
  version: 1;
  budgets: Record<Currency, string>;
  longRunHours: number;
  levels: Record<Currency, Record<string, number>>;
};

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function blankStoredProfile(): StoredOptimizerProfile {
  return { version: 1, budgets: { diamond: "0", token: "0" }, longRunHours: 24, levels: { diamond: {}, token: {} } };
}

function restoreLevels(value: unknown, rules: readonly UpgradeRule[]): Record<string, number> {
  const input = record(value);
  return Object.fromEntries(rules.flatMap((rule) => {
    const level = input[rule.id];
    return typeof level === "number" && Number.isFinite(level)
      ? [[rule.id, Math.min(rule.maxLevel, Math.max(0, Math.floor(level)))]] : [];
  }));
}

/** Validate persisted data before it can reach exact-integer arithmetic or unlock totals. */
export function restoreOptimizerProfile(value: unknown): StoredOptimizerProfile {
  const input = record(value);
  const budgets = record(input.budgets);
  const levels = record(input.levels);
  return {
    version: 1,
    budgets: { diamond: typeof budgets.diamond === "string" ? budgets.diamond : "0", token: typeof budgets.token === "string" ? budgets.token : "0" },
    longRunHours: typeof input.longRunHours === "number" && Number.isFinite(input.longRunHours) ? Math.min(24, Math.max(1, input.longRunHours)) : 24,
    levels: { diamond: restoreLevels(levels.diamond, DIAMOND_UPGRADES), token: restoreLevels(levels.token, TOKEN_UPGRADES) },
  };
}
