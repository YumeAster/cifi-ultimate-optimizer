import { compareCifiDecimals, decimalToNumber, parseCifiDecimal } from "../../lib/cifi/upgrades/decimal.ts";

export type FieldKind = "positive" | "integer" | "short" | "decimal" | "bar";
export type ValidationIssue = "invalidShort" | "invalidNumber" | "nonNegative" | "positiveWeight" | "integer" | "barRange";
export type WeightPreset = { id: string; name: string; values: Record<string, string>; updatedAt: string };

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** The form and calculator share one decimal grammar; Number() accepts hex and rounds large integers. */
export function validateInput(kind: FieldKind, rawValue: string): ValidationIssue | undefined {
  if (!rawValue.trim()) return;
  try {
    const value = parseCifiDecimal(rawValue);
    if (value.coefficient < BigInt(0)) return "nonNegative";
    if (kind === "positive") {
      if (decimalToNumber(value) <= 0) return "positiveWeight";
    }
    if ((kind === "integer" || kind === "bar") && value.exponent < 0) return "integer";
    if (kind === "bar" && compareCifiDecimals(value, parseCifiDecimal(10)) > 0) return "barRange";
  } catch {
    return kind === "short" ? "invalidShort" : "invalidNumber";
  }
}

export function researchCountExceedsTotal(completed: string, total: string): boolean {
  if (!completed.trim() || !total.trim()) return false;
  try {
    return compareCifiDecimals(parseCifiDecimal(completed), parseCifiDecimal(total)) > 0;
  } catch { return false; }
}

export function restoreWeightPresets(value: unknown, weightKeys: readonly string[]): WeightPreset[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  return value.flatMap((item): WeightPreset[] => {
    if (!isRecord(item) || typeof item.id !== "string" || !item.id || item.id === "__recommended__" || ids.has(item.id)
      || typeof item.name !== "string" || !item.name.trim() || !isRecord(item.values)) return [];
    const values: Record<string, string> = {};
    for (const key of weightKeys) {
      const fieldValue = item.values[key];
      if (fieldValue === undefined) continue; // Older presets can use defaults for new fields.
      // Blank legacy weights follow the same default-value policy as the form.
      if (typeof fieldValue !== "string" || validateInput("positive", fieldValue)) return [];
      values[key] = fieldValue;
    }
    if (!Object.keys(values).length) return [];
    ids.add(item.id);
    const updatedAt = typeof item.updatedAt === "string" && Number.isFinite(Date.parse(item.updatedAt)) ? item.updatedAt : "";
    return [{ id: item.id, name: item.name.trim(), values, updatedAt }];
  });
}
