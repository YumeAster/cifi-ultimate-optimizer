/** Display-model arithmetic only; never enters the sheet recommendation engine.
 * Decimal polynomials/integer powers are exact. Native noninteger powers and
 * divisions have an explicit finite-precision path, like the game's BigDouble. */
export type GameEffectDecimal = Readonly<{ coefficient: bigint; exponent: number }>;
const MAX_DIGITS = 20_000;
const MAX_EXPONENT = 1_000_000;
const absolute = (n: bigint) => n < 0n ? -n : n;
function normalize(coefficient: bigint, exponent: number): GameEffectDecimal {
  if (coefficient === 0n) return { coefficient: 0n, exponent: 0 };
  while (coefficient % 10n === 0n) { coefficient /= 10n; exponent++; }
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > MAX_EXPONENT || absolute(coefficient).toString().length > MAX_DIGITS) throw new RangeError("Effect precision limit");
  return { coefficient, exponent };
}
export function parseGameEffectDecimal(value: string): GameEffectDecimal {
  const match = value.trim().match(/^([+-]?)(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i);
  if (!match || value.length > MAX_DIGITS + 32) throw new Error("Invalid exact effect number");
  return normalize(BigInt(`${match[1]}${match[2]}${match[3] ?? ""}`), Number(match[4] ?? 0) - (match[3]?.length ?? 0));
}
export function gameEffectExact(value: GameEffectDecimal): string {
  const sign = value.coefficient < 0n ? "-" : "", digits = absolute(value.coefficient).toString();
  const exponent = value.exponent + digits.length - 1;
  if (value.coefficient === 0n) return "0";
  if (exponent >= 12 || exponent <= -6) return `${sign}${digits[0]}${digits.length > 1 ? `.${digits.slice(1)}` : ""}e${exponent}`;
  const point = digits.length + value.exponent;
  return sign + (point <= 0 ? `0.${"0".repeat(-point)}${digits}` : point >= digits.length ? digits + "0".repeat(point - digits.length) : `${digits.slice(0, point)}.${digits.slice(point)}`);
}
export function addGameEffectDecimals(a: GameEffectDecimal, b: GameEffectDecimal): GameEffectDecimal {
  if (!a.coefficient) return b;
  if (!b.coefficient) return a;
  const exponent = Math.min(a.exponent, b.exponent);
  if (Math.max(a.exponent - exponent, b.exponent - exponent) > MAX_DIGITS) throw new RangeError("Effect precision limit");
  return normalize(a.coefficient * 10n ** BigInt(a.exponent - exponent) + b.coefficient * 10n ** BigInt(b.exponent - exponent), exponent);
}
export function multiplyGameEffectDecimals(a: GameEffectDecimal, b: GameEffectDecimal): GameEffectDecimal {
  if (absolute(a.coefficient).toString().length + absolute(b.coefficient).toString().length > MAX_DIGITS + 1) throw new RangeError("Effect precision limit");
  return normalize(a.coefficient * b.coefficient, a.exponent + b.exponent);
}
export function powerGameEffectDecimal(base: GameEffectDecimal, power: number): GameEffectDecimal {
  if (!Number.isSafeInteger(power) || power < 0 || power > 99_999) throw new RangeError("Unverified effect exponent");
  let result = parseGameEffectDecimal("1"), factor = base;
  for (let left = power; left > 0; left = Math.floor(left / 2)) {
    if (left % 2) result = multiplyGameEffectDecimals(result, factor);
    if (left > 1) factor = multiplyGameEffectDecimals(factor, factor);
  }
  return result;
}

export function compareGameEffectDecimals(a: GameEffectDecimal, b: GameEffectDecimal): number {
  const signA = a.coefficient < 0n ? -1 : a.coefficient > 0n ? 1 : 0;
  const signB = b.coefficient < 0n ? -1 : b.coefficient > 0n ? 1 : 0;
  if (signA !== signB) return signA < signB ? -1 : 1;
  if (!signA) return 0;
  const left = absolute(a.coefficient).toString(), right = absolute(b.coefficient).toString();
  const magnitudeA = left.length + a.exponent, magnitudeB = right.length + b.exponent;
  if (magnitudeA !== magnitudeB) return (magnitudeA < magnitudeB ? -1 : 1) * signA;
  const width = Math.max(left.length, right.length), paddedA = left.padEnd(width, "0"), paddedB = right.padEnd(width, "0");
  return (paddedA < paddedB ? -1 : paddedA > paddedB ? 1 : 0) * signA;
}

/** 18 significant decimal places for a nonterminating quotient. */
export function divideGameEffectDecimals(a: GameEffectDecimal, b: GameEffectDecimal): GameEffectDecimal {
  if (!b.coefficient) throw new RangeError("Division by zero in game effect");
  const shift = Math.max(0, 18 + absolute(b.coefficient).toString().length - absolute(a.coefficient).toString().length);
  return normalize(a.coefficient * 10n ** BigInt(shift) / b.coefficient, a.exponent - b.exponent - shift);
}

export function roundGameEffectDecimal(value: GameEffectDecimal, mode: "floor" | "truncate"): GameEffectDecimal {
  if (value.exponent >= 0) return value;
  const divisor = 10n ** BigInt(-value.exponent);
  const integer = value.coefficient / divisor;
  return normalize(integer - (mode === "floor" && value.coefficient < 0n && value.coefficient % divisor !== 0n ? 1n : 0n), 0);
}

/** Native BigDouble-style power for real or very large exponents. This is a
 * reviewed numerical operation, not a substitute for a missing effect rule. */
export function realPowerGameEffectDecimal(base: GameEffectDecimal, power: GameEffectDecimal): GameEffectDecimal {
  const exponent = Number(gameEffectExact(power));
  if (!Number.isFinite(exponent)) throw new RangeError("Effect exponent outside supported range");
  if (!base.coefficient) {
    if (exponent < 0) throw new RangeError("Invalid zero-base power");
    return parseGameEffectDecimal(exponent === 0 ? "1" : "0");
  }
  if (base.coefficient < 0n) throw new RangeError("Invalid real power base");
  const digits = base.coefficient.toString();
  const mantissa = Number(`${digits[0]}.${digits.slice(1, 17)}`);
  const magnitudeBase = base.exponent + digits.length - 1;
  const logarithm = (magnitudeBase + Math.log1p(mantissa - 1) / Math.LN10) * exponent;
  if (!Number.isFinite(logarithm) || Math.abs(logarithm) > MAX_EXPONENT) throw new RangeError("Effect magnitude outside supported range");
  const magnitude = Math.floor(logarithm);
  return parseGameEffectDecimal(`${(10 ** (logarithm - magnitude)).toPrecision(15)}e${magnitude}`);
}

/** Two decimals, rounded half away from zero. Scientific notation is a web
 * convention; the game's complete suffix table has not been verified. */
export function formatGameEffectDecimal(value: GameEffectDecimal): string {
  if (!value.coefficient) return "0.00";
  const sign = value.coefficient < 0n ? "−" : "";
  const digits = absolute(value.coefficient).toString();
  let magnitude = value.exponent + digits.length - 1;
  const scientific = magnitude >= 6 || magnitude <= -3;
  const roundingExponent = (scientific ? magnitude : 0) - 2;
  const removed = roundingExponent - value.exponent;
  let rounded = absolute(value.coefficient);
  if (removed > 0) {
    const divisor = 10n ** BigInt(removed);
    rounded = (rounded + divisor / 2n) / divisor;
  } else rounded *= 10n ** BigInt(-removed);
  if (scientific && rounded >= 1000n) { rounded /= 10n; magnitude++; }
  const formatted = rounded.toString().padStart(3, "0");
  return `${sign}${formatted.slice(0, -2)}.${formatted.slice(-2)}${scientific ? `e${magnitude}` : ""}`;
}
