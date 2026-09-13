/** A small, closed spreadsheet expression interpreter. No eval/Function or I/O.
 * Normal arithmetic keeps Number precision; overflowing products/powers remain
 * signed log10 values, so a large power ratio never becomes Infinity/Infinity.
 */
export type Wide = number | { sign: 1 | -1; log: number };
export type FormulaAst = { kind: "literal"; value: number | string } | { kind: "name"; name: string } | { kind: "call"; name: string; args: FormulaAst[] };
type Ast = FormulaAst;
type Value = Wide | string | Value[];
export type FormulaContext = { scalar: (name: string) => number; level: (code: string) => number };
const cache = new Map<string, Ast>();
const operators: Record<string, number> = { "=": 1, "<>": 1, "<": 1, ">": 1, "<=": 1, ">=": 1, "+": 2, "-": 2, "*": 3, "/": 3, "^": 4 };

export function finite(value: number): number {
  if (!Number.isFinite(value)) throw new RangeError("Non-finite calculation");
  return value;
}
function parts(value: Wide): { sign: number; log: number } {
  return typeof value === "number" ? { sign: Math.sign(value), log: Math.log10(Math.abs(value)) } : value;
}
export function wideLog(value: Wide): number {
  const p = parts(value);
  if (p.sign <= 0) throw new RangeError("Logarithm requires a positive value");
  return finite(p.log);
}
export function wideNumber(value: Wide): number {
  return finite(typeof value === "number" ? value : value.sign * 10 ** value.log);
}
function fromLog(sign: number, log: number): Wide {
  if (!sign || log === -Infinity) return 0;
  finite(log);
  if (log > 300 || log < -300) return { sign: sign < 0 ? -1 : 1, log };
  return sign * 10 ** log;
}
function negate(value: Wide): Wide { return typeof value === "number" ? -value : { sign: value.sign === 1 ? -1 : 1, log: value.log }; }
export function wideCompare(a: Wide, b: Wide): number {
  if (typeof a === "number" && typeof b === "number") return Math.sign(a - b);
  const x = parts(a), y = parts(b);
  return x.sign !== y.sign ? Math.sign(x.sign - y.sign) : x.sign * Math.sign(x.log - y.log);
}
function add(a: Wide, b: Wide): Wide {
  if (typeof a === "number" && typeof b === "number" && Number.isFinite(a + b)) return a + b;
  const x = parts(a), y = parts(b);
  if (!x.sign) return b;
  if (!y.sign) return a;
  const high = x.log >= y.log ? x : y, low = x.log >= y.log ? y : x;
  const delta = (low.log - high.log) * Math.LN10;
  if (x.sign === y.sign) return fromLog(high.sign, high.log + Math.log1p(Math.exp(delta)) / Math.LN10);
  if (delta === 0) return 0;
  return fromLog(high.sign, high.log + Math.log(-Math.expm1(delta)) / Math.LN10);
}
function multiply(a: Wide, b: Wide): Wide {
  if (typeof a === "number" && typeof b === "number" && Number.isFinite(a * b) && (a * b !== 0 || a === 0 || b === 0)) return a * b;
  const x = parts(a), y = parts(b);
  return x.sign && y.sign ? fromLog(x.sign * y.sign, x.log + y.log) : 0;
}
function divide(a: Wide, b: Wide): Wide {
  if (wideCompare(b, 0) === 0) throw new RangeError("Division by zero");
  if (typeof a === "number" && typeof b === "number" && Number.isFinite(a / b) && (a / b !== 0 || a === 0)) return a / b;
  const x = parts(a), y = parts(b);
  return x.sign ? fromLog(x.sign * y.sign, x.log - y.log) : 0;
}
function pow(a: Wide, b: Wide): Wide {
  const exponent = wideNumber(b);
  if (typeof a === "number") {
    const direct = a ** exponent;
    if (Number.isFinite(direct) && (direct !== 0 || a === 0)) return direct;
  }
  const x = parts(a);
  if (!x.sign) { if (exponent < 0) throw new RangeError("Negative zero power"); return exponent === 0 ? 1 : 0; }
  if (x.sign < 0 && !Number.isInteger(exponent)) throw new RangeError("Fractional negative power");
  return fromLog(x.sign < 0 && exponent % 2 !== 0 ? -1 : 1, finite(x.log * exponent));
}

function parse(source: string): Ast {
  const saved = cache.get(source);
  if (saved) return saved;
  let offset = source.startsWith("=") ? 1 : 0;
  const tokens: string[] = [];
  while (offset < source.length) {
    const match = source.slice(offset).match(/^\s*("(?:[^"]|"")*"|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[A-Za-z_][A-Za-z_0-9.]*|<>|<=|>=|[+\-*/^=<>(),{};])/);
    if (!match) { if (source.slice(offset).trim() === "") break; throw new Error(`Unsupported formula token at ${offset}`); }
    tokens.push(match[1]); offset += match[0].length;
  }
  let index = 0;
  const take = (expected: string) => { if (tokens[index++] !== expected) throw new Error(`Expected ${expected}`); };
  const expression = (priority = 0): Ast => {
    let left = atom();
    while ((operators[tokens[index]] ?? 0) > priority) {
      const op = tokens[index++];
      left = { kind: "call", name: op, args: [left, expression(operators[op] - (op === "^" ? 1 : 0))] };
    }
    return left;
  };
  const atom = (): Ast => {
    const token = tokens[index++];
    if (!token) throw new Error("Incomplete formula");
    if (token === "+" || token === "-") return { kind: "call", name: token === "-" ? "NEG" : "VALUE", args: [atom()] };
    if (token === "(") { const result = expression(); take(")"); return result; }
    if (token === "{") {
      const args: Ast[] = [];
      do { args.push(expression()); } while ([",", ";"].includes(tokens[index]) && ++index);
      take("}"); return { kind: "call", name: "ARRAY", args };
    }
    if (token.startsWith('"')) return { kind: "literal", value: token.slice(1, -1).replaceAll('""', '"') };
    if (/^[\d.]/.test(token)) return { kind: "literal", value: finite(Number(token)) };
    if (tokens[index] !== "(") return { kind: "name", name: token };
    index++;
    const args: Ast[] = [];
    if (tokens[index] !== ")") { do { args.push(expression()); } while (tokens[index] === "," && ++index); }
    take(")"); return { kind: "call", name: token, args };
  };
  const result = expression();
  if (index !== tokens.length) throw new Error("Unexpected formula tail");
  cache.set(source, result); return result;
}

export { parse as parseFormula, pow as widePower, multiply as wideMultiply, divide as wideDivide, add as wideAdd };

export function evaluateFormula(source: string | number | FormulaAst, context: FormulaContext): Wide {
  if (typeof source === "number") return finite(source);
  const numeric = (value: Value): Wide => {
    if (typeof value === "string" || Array.isArray(value)) throw new Error("Expected numeric formula value");
    return value;
  };
  const evaluate = (ast: Ast, locals: Record<string, Value> = {}): Value => {
    if (ast.kind === "literal") return ast.value;
    if (ast.kind === "name") return ast.name === "TRUE" ? 1 : ast.name === "FALSE" ? 0 : Object.hasOwn(locals, ast.name) ? locals[ast.name] : finite(context.scalar(ast.name));
    const name = ast.name, args = ast.args;
    const val = (i: number) => evaluate(args[i], locals);
    const num = (i: number) => numeric(val(i));
    const real = (i: number) => wideNumber(num(i));
    if (name === "IF") return wideCompare(num(0), 0) !== 0 ? val(1) : val(2);
    if (name === "IFS") {
      for (let i = 0; i < args.length; i += 2) if (wideCompare(num(i), 0) !== 0) return val(i + 1);
      throw new Error("No matching cost rule");
    }
    if (name === "IFERROR") { try { return val(0); } catch { return val(1); } }
    if (name === "ARRAY") return args.map(a => evaluate(a, locals));
    if (name === "MAP") {
      const list = val(0), lambda = args[1];
      if (!Array.isArray(list) || lambda.kind !== "call" || lambda.name !== "LAMBDA" || lambda.args[0].kind !== "name") throw new Error("Unsupported MAP");
      const key = lambda.args[0].name;
      return list.map(v => evaluate(lambda.args[1], { ...locals, [key]: v }));
    }
    if (name === "MOD_CODE_TO_LEVEL_NF") {
      const code = val(0);
      if (typeof code !== "string") throw new Error("Invalid Mod code");
      return context.level(code);
    }
    switch (name) {
      case "+": return add(num(0), num(1));
      case "-": return add(num(0), negate(num(1)));
      case "*": return multiply(num(0), num(1));
      case "/": return divide(num(0), num(1));
      case "NEG": return negate(num(0));
      case "POW": case "^": return pow(num(0), num(1));
      case "SQRT": return pow(num(0), .5);
      case "LOG10": return wideLog(num(0));
      case "VALUE": case "UNFORMAT_NF": return num(0); // Inputs are already validated numeric values.
      case "SUM": {
        const sum = (value: Value): Wide => Array.isArray(value) ? value.reduce<Wide>((total, item) => add(total, sum(item)), 0) : numeric(value);
        return args.reduce<Wide>((total, arg) => add(total, sum(evaluate(arg, locals))), 0);
      }
      case "MAX": case "MIN": return args.map((_, i) => num(i)).reduce((a, b) => wideCompare(a, b) * (name === "MAX" ? 1 : -1) >= 0 ? a : b);
      case "FLOOR": return Math.floor(real(0) / (args.length > 1 ? real(1) : 1)) * (args.length > 1 ? real(1) : 1);
      // SUB_LOG_NF returns log10(abs(10^a - 10^b)), not a division.
      case "SUB_LOG_NF": {
        const a = real(0), b = real(1), delta = -Math.abs(a - b) * Math.LN10;
        return finite(Math.max(a, b) + Math.log(-Math.expm1(delta)) / Math.LN10);
      }
      case "=": return +(wideCompare(num(0), num(1)) === 0);
      case "<>": return +(wideCompare(num(0), num(1)) !== 0);
      case "<": return +(wideCompare(num(0), num(1)) < 0);
      case ">": return +(wideCompare(num(0), num(1)) > 0);
      case "<=": return +(wideCompare(num(0), num(1)) <= 0);
      case ">=": return +(wideCompare(num(0), num(1)) >= 0);
      default: throw new Error(`Unsupported formula function: ${name}`);
    }
  };
  return numeric(evaluate(typeof source === "string" ? parse(source) : source));
}
