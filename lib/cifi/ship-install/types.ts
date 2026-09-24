import type { ShipId } from "../upgrades/types.ts";

export type { ShipId } from "../upgrades/types.ts";
export type InstallLevels = Readonly<Record<number, number>>;
export type RecommendationMode = "mp" | "shards-research" | "shards" | "research" | "weights";
export type InstallResource = "cells" | "modPoints" | "shards" | "research" | "academyPoints" | "materials"
  | "mk1" | "mk2" | "mk3" | "mk4" | "mk5" | "mk6" | "mk7" | "mk8" | "mk9"
  | "allGenerators" | "hardware" | "software" | "operations";
export type InstallDependency = "G" | "G2" | "G3" | "T" | "TH" | "TS" | "LM" | "LF" | "LR"
  | "A" | "ticks" | "O" | "S" | "RC" | "RL" | "M" | "S+O";
export type InstallEffectRule = Readonly<{
  resource: InstallResource;
  coefficientPercent: number;
  dependency?: InstallDependency;
  kind?: "multiplier" | "additive";
  /** Only set after a source has established its exact zero-input handling. */
  dependencyZeroPolicy?: "as-entered" | "at-least-one" | "one-plus";
}>;
export type InstallDefinition = Readonly<{
  id: string;
  ship: ShipId;
  position: number;
  name: string;
  maxLevel: number;
  unlockAt: number;
  icon: string;
  effects: readonly InstallEffectRule[];
  verification?: string;
  notes?: readonly string[];
  provenance?: unknown;
}>;
export type ShipInstallContext = Readonly<{
  ship: ShipId;
  levels: InstallLevels;
  /** Total usable Install points, including points already allocated. Never Ship Rank. */
  totalPoints: number;
  profile: Readonly<Record<string, string>>;
  mode: RecommendationMode;
  excluded?: readonly number[];
  /** FA1 first-level flag; this is a single x5 branch, not 5^researchLevel. */
  capExpanded?: boolean;
  modLevelsTotal?: string;
  activeGenerators?: readonly number[];
  /** Explicit combined modifiers; unknown gear/badge branches are not inferred. */
  modifiers?: Readonly<{ multiplier?: string; operationsMultiplier?: string; byPosition?: Readonly<Record<number, string>> }>;
}>;
export type InstallEffectValue = Readonly<{
  resource: InstallResource;
  label: string;
  kind: "multiplier" | "additive";
  current: string | null;
  next: string | null;
  currentDisplay: string;
  nextDisplay: string;
  missing: readonly string[];
  warnings: readonly string[];
  /** Natural log marginal benefit. Scoring never replaces the direct displayed effect. */
  logGain: number | null;
}>;
export type InstallEvaluation = Readonly<{
  node: InstallDefinition;
  position: number;
  level: number;
  maxLevel: number;
  allocated: number;
  remaining: number;
  unlocked: boolean;
  affordable: boolean;
  maxed: boolean;
  excluded: boolean;
  permitted: boolean;
  reason: "target" | "auxiliary" | "weighted" | "forbidden";
  effects: readonly InstallEffectValue[];
  missing: readonly string[];
  warnings: readonly string[];
  score: number | null;
  error: string | null;
}>;
export type InstallSequenceStep = Readonly<{
  index: number;
  position: number;
  from: number;
  to: number;
  reason: "target" | "auxiliary" | "prerequisite" | "weighted";
  score: number;
}>;
export type InstallSequence = Readonly<{
  steps: readonly InstallSequenceStep[];
  baselineLevels: InstallLevels;
  targetLevels: InstallLevels;
  spent: number;
  remaining: number;
  stopped: "budget" | "limit" | "no-candidate" | "no-target" | "invalid-input";
  warnings: readonly string[];
  errors: readonly string[];
  strategy: "marginal-greedy-with-unlock-lookahead";
}>;
