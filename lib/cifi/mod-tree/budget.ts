import { decimalToString, parseCifiDecimal, type CifiDecimal } from "../upgrades/decimal.ts";

export function parseModBudget(value: string): CifiDecimal {
  if (value.length > 10_050) throw new RangeError("MP input is too long");
  const result = parseCifiDecimal(value);
  const digits = result.coefficient.toString().length;
  if (result.coefficient < 0n || digits + result.exponent > 10_000 || result.exponent < -100) throw new RangeError("MP must be non-negative and below 1e10000");
  return result;
}

/** Decimal half-up rounding, without a Number/logarithm round trip.
 * User input, restored saves and EVERY post-purchase balance use this rule.
 * There is deliberately no hidden higher-precision MP balance. */
export function formatModBudget(value: string): string {
  const exact = parseModBudget(value);
  if (exact.coefficient === 0n) return "0";
  const order = exact.coefficient.toString().length - 1 + exact.exponent;
  const scientific = /e/i.test(value) || order >= 6 || order < -2;
  const targetExponent = scientific ? order - 2 : -2;
  const shift = targetExponent - exact.exponent;
  const divisor = shift > 0 ? 10n ** BigInt(shift) : 1n;
  const coefficient = shift > 0
    ? (exact.coefficient + divisor / 2n) / divisor
    : exact.coefficient * 10n ** BigInt(-shift);
  const rounded = parseCifiDecimal(`${coefficient}e${targetExponent}`);
  if (!scientific) return decimalToString(rounded);
  const digits = rounded.coefficient.toString();
  const exponent = rounded.exponent + digits.length - 1;
  return `${digits[0]}.${digits.slice(1).padEnd(2, "0")}e${exponent}`;
}

export function normalizeModBudgetInput(value: string): string {
  const rounded = formatModBudget(value); // Validates before rounding, too.
  parseModBudget(rounded); // A carry into 1e10000 is not a valid new budget.
  return rounded;
}
