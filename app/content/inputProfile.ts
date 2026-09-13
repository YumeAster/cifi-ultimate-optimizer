import { isRecord, researchCountExceedsTotal, validateInput, type FieldKind } from "./profileValidation.ts";
import { normalizeWeightValues } from "./weightPresets.ts";

type Values = Readonly<Record<string, string>>;
type Field = { key: string; kind: FieldKind };

/** Raw edits are durable, but incomplete/invalid numbers never enter scoring. */
export function calculationProfile(values: Values, previous: Values, fields: readonly Field[], weightDefaults: Values): Record<string, string> {
  const next = { ...previous };
  for (const field of fields) {
    const value = values[field.key] ?? "";
    if (!validateInput(field.kind, value)) next[field.key] = value;
  }
  if (researchCountExceedsTotal(next.completedResearches ?? "", next.totalResearchLevels ?? "")) {
    next.completedResearches = previous.completedResearches ?? "";
    next.totalResearchLevels = previous.totalResearchLevels ?? "";
  }
  return { ...next, ...normalizeWeightValues(next, weightDefaults) };
}

export function restoreCalculationProfile(raw: Values, stored: unknown, defaults: Values, fields: readonly Field[], weightDefaults: Values) {
  const previous = { ...defaults };
  if (isRecord(stored)) {
    for (const field of fields) {
      const value = stored[field.key];
      if (typeof value === "string") previous[field.key] = value;
    }
  }
  const safePrevious = calculationProfile(previous, defaults, fields, weightDefaults);
  return calculationProfile(raw, safePrevious, fields, weightDefaults);
}

export function commitInputEdit(draft: Values, saved: Values, key: string, value: string, fields: readonly Field[], weightDefaults: Values, presetId: string | null, persist: (payload: InputProfileSave) => void) {
  const nextDraft = { ...draft, [key]: value };
  const nextSaved = calculationProfile(nextDraft, saved, fields, weightDefaults);
  persist(inputProfileSave(nextDraft, nextSaved, presetId));
  return { draft: nextDraft, saved: nextSaved };
}

export type InputProfileSave = { version: 1; values: Record<string, string>; calculationValues: Record<string, string>; weightPresetId: string | null };
export function inputProfileSave(draft: Values, saved: Values, presetId: string | null): InputProfileSave {
  return { version: 1, values: { ...draft }, calculationValues: { ...saved }, weightPresetId: presetId };
}
