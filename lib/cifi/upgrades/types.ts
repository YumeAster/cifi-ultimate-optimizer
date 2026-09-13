export type Currency = "diamond" | "token";

export type GeneratorId = "MK1" | "MK2" | "MK3" | "MK4" | "MK5" | "MK6" | "MK7" | "MK8";
export type ShipId = "Cradle" | "Auxesia" | "Zagreus" | "Hephaestus" | "Demeter" | "Koios" | "Zeus";

export type WeightKey = "cells" | "modPoints" | "shards" | "research" | "academyPoints" | "materials";
export type UpgradeWeights = Readonly<Record<WeightKey, number>>;

export type UpgradeCategory =
  | "generator"
  | "special"
  | "oneTimer"
  | "largeOneTimer"
  | "tier1"
  | "tier2"
  | "tier3";

export type UnlockRule =
  | Readonly<{ kind: "generator"; id: GeneratorId }>
  | Readonly<{ kind: "ship"; id: ShipId }>
  | Readonly<{ kind: "tier"; tier: 2 | 3 }>
  | Readonly<{ kind: "large" }>;

/** Multipliers are kept as factors so workbook products are not flattened into rounded constants. */
export type UpgradeEffects = Readonly<Record<WeightKey, readonly number[]>>;

/** A flat reward added to the matching chest each time this upgrade is leveled. */
export type ChestReward = Readonly<{
  readonly currency: Currency;
  readonly chest: "Token Chests" | "Diamond Chests";
  readonly amountPerLevel: number;
}>;

export type PowerRule =
  | Readonly<{ kind: "weighted" }>
  | Readonly<{ kind: "constant"; value: number }>
  | Readonly<{ kind: "tokenCells" }>;

export interface UpgradeRule {
  readonly currency: Currency;
  readonly id: string;
  readonly name: string;
  readonly category: UpgradeCategory;
  /** Original visible worksheet row. It is also the deterministic tie-break order. */
  readonly sourceRow: number;
  readonly order: number;
  readonly baseCost: number;
  readonly costScaling: number;
  readonly maxLevel: number;
  readonly unlock: UnlockRule;
  readonly effects: UpgradeEffects;
  /** Present for chest-reward upgrades, which are additive rather than multiplicative. */
  readonly chestReward?: ChestReward;
  readonly powerRule: PowerRule;
}

export interface GeneratorProgress {
  readonly unlocked: boolean;
  readonly purchased: number;
}

export interface ShipProgress {
  readonly unlocked: boolean;
  readonly crew: number;
}

export type UpgradeLevelMap = Readonly<Record<string, number>>;

export interface OptimizerState {
  readonly levels: Readonly<{
    diamond: UpgradeLevelMap;
    token: UpgradeLevelMap;
  }>;
  readonly generators: Readonly<Partial<Record<GeneratorId, GeneratorProgress>>>;
  readonly ships: Readonly<Partial<Record<ShipId, ShipProgress>>>;
  /** Long-run duration from Settings, in hours. Used only by the Token Cells exception. */
  readonly longRunHours: number;
}

export interface UpgradeEvaluation {
  readonly rule: UpgradeRule;
  readonly currentLevel: number;
  readonly nextCost: number;
  /** Exact decimal representation used for affordability and budget updates. */
  readonly nextCostExact: string;
  /** Compatibility aliases for the first UI integration draft. */
  readonly level: number;
  readonly cost: number;
  readonly costExact: string;
  readonly power: number;
  readonly score: number;
  readonly unlocked: boolean;
  readonly maxed: boolean;
  readonly atMax: boolean;
  readonly eligible: boolean;
}

export interface PurchaseStep {
  readonly step: number;
  readonly id: string;
  readonly name: string;
  readonly levelBefore: number;
  readonly levelAfter: number;
  /** Exact decimal currency cost. */
  readonly cost: string;
  readonly power: number;
  readonly score: number;
  /** Exact remaining currency after this purchase. */
  readonly remainingBudget: string;
}

export interface SimulationOptions {
  readonly maxSteps?: number;
}

export interface SimulationResult {
  readonly compatibility: "corrected";
  readonly currency: Currency;
  readonly initialBudget: string;
  readonly steps: readonly PurchaseStep[];
  readonly purchases: readonly PurchaseStep[];
  readonly summary: Readonly<Record<string, number>>;
  readonly finalState: OptimizerState;
  readonly finalLevels: UpgradeLevelMap;
  readonly spent: string;
  readonly remaining: string;
  readonly remainingBudget: string;
  readonly truncated: boolean;
  readonly stoppedReason: "no-affordable-upgrades" | "max-steps";
}
