import { addCifiDecimals, decimalToString, parseCifiDecimal } from "../upgrades/decimal.ts";
import type { ModState, PlayerProfile } from "./recommendations.ts";
import { gameDisplayInputKey, gameDisplayValuesEqual, readGameDisplayInput } from "./gameDisplayInputs.ts";

// Display-only anchors. Neither the score profile nor the recommendation state
// is changed when a simulated purchase grants free progress.
export const GAME_DISPLAY_ANCHORS_KEY = "cifi-mod-game-display-anchors-v1";
export const GAME_DISPLAY_DEPENDENCIES: Record<string, { code: string; amount: number }> = {
  currentLoopsDone: { code: "DU1", amount: 1 },
  gameCradleRank: { code: "EU1", amount: 8 },
  ...Object.fromEntries(["Cradle", "Auxesia", "Zagreus", "Hephaestus", "Demeter", "Koios", "Zeus"].map(ship => [`game${ship}Crew`, { code: "EU2", amount: 1 }])),
};
export type GameDisplayAnchors = Record<string, { raw: string; level: number }>;
export function restoreGameDisplayAnchors(value: unknown): GameDisplayAnchors {
  const result: GameDisplayAnchors = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return result;
  for (const [key, item] of Object.entries(value)) {
    if (Object.hasOwn(GAME_DISPLAY_DEPENDENCIES, key) && item && typeof item.raw === "string" && item.raw.length <= 128 && Number.isSafeInteger(item.level) && item.level >= 0 && item.level <= 99_999) result[key] = { raw: item.raw, level: item.level };
  }
  return result;
}
export function reconcileGameDisplayAnchors(anchors: GameDisplayAnchors, profile: PlayerProfile, state: ModState): GameDisplayAnchors {
  const result: GameDisplayAnchors = {};
  for (const [key, dependency] of Object.entries(GAME_DISPLAY_DEPENDENCIES)) {
    let raw: string;
    try { raw = readGameDisplayInput(profile, key); } catch { continue; }
    result[key] = { raw, level: anchors[key] && gameDisplayValuesEqual(anchors[key].raw, raw) ? anchors[key].level : state.levels[dependency.code] ?? 0 };
  }
  return result;
}
export function deriveGameDisplayProfile(profile: PlayerProfile, state: ModState, anchors: GameDisplayAnchors): PlayerProfile {
  const result = { ...profile };
  for (const [key, dependency] of Object.entries(GAME_DISPLAY_DEPENDENCIES)) {
    const anchor = anchors[key];
    if (!anchor) continue;
    try {
      if (!gameDisplayValuesEqual(anchor.raw, readGameDisplayInput(profile, key))) continue;
      const delta = ((state.levels[dependency.code] ?? 0) - anchor.level) * dependency.amount;
      result[gameDisplayInputKey(profile, key)] = decimalToString(addCifiDecimals(parseCifiDecimal(anchor.raw), parseCifiDecimal(delta)));
    } catch { /* Preserve invalid input so the evaluator reports it explicitly. */ }
  }
  return result;
}
