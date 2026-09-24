import { parseCifiDecimal } from "../upgrades/decimal.ts";
import { readGameDisplayInput } from "../mod-tree/gameDisplayInputs.ts";
import {
  addGameEffectDecimals, compareGameEffectDecimals, gameEffectExact, parseGameEffectDecimal,
  type GameEffectDecimal,
} from "../mod-tree/gameEffectDecimal.ts";
import type { InstallDependency, ShipId, ShipInstallContext } from "./types.ts";

export const SHIP_INSTALL_EXTRA_FIELDS = [
  { key: "automationsOwned", label: "현재 Automation 수", enLabel: "Current Automations" },
  { key: "ticksThisRun", label: "이번 Run Tick 수", enLabel: "Ticks this Run" },
  { key: "missionsDone", label: "완료한 Mission 수", enLabel: "Completed Missions" },
  { key: "manualMk9", label: "Manual MK9 (미해금이면 0)", enLabel: "Manual MK9 (0 if locked)" },
  { key: "hardwareTechMk9To12", label: "Hardware Tech 합계 (MK9–12)", enLabel: "Hardware Tech subtotal (MK9–12)" },
] as const;
export const shipProfileKey = (ship: ShipId, field: "Crew" | "Rank") => `${ship.toLowerCase()}${field}`;

export class MissingShipInput extends Error {
  readonly keys: readonly string[];
  constructor(keys: readonly string[]) {
    super(`입력 확인: ${keys.join(", ")}`);
    this.keys = keys;
  }
}

/** Use the shared fields, including their short/scientific number syntax. No implicit zero. */
export function readShipNumber(profile: Readonly<Record<string, string>>, key: string): GameEffectDecimal {
  const value = profile[key];
  if (typeof value !== "string" || !value.trim() || value.length > 256) throw new MissingShipInput([key]);
  try {
    const parsed = parseCifiDecimal(value);
    if (parsed.coefficient < 0n) throw new Error("negative");
    return parsed;
  } catch { throw new MissingShipInput([key]); }
}

export function sumShipInputs(profile: Readonly<Record<string, string>>, keys: readonly string[]): GameEffectDecimal {
  const missing: string[] = [];
  const sum = keys.reduce((total, key) => {
    try { return addGameEffectDecimals(total, readShipNumber(profile, key)); }
    catch (error) {
      if (error instanceof MissingShipInput) missing.push(...error.keys);
      else throw error;
      return total;
    }
  }, parseGameEffectDecimal("0"));
  if (missing.length) throw new MissingShipInput(missing);
  return sum;
}

/** Native Loop Mods count includes all mapped variants plus the shared extra
 * subtotal. Do not reuse the sheet score's A13/IU4 exclusions for game display.
 * Undefined means the total is unknown, not zero. The shared field remains the
 * only editable source for extras; callers never save a duplicate subtotal. */
export function combineModLevels(mapLevels: string | undefined, profile: Readonly<Record<string, string>>): string | undefined {
  try {
    const mapped = readShipNumber({ mappedModLevels: mapLevels ?? "" }, "mappedModLevels");
    const extra = readShipNumber(profile, "extraModLevels");
    return gameEffectExact(addGameEffectDecimals(mapped, extra));
  } catch { return undefined; }
}

const keys = (prefix: string) => Array.from({ length: 8 }, (_, index) => `${prefix}${index + 1}`);
export function readInstallDependency(context: ShipInstallContext, dependency?: InstallDependency): GameEffectDecimal {
  if (!dependency) return parseGameEffectDecimal("1");
  const profile = context.profile;
  switch (dependency) {
    case "G": return sumShipInputs(profile, [...keys("manualMk"), "manualMk9"]);
    case "G2": return readShipNumber(profile, "manualMk2");
    case "G3": return readShipNumber(profile, "manualMk3");
    case "TH": return sumShipInputs(profile, [...keys("hardwareTechMk"), "hardwareTechMk9To12"]);
    case "TS": {
      // The existing Mod Tree display input is authoritative for the later MK subtotal.
      // Preflight preserves actionable missing keys instead of flattening its exception.
      sumShipInputs(profile, [...keys("softwareTechMk"), "softwareTechMk9To12"]);
      return parseCifiDecimal(readGameDisplayInput(profile, "totalSoftwareLevelsMK1To12"));
    }
    case "T": return addGameEffectDecimals(readInstallDependency(context, "TH"), readInstallDependency(context, "TS"));
    case "LM": return readShipNumber({ modLevelsTotal: context.modLevelsTotal ?? "" }, "modLevelsTotal");
    case "S+O": return sumShipInputs(profile, ["studiesDone", "operationsDone"]);
    default: return readShipNumber(profile, {
      LF: "loopsFilled", LR: "loopResets", A: "automationsOwned", ticks: "ticksThisRun",
      O: "operationsDone", S: "studiesDone", RC: "completedResearches", RL: "totalResearchLevels", M: "missionsDone",
    }[dependency]);
  }
}

/** An explicit active range wins; otherwise use all nine native manual counts. */
export function activeInstallGenerators(context: ShipInstallContext): number[] {
  if (context.activeGenerators !== undefined) {
    if (context.activeGenerators.some(id => !Number.isSafeInteger(id) || id < 1 || id > 9)) throw new MissingShipInput(["activeGenerators"]);
    return [...new Set(context.activeGenerators)].sort((a, b) => a - b);
  }
  // Read every field so blank and zero are not treated as equivalent.
  const active: number[] = [], missing: string[] = [];
  for (let id = 1; id <= 9; id++) {
    try { if (compareGameEffectDecimals(readShipNumber(context.profile, `manualMk${id}`), parseGameEffectDecimal("0")) > 0) active.push(id); }
    catch (error) { if (error instanceof MissingShipInput) missing.push(...error.keys); else throw error; }
  }
  if (missing.length) throw new MissingShipInput(missing);
  return active;
}

export function readInstallWeight(context: ShipInstallContext, resource: string): number {
  const value = readShipNumber(context.profile, resource);
  const numeric = Number(gameEffectExact(value));
  if (!Number.isFinite(numeric)) throw new MissingShipInput([resource]);
  return numeric;
}
