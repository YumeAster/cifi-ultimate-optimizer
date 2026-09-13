import { compareCifiDecimals, parseCifiDecimal } from "../../lib/cifi/upgrades/decimal.ts";
import { validateInput, type WeightPreset } from "./profileValidation.ts";

export const DEFAULT_WEIGHT_PRESET_ID = "__recommended__";
export const DEFAULT_WEIGHT_VALUES = { cells: "1", modPoints: "12", shards: "10", research: "8", academyPoints: "24", materials: "72", costReduction: "6", rankPoints: "1" } as const;
type Values = Readonly<Record<string, string>>;

/** Match the calculators: missing/blank weights use the existing defaults. */
export function normalizeWeightValues(values: Values, defaults: Values): Record<string, string> {
  return Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => {
    const raw = values[key];
    if (raw !== undefined && typeof raw !== "string") throw new Error(`Invalid weight: ${key}`);
    const value = raw?.trim() || fallback;
    if (!value.trim() || validateInput("positive", value)) throw new Error(`Invalid weight: ${key}`);
    return [key, value];
  }));
}

export function sameWeightValues(a: Values, b: Values, defaults: Values): boolean {
  try {
    const left = normalizeWeightValues(a, defaults), right = normalizeWeightValues(b, defaults);
    return Object.keys(defaults).every(key => compareCifiDecimals(parseCifiDecimal(left[key]), parseCifiDecimal(right[key])) === 0);
  } catch { return false; }
}

/** Prefer the last applied identity when several presets have equal values.
 * Otherwise use the default, then stable library order. Selection alone does
 * not change the applied identity. Old saves without an ID match by values.
 */
export function matchingWeightPreset(values: Values, presets: readonly WeightPreset[], defaults: Values, preferredId: string | null = null): string | null {
  const candidates = [{ id: DEFAULT_WEIGHT_PRESET_ID, values: defaults }, ...presets];
  const preferred = candidates.find(preset => preset.id === preferredId);
  if (preferred && sameWeightValues(values, preferred.values, defaults)) return preferred.id;
  return candidates.find(preset => sameWeightValues(values, preset.values, defaults))?.id ?? null;
}

export type WeightProfileSave = { version: 1; values: Record<string, string>; calculationValues: Record<string, string>; weightPresetId: string };

/** Switch only weights. Raw progress edits and last valid calculation values
 * remain separate; this never writes to the weight-preset library.
 */
export function commitWeightPreset(draft: Values, saved: Values, presetValues: Values, defaults: Values, presetId: string, persist: (payload: WeightProfileSave) => void) {
  const weights = normalizeWeightValues(presetValues, defaults);
  const nextSaved = { ...saved, ...weights };
  const nextDraft = { ...draft, ...weights };
  persist({ version: 1, values: nextDraft, calculationValues: nextSaved, weightPresetId: presetId });
  return { saved: nextSaved, draft: nextDraft };
}

/** Create or replace a library entry from exactly the eight weight fields. */
export function storeWeightPreset(presets: readonly WeightPreset[], id: string, name: string, draft: Values, defaults: Values, updatedAt: string, persist: (presets: WeightPreset[]) => void) {
  if (!id || id === DEFAULT_WEIGHT_PRESET_ID || !name.trim()) throw new Error("Invalid preset identity");
  if (presets.some(preset => preset.id !== id && preset.name === name.trim())) throw new Error("Duplicate preset name");
  const preset = { id, name: name.trim(), values: normalizeWeightValues(draft, defaults), updatedAt };
  const next = presets.some(row => row.id === id) ? presets.map(row => row.id === id ? preset : row) : [...presets, preset];
  persist(next);
  return next;
}
