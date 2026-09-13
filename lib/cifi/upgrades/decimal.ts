/** Exact decimal arithmetic for CIFI currency values.
 *
 * Costs and budgets are represented as an integer coefficient with a decimal
 * exponent. This keeps values such as 3.3 - 1 - 1.1 - 1.2 exactly at zero,
 * instead of persisting a binary floating-point residue.
 */
export type CifiDecimal = Readonly<{
  coefficient: bigint;
  exponent: number;
}>;

const SUFFIX_EXPONENTS = Object.freeze({
  k: 3,
  m: 6,
  b: 9,
  t: 12,
  qa: 15,
  qu: 18,
  sx: 21,
  sp: 24,
  o: 27,
  n: 30,
  d: 33,
});
const MAX_DECIMAL_EXPONENT = 10_000;
const TEN = 10n;

function normalize(coefficient: bigint, exponent: number): CifiDecimal {
  if (!Number.isInteger(exponent) || Math.abs(exponent) > MAX_DECIMAL_EXPONENT) {
    throw new RangeError("CIFI decimal exponent is outside the supported range.");
  }
  if (coefficient === 0n) return Object.freeze({ coefficient: 0n, exponent: 0 });

  let normalizedCoefficient = coefficient;
  let normalizedExponent = exponent;
  while (normalizedCoefficient % TEN === 0n) {
    normalizedCoefficient /= TEN;
    normalizedExponent += 1;
  }
  if (Math.abs(normalizedExponent) > MAX_DECIMAL_EXPONENT) {
    throw new RangeError("CIFI decimal exponent is outside the supported range.");
  }
  return Object.freeze({ coefficient: normalizedCoefficient, exponent: normalizedExponent });
}

function powerOfTen(exponent: number): bigint {
  if (!Number.isInteger(exponent) || exponent < 0 || exponent > MAX_DECIMAL_EXPONENT) {
    throw new RangeError("CIFI decimal alignment is outside the supported range.");
  }
  return TEN ** BigInt(exponent);
}

function decimalParts(input: string): { coefficient: bigint; exponent: number } {
  const normalized = input.trim().replaceAll(",", "").toLowerCase();
  if (!normalized) throw new TypeError("CIFI number cannot be empty.");

  const match = normalized.match(/^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:e([+-]?\d+))?(qa|qu|sx|sp|k|m|b|t|o|n|d)?$/);
  if (!match) throw new RangeError(`Invalid CIFI number: ${input}`);

  const [, sign, whole = "", decimalFromWhole = "", decimalOnly = "", scientificExponent = "0", suffix = ""] = match;
  const decimal = decimalFromWhole || decimalOnly;
  const digits = `${whole || "0"}${decimal}`.replace(/^0+(?=\d)/, "");
  const coefficient = BigInt(`${sign === "-" ? "-" : ""}${digits || "0"}`);
  const exponent = Number(scientificExponent) - decimal.length + (suffix ? SUFFIX_EXPONENTS[suffix as keyof typeof SUFFIX_EXPONENTS] : 0);
  return { coefficient, exponent };
}

export function parseCifiDecimal(input: number | string): CifiDecimal {
  if (typeof input === "number") {
    if (!Number.isFinite(input)) throw new RangeError("CIFI number must be finite.");
    const { coefficient, exponent } = decimalParts(input.toString());
    return normalize(coefficient, exponent);
  }
  const { coefficient, exponent } = decimalParts(input);
  return normalize(coefficient, exponent);
}

export function decimalFromNumber(input: number): CifiDecimal {
  return parseCifiDecimal(input);
}

export function decimalToString(value: CifiDecimal): string {
  if (value.coefficient === 0n) return "0";

  const negative = value.coefficient < 0n;
  const digits = (negative ? -value.coefficient : value.coefficient).toString();
  const scientificExponent = value.exponent + digits.length - 1;
  const sign = negative ? "-" : "";

  if (scientificExponent >= 12 || scientificExponent <= -6) {
    const mantissa = digits.length === 1 ? digits : `${digits.slice(0, 1)}.${digits.slice(1)}`;
    return `${sign}${mantissa}e${scientificExponent >= 0 ? "+" : ""}${scientificExponent}`;
  }
  if (value.exponent >= 0) return `${sign}${digits}${"0".repeat(value.exponent)}`;

  const decimalIndex = digits.length + value.exponent;
  if (decimalIndex > 0) return `${sign}${digits.slice(0, decimalIndex)}.${digits.slice(decimalIndex)}`;
  return `${sign}0.${"0".repeat(-decimalIndex)}${digits}`;
}

export function decimalToNumber(value: CifiDecimal): number {
  const numeric = Number(decimalToString(value));
  if (!Number.isFinite(numeric)) throw new RangeError("CIFI number is outside the supported range.");
  return numeric;
}

export function compareCifiDecimals(left: CifiDecimal, right: CifiDecimal): number {
  if (left.coefficient === right.coefficient && left.exponent === right.exponent) return 0;
  if (left.coefficient < 0n && right.coefficient >= 0n) return -1;
  if (left.coefficient >= 0n && right.coefficient < 0n) return 1;

  const exponent = Math.min(left.exponent, right.exponent);
  const leftCoefficient = left.coefficient * powerOfTen(left.exponent - exponent);
  const rightCoefficient = right.coefficient * powerOfTen(right.exponent - exponent);
  return leftCoefficient < rightCoefficient ? -1 : leftCoefficient > rightCoefficient ? 1 : 0;
}

export function addCifiDecimals(left: CifiDecimal, right: CifiDecimal): CifiDecimal {
  const exponent = Math.min(left.exponent, right.exponent);
  return normalize(
    left.coefficient * powerOfTen(left.exponent - exponent) + right.coefficient * powerOfTen(right.exponent - exponent),
    exponent,
  );
}

export function subtractCifiDecimals(left: CifiDecimal, right: CifiDecimal): CifiDecimal {
  return addCifiDecimals(left, Object.freeze({ coefficient: -right.coefficient, exponent: right.exponent }));
}

export function multiplyCifiDecimalByInteger(value: CifiDecimal, multiplier: number): CifiDecimal {
  if (!Number.isSafeInteger(multiplier)) throw new RangeError("CIFI decimal multiplier must be a safe integer.");
  return normalize(value.coefficient * BigInt(multiplier), value.exponent);
}
