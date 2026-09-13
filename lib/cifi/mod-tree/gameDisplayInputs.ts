import definitions from "./game-display-inputs.json" with { type: "json" };
import { addCifiDecimals, compareCifiDecimals, decimalToString, parseCifiDecimal, subtractCifiDecimals } from "../upgrades/decimal.ts";
import type { PlayerProfile } from "./recommendations.ts";

// The native catalogue keeps its audited dependency names. The form and score
// model keep their original keys; both consume the same saved game values.
export const GAME_DISPLAY_INPUT_ALIASES: Readonly<Record<string, string>> = {
  currentLoopsDone: "loopsFilled",
  finalLoopResetsThisConstruction: "loopResets",
  operationsThisRun: "operationsDone",
  studiesThisLoop: "studiesDone",
  currentTotalResearchLevels: "totalResearchLevels",
  fullyCompletedResearches: "completedResearches",
  ...Object.fromEntries(["Cradle", "Auxesia", "Zagreus", "Hephaestus", "Demeter", "Koios", "Zeus"].flatMap(ship =>
    ["Rank", "Crew"].map(kind => [`game${ship}${kind}`, `${ship.toLowerCase()}${kind}`]))),
};
export const SOFTWARE_BASE_KEYS = Array.from({ length: 8 }, (_, i) => `softwareTechMk${i + 1}`);
export const SOFTWARE_EXTRA_KEY = "softwareTechMk9To12";
const SOFTWARE_TOTAL_KEY = "totalSoftwareLevelsMK1To12";
const MIGRATION_KEY = "__gameDisplayInputsVersion";

export const GAME_DISPLAY_EXTRA_INPUTS = [
  ...definitions.filter(input => ["extraJerrehLevels", "extraModLevels"].includes(input.key)),
  {
    key: SOFTWARE_EXTRA_KEY,
    label: "Software Tech subtotal (MK9–12)",
    koLabel: "Software Tech 합계 (MK9–12)",
    helpKo: "MK9~MK12의 현재 Software Tech 레벨만 합산하세요. 해당 단계가 없다면 0. MK1~MK8은 기존 입력에서 자동 합산합니다.",
    helpEn: "Sum only current MK9–12 Software Tech levels. Enter 0 if none. MK1–8 are added automatically from the existing inputs.",
  },
];

export function gameDisplayInputKey(profile: PlayerProfile, key: string): string {
  const shared = GAME_DISPLAY_INPUT_ALIASES[key];
  // An explicitly cleared shared field must not resurrect an old hidden value.
  return shared && Object.hasOwn(profile, shared) ? shared : key;
}

function readValue(profile: PlayerProfile, key: string): string {
  const raw = profile[key];
  if (typeof raw !== "string" || !raw.trim()) throw new Error(`Missing profile input: ${key}`);
  if (parseCifiDecimal(raw).coefficient < 0n) throw new Error(`Invalid profile input: ${key}`);
  return raw;
}

export function readGameDisplayInput(profile: PlayerProfile, key: string): string {
  if (key !== SOFTWARE_TOTAL_KEY) return readValue(profile, gameDisplayInputKey(profile, key));
  // Keep direct native fixtures / legacy-only callers compatible. In the app,
  // the eight existing Software fields and the extra subtotal are authoritative.
  if (![...SOFTWARE_BASE_KEYS, SOFTWARE_EXTRA_KEY].some(field => Object.hasOwn(profile, field))) return readValue(profile, key);
  return decimalToString([...SOFTWARE_BASE_KEYS, SOFTWARE_EXTRA_KEY].reduce(
    (sum, field) => addCifiDecimals(sum, parseCifiDecimal(readValue(profile, field))), parseCifiDecimal("0"),
  ));
}

export function gameDisplayValuesEqual(a: string, b: string): boolean {
  try { return compareCifiDecimals(parseCifiDecimal(a), parseCifiDecimal(b)) === 0; }
  catch { return a === b; }
}

/** One-time, non-destructive restoration of the short-lived duplicate form.
 * Original shared values win conflicts. Legacy keys remain saved for recovery,
 * but are never read in preference to an existing shared field (even blank).
 */
export function migrateGameDisplayInputs(values: Readonly<Record<string, unknown>>) {
  const retained: Record<string, string> = { [MIGRATION_KEY]: "2" };
  const conflicts: string[] = [];
  const firstMigration = values[MIGRATION_KEY] !== "2";
  for (const key of [...Object.keys(GAME_DISPLAY_INPUT_ALIASES), SOFTWARE_TOTAL_KEY]) {
    if (typeof values[key] === "string") retained[key] = values[key];
  }
  for (const [legacy, shared] of Object.entries(GAME_DISPLAY_INPUT_ALIASES)) {
    const previous = values[legacy], current = values[shared];
    if (!firstMigration || typeof previous !== "string" || !previous.trim()) continue;
    if (typeof current !== "string" || !current.trim()) retained[shared] = previous;
    else if (!gameDisplayValuesEqual(current, previous)) conflicts.push(shared);
  }
  let softwareNeedsReview = false;
  const oldTotal = values[SOFTWARE_TOTAL_KEY];
  if (firstMigration && typeof oldTotal === "string" && oldTotal.trim() && !(typeof values[SOFTWARE_EXTRA_KEY] === "string" && values[SOFTWARE_EXTRA_KEY].trim())) {
    try {
      const base = SOFTWARE_BASE_KEYS.reduce((sum, key) => {
        const value = values[key];
        if (typeof value !== "string" || !value.trim()) throw new Error("Missing Software input");
        const parsed = parseCifiDecimal(value);
        if (parsed.coefficient < 0n) throw new Error("Invalid Software input");
        return addCifiDecimals(sum, parsed);
      }, parseCifiDecimal("0"));
      const remainder = subtractCifiDecimals(parseCifiDecimal(oldTotal), base);
      if (remainder.coefficient < 0n) throw new Error("Conflicting Software total");
      retained[SOFTWARE_EXTRA_KEY] = decimalToString(remainder);
    } catch { softwareNeedsReview = true; }
  }
  return { values: retained, conflicts, softwareNeedsReview };
}
