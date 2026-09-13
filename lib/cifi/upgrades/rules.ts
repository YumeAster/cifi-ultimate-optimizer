import type { ChestReward, Currency, GeneratorId, PowerRule, ShipId, UnlockRule, UpgradeCategory, UpgradeEffects, UpgradeRule } from "./types.ts";

export const UPGRADE_RULESET_META = Object.freeze({
  sourceVersion: "CIFI Optimizer v1.10.30",
  compatibility: "corrected" as const,
  preservesLegacyBudgetBug: false,
  tieBreak: "original-physical-row-order" as const,
  diamondRuleCount: 46,
  tokenRuleCount: 23,
});

type RawUnlockKind = "generator" | "ship" | "tier" | "large";
type RawPowerMode = "weighted" | "tokenCells" | "constant1" | "constant999" | "constant9999";
type RawChestReward = readonly [currency: Currency, chest: ChestReward["chest"], amountPerLevel: number];
type RawRule = readonly [
  sourceRow: number, id: string, name: string, category: UpgradeCategory,
  baseCost: number, costScaling: number, maxLevel: number,
  unlockKind: RawUnlockKind, unlockTarget: GeneratorId | ShipId | 2 | 3 | "DiamondsOneTimers",
  cells: readonly number[], modPoints: readonly number[], shards: readonly number[],
  research: readonly number[], academyPoints: readonly number[], materials: readonly number[],
  powerMode?: RawPowerMode,
  chestReward?: RawChestReward,
];

// Only game rule constants are retained here. Player levels, currencies, cached results,
// source document identifiers, and other personal workbook state are intentionally absent.
const DIAMOND_RAW: readonly RawRule[] = [
  [5, "MK1", "MK1 Gen Boost", "generator", 10, 1, 100, "generator", "MK1", [1.01], [], [], [], [], []],
  [6, "MK2", "MK2 Gen Boost", "generator", 20, 2, 100, "generator", "MK2", [1.02], [], [], [], [], []],
  [7, "MK3", "MK3 Gen Boost", "generator", 30, 3, 100, "generator", "MK3", [1.03], [], [], [], [], []],
  [8, "MK4", "MK4 Gen Boost", "generator", 40, 4, 100, "generator", "MK4", [1.04], [], [], [], [], []],
  [9, "MK5", "MK5 Gen Boost", "generator", 50, 5, 100, "generator", "MK5", [1.05], [], [], [], [], []],
  [10, "MK6", "MK6 Gen Boost", "generator", 60, 6, 100, "generator", "MK6", [1.06], [], [], [], [], []],
  [11, "MK7", "MK7 Gen Boost", "generator", 70, 7, 100, "generator", "MK7", [1.07], [], [], [], [], []],
  [12, "MK8", "MK8 Gen Boost", "generator", 80, 8, 100, "generator", "MK8", [1.08], [], [], [], [], []],
  [15, "Tokens", "Tokens Boost", "special", 100, 200, 6, "generator", "MK2", [], [], [], [], [], []],
  [16, "Cells", "Cells Boost", "special", 200, 1, 1000, "generator", "MK2", [1.25], [], [], [], [], []],
  [17, "Mods", "Mod Points Boost", "special", 300, 10, 30, "ship", "Zagreus", [], [1.07], [], [], [], []],
  [18, "Shards", "Shards Boost", "special", 400, 20, 30, "ship", "Demeter", [], [], [1.07], [], [], []],
  [19, "Research", "Research Points Boost", "special", 500, 25, 30, "ship", "Koios", [], [], [], [1.1], [], []],
  [20, "Academy", "Academy Boost", "special", 600, 30, 30, "ship", "Zeus", [], [], [], [], [1.05], []],
  [21, "AllGens", "All Gens Boost", "special", 700, 35, 30, "generator", "MK8", [1.15, 1.15, 1.15, 1.15, 1.15, 1.15, 1.15, 1.15], [], [], [], [], []],
  [22, "Mats", "Mats Boost", "special", 700, 25, 30, "ship", "Zeus", [], [], [], [], [], [1.05]],
  [25, "Alpha", "Alpha Card", "oneTimer", 1000, 0, 1, "generator", "MK2", [1.3, 1.78, 1.54], [], [], [], [], []],
  [26, "Beta", "Beta Card", "oneTimer", 1000, 0, 1, "generator", "MK3", [1.54, 1.54, 1.54], [], [], [], [], []],
  [27, "Ceti", "Ceti Card", "oneTimer", 1000, 0, 1, "generator", "MK3", [1.24, 1.32], [1.08], [], [], [], []],
  [28, "Delta", "Delta Card", "oneTimer", 1500, 0, 1, "generator", "MK3", [2.3, 1.14, 1.14], [], [], [], [], []],
  [29, "Epsilon", "Epsilon Card", "oneTimer", 1500, 0, 1, "generator", "MK4", [1.52, 1.52, 1.44], [], [], [], [], []],
  [30, "Fenix", "Fenix Card", "oneTimer", 1500, 0, 1, "generator", "MK4", [1.16, 1.5], [1.07], [], [], [], []],
  [31, "Gamma", "Gamma Card", "oneTimer", 2000, 0, 1, "generator", "MK5", [2.4, 1.34, 1.34], [], [], [], [], []],
  [32, "Helion", "Helion Card", "oneTimer", 2000, 0, 1, "generator", "MK2", [1.68, 1.68], [1.13], [], [], [], []],
  [33, "Ixion", "Ixion Card", "oneTimer", 2000, 0, 1, "generator", "MK5", [1.64, 1.52], [1.16], [], [], [], []],
  [34, "Juno", "Juno Card", "oneTimer", 2500, 0, 1, "ship", "Demeter", [1.65], [1.25], [1.45], [], [], []],
  [35, "Kappa", "Kappa Card", "oneTimer", 2500, 0, 1, "generator", "MK6", [2.84, 1.92], [1.4], [], [], [], []],
  [36, "Lyra", "Lyra Card", "oneTimer", 2500, 0, 1, "ship", "Demeter", [2.16, 2.12], [], [1.5], [], [], []],
  [37, "Miko", "Miko Card", "oneTimer", 3000, 0, 1, "generator", "MK7", [3], [1.32], [], [1.34], [], []],
  [38, "Nora", "Nora Card", "oneTimer", 3000, 0, 1, "ship", "Zeus", [2.08, 1.71], [], [], [], [1.23], []],
  [39, "Omega", "Omega Card", "oneTimer", 3000, 0, 1, "ship", "Zeus", [], [1.1], [1.42], [], [1.4], []],
  [40, "Pegasus", "Pegasus Card", "oneTimer", 3500, 0, 1, "generator", "MK8", [5.5, 2.8], [], [], [1.5], [], []],
  [41, "Qoru", "Qoru Card", "oneTimer", 3500, 0, 1, "generator", "MK8", [4.9, 3.6, 2.2], [], [], [], [], []],
  [42, "Rigel", "Rigel Card", "oneTimer", 3500, 0, 1, "ship", "Zeus", [], [], [1.62], [1.46], [1.15], []],
  [43, "Sigma", "Sigma Card", "oneTimer", 4000, 0, 1, "generator", "MK7", [4.4, 3.8], [1.75], [], [], [], []],
  [44, "Typhon", "Typhon Card", "oneTimer", 4000, 0, 1, "ship", "Koios", [5.46, 2.44], [], [], [2], [], []],
  [45, "Utopia", "Utopia Card", "oneTimer", 4000, 0, 1, "ship", "Zeus", [3.88, 3.44], [], [], [], [1.2], []],
  [46, "Vex", "Vex Card", "oneTimer", 4500, 0, 1, "generator", "MK8", [4], [2.2], [1.7], [], [], []],
  [47, "Xeno", "Xeno Card", "oneTimer", 4500, 0, 1, "generator", "MK8", [4], [], [1.9], [2.8], [], []],
  [48, "Zion", "Zion Card", "oneTimer", 4500, 0, 1, "generator", "MK8", [4], [], [1.95], [], [1.1], []],
  [51, "Andromeda", "Andromeda Card", "largeOneTimer", 5000, 0, 1, "large", "DiamondsOneTimers", [2.33, 6.05, 4.19], [], [], [], [], []],
  [52, "Beerus", "Beerus Card", "largeOneTimer", 5000, 0, 1, "large", "DiamondsOneTimers", [4.19, 4.19, 4.19], [], [], [], [], []],
  [53, "Centurion", "Centurion Card", "largeOneTimer", 5000, 0, 1, "large", "DiamondsOneTimers", [1.63, 4.75], [2.15], [], [], [], []],
  [54, "Dahl", "Dahl Card", "largeOneTimer", 5000, 0, 1, "large", "DiamondsOneTimers", [5.24, 2.12, 3.2], [], [], [1.2], [], []],
  [55, "Elyisium", "Elysium Card", "largeOneTimer", 5000, 0, 1, "large", "DiamondsOneTimers", [6.33, 2.05, 4.5], [], [1.2], [], [], []],
  [56, "Ferrick", "Ferrick Card", "largeOneTimer", 5000, 0, 1, "large", "DiamondsOneTimers", [4.19, 2.33], [1.95], [], [], [1.2], []],
];

const TOKEN_RAW: readonly RawRule[] = [
  // Verified from the in-game Tier 1 cards: these are additive chest rewards,
  // not 2x multipliers to generators and progression resources.
  [5, "Token", "Tokens Boost", "tier1", 20, 5, 20, "generator", "MK2", [], [], [], [], [], [], "constant999", ["token", "Token Chests", 0.2]],
  [6, "Diamond", "Diamonds Boost", "tier1", 200, 300, 2, "generator", "MK2", [], [], [], [], [], [], "constant999", ["diamond", "Diamond Chests", 1]],
  [7, "Cells", "Cells Boost", "tier1", 1, 0.25, 60, "generator", "MK2", [], [], [], [], [], [], "tokenCells"],
  [8, "Mods", "Mod Points Boost", "tier1", 10, 2, 200, "ship", "Zagreus", [], [1.01], [], [], [], [], "weighted"],
  [9, "MK1", "MK1 Gen Boost", "tier1", 1, 0.1, 5000, "generator", "MK1", [1.01], [], [], [], [], [], "weighted"],
  [10, "MK2", "MK2 Gen Boost", "tier1", 2, 0.12, 5000, "generator", "MK2", [1.01], [], [], [], [], [], "weighted"],
  [11, "MK3", "MK3 Gen Boost", "tier1", 3, 0.13, 5000, "generator", "MK3", [1.01], [], [], [], [], [], "weighted"],
  [12, "MK4", "MK4 Gen Boost", "tier1", 4, 0.14, 5000, "generator", "MK4", [1.01], [], [], [], [], [], "weighted"],
  [13, "MK5", "MK5 Gen Boost", "tier1", 15, 0.15, 5000, "generator", "MK5", [1.01], [], [], [], [], [], "weighted"],
  [14, "MK6", "MK6 Gen Boost", "tier1", 26, 0.16, 5000, "generator", "MK6", [1.01], [], [], [], [], [], "weighted"],
  [15, "MK7", "MK7 Gen Boost", "tier1", 37, 0.2, 5000, "generator", "MK7", [1.01], [], [], [], [], [], "weighted"],
  [16, "MK8", "MK8 Gen Boost", "tier1", 48, 0.3, 5000, "generator", "MK8", [1.01], [], [], [], [], [], "weighted"],
  [19, "Token2", "Tokens Boost", "tier2", 1000, 500, 10, "tier", 2, [2, 2, 2, 2, 2, 2, 2, 2], [2], [2], [2], [2], [], "constant9999"],
  [20, "Daily", "Daily Tokens", "tier2", 1000, 800, 10, "tier", 2, [2, 2, 2, 2, 2, 2, 2, 2], [2], [2], [2], [2], [], "constant1"],
  [21, "MPSH", "Mod Points + Shards", "tier2", 1275, 25, 500, "tier", 2, [], [1.02], [1.02], [], [], [], "weighted"],
  [22, "MK1MK2", "MK1 + MK2", "tier2", 75, 2, 2500, "tier", 2, [1.02, 1.02], [], [], [], [], [], "weighted"],
  [23, "MK3MK4", "MK3 + MK4", "tier2", 100, 3, 2500, "tier", 2, [1.02, 1.02], [], [], [], [], [], "weighted"],
  [24, "MK5MK6", "MK5 + MK6", "tier2", 125, 4, 2500, "tier", 2, [1.02, 1.02], [], [], [], [], [], "weighted"],
  [25, "MK7MK8", "MK7 + MK8", "tier2", 150, 5, 2500, "tier", 2, [1.02, 1.02], [], [], [], [], [], "weighted"],
  [28, "Token3", "Tokens Boost", "tier3", 2500, 750, 25, "tier", 3, [2, 2, 2, 2, 2, 2, 2, 2], [2], [2], [2], [2], [], "constant9999"],
  [29, "Daily2", "Daily Tokens", "tier3", 3000, 900, 50, "tier", 3, [2, 2, 2, 2, 2, 2, 2, 2], [2], [2], [2], [2], [], "constant1"],
  [30, "GMPRP", "All Gens + MP + RP Boost", "tier3", 7000, 100, 2000, "tier", 3, [1.03, 1.03, 1.03, 1.03, 1.03, 1.03, 1.03, 1.03], [1.03], [], [1.03], [], [], "weighted"],
  [31, "GSHAP", "All Gens + Shards + AP Boost", "tier3", 8000, 200, 2000, "tier", 3, [1.03, 1.03, 1.03, 1.03, 1.03, 1.03, 1.03, 1.03], [], [1.03], [], [1.03], [], "weighted"],
];

function makeUnlock(kind: RawUnlockKind, target: RawRule[8]): UnlockRule {
  if (kind === "generator") return { kind, id: target as GeneratorId };
  if (kind === "ship") return { kind, id: target as ShipId };
  if (kind === "tier") return { kind, tier: target as 2 | 3 };
  return { kind: "large" };
}

function makePowerRule(mode: RawPowerMode = "weighted"): PowerRule {
  if (mode === "tokenCells") return { kind: "tokenCells" };
  if (mode === "constant1") return { kind: "constant", value: 1 };
  if (mode === "constant999") return { kind: "constant", value: 999 };
  if (mode === "constant9999") return { kind: "constant", value: 9999 };
  return { kind: "weighted" };
}

function makeEffects(raw: RawRule): UpgradeEffects {
  return Object.freeze({
    cells: Object.freeze([...raw[9]]), modPoints: Object.freeze([...raw[10]]),
    shards: Object.freeze([...raw[11]]), research: Object.freeze([...raw[12]]),
    academyPoints: Object.freeze([...raw[13]]), materials: Object.freeze([...raw[14]]),
  });
}

function makeChestReward(raw: RawRule): ChestReward | undefined {
  const reward = raw[16];
  return reward ? Object.freeze({ currency: reward[0], chest: reward[1], amountPerLevel: reward[2] }) : undefined;
}

function makeRules(currency: Currency, rawRules: readonly RawRule[]): readonly UpgradeRule[] {
  return Object.freeze(rawRules.map((raw, order) => Object.freeze({
    currency, sourceRow: raw[0], id: raw[1], name: raw[2], category: raw[3],
    baseCost: raw[4], costScaling: raw[5], maxLevel: raw[6],
    unlock: makeUnlock(raw[7], raw[8]), effects: makeEffects(raw), chestReward: makeChestReward(raw),
    powerRule: makePowerRule(raw[15]), order,
  })));
}

export const DIAMOND_UPGRADES = makeRules("diamond", DIAMOND_RAW);
export const TOKEN_UPGRADES = makeRules("token", TOKEN_RAW);
export const UPGRADE_RULESETS: Readonly<Record<Currency, readonly UpgradeRule[]>> = Object.freeze({
  diamond: DIAMOND_UPGRADES,
  token: TOKEN_UPGRADES,
});
