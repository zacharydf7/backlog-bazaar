// Calculator math in amount fields (issue 111adc13): any field that takes a
// typed number also takes a typed expression — "19.99+7.5%", "(12+8)*2",
// "60/4" — evaluated with proper order of operations (× ÷ before + −,
// parentheses first). The % suffix follows everyday-calculator convention:
//   * relative in + and −:  "19.99 + 7.5%" adds 7.5 percent OF 19.99 → 21.49
//   * a plain fraction in × and ÷ and standalone: "200 * 50%" → 100, "50%" → 0.5
// A plain number is the trivial expression, so callers can route every input
// through here. Invalid input returns null — never NaN — so existing
// "reject/keep previous" fallbacks keep working.

interface Tok {
  kind: "num" | "op";
  value: number; // for num
  op: string; // for op: + - * / ( ) %
}

/** Tokenize, or null on any character we don't understand. Dollar signs and
 *  thousands-commas are cosmetic and stripped ("$1,000" reads as 1000);
 *  whitespace separates tokens (so "1 2" is two numbers — an error — not
 *  twelve); the unicode ×, ÷ and − read as their ASCII operators. */
function tokenize(raw: string): Tok[] | null {
  const s = raw
    .replace(/[$,]/g, "")
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/−/g, "-");
  const toks: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) {
      i += 1;
      continue;
    }
    if ("+-*/()%".includes(c)) {
      toks.push({ kind: "op", value: 0, op: c });
      i += 1;
      continue;
    }
    const m = /^(?:\d+(?:\.\d*)?|\.\d+)/.exec(s.slice(i));
    if (!m) return null;
    toks.push({ kind: "num", value: Number(m[0]), op: "" });
    i += m[0].length;
  }
  return toks.length > 0 ? toks : null;
}

/** A parsed term/factor: its value plus whether it is a bare percentage —
 *  "7.5%" stays flagged so the additive level can apply it RELATIVE to the
 *  running total; any arithmetic on it resolves it to a plain fraction. */
interface Val {
  v: number;
  pct: boolean;
}

const asNumber = (x: Val): number => (x.pct ? x.v / 100 : x.v);

/** Recursive-descent evaluation over the token stream. */
function parseExpr(toks: Tok[], pos: { i: number }): Val | null {
  const first = parseTerm(toks, pos);
  if (!first) return null;
  let total = asNumber(first);
  while (pos.i < toks.length && (toks[pos.i].op === "+" || toks[pos.i].op === "-")) {
    const op = toks[pos.i].op;
    pos.i += 1;
    const t = parseTerm(toks, pos);
    if (!t) return null;
    // The calculator-percent rule: "a + b%" means a ± b percent of a.
    const delta = t.pct ? total * (t.v / 100) : t.v;
    total = op === "+" ? total + delta : total - delta;
  }
  return { v: total, pct: false };
}

function parseTerm(toks: Tok[], pos: { i: number }): Val | null {
  let acc = parseFactor(toks, pos);
  if (!acc) return null;
  while (pos.i < toks.length && (toks[pos.i].op === "*" || toks[pos.i].op === "/")) {
    const op = toks[pos.i].op;
    pos.i += 1;
    const f = parseFactor(toks, pos);
    if (!f) return null;
    const a = asNumber(acc);
    const b = asNumber(f);
    acc = { v: op === "*" ? a * b : a / b, pct: false };
  }
  return acc;
}

function parseFactor(toks: Tok[], pos: { i: number }): Val | null {
  // Unary signs, e.g. "-5" or "10 * -2".
  let sign = 1;
  while (pos.i < toks.length && (toks[pos.i].op === "+" || toks[pos.i].op === "-")) {
    if (toks[pos.i].op === "-") sign = -sign;
    pos.i += 1;
  }
  const t = toks[pos.i];
  if (!t) return null;
  let out: Val;
  if (t.kind === "num") {
    out = { v: t.value, pct: false };
    pos.i += 1;
  } else if (t.op === "(") {
    pos.i += 1;
    const inner = parseExpr(toks, pos);
    if (!inner || toks[pos.i]?.op !== ")") return null;
    pos.i += 1;
    // A parenthesized percent has already resolved to its fraction.
    out = { v: asNumber(inner), pct: false };
  } else {
    return null;
  }
  if (toks[pos.i]?.op === "%") {
    pos.i += 1;
    out = { v: out.v, pct: true };
  }
  return { v: sign * out.v, pct: out.pct };
}

/** Evaluate an expression (or plain number) to a finite number, else null.
 *  Never throws; never returns NaN or ±Infinity (e.g. division by zero). */
export function evaluateMathExpression(raw: string): number | null {
  const toks = tokenize(raw);
  if (!toks) return null;
  const pos = { i: 0 };
  const result = parseExpr(toks, pos);
  if (!result || pos.i !== toks.length) return null;
  const v = asNumber(result);
  return Number.isFinite(v) ? v : null;
}

/** Round half-up at `decimals` places (the "proper rounding" a price field
 *  expects: 21.48925 → 21.49). */
export function roundTo(v: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
}

/** Parse a money-like amount field: a plain number or a math expression,
 *  rounded to cents (or `decimals` places). Null when the input can't be
 *  understood — callers keep their existing invalid-input handling. */
export function parseAmount(raw: string, decimals = 2): number | null {
  if (!raw.trim()) return null;
  const v = evaluateMathExpression(raw);
  return v == null ? null : roundTo(v, decimals);
}
