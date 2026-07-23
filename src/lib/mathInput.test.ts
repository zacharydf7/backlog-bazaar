import { describe, it, expect } from "vitest";
import { evaluateMathExpression, parseAmount, roundTo } from "./mathInput";

describe("evaluateMathExpression", () => {
  it("evaluates plain numbers (the trivial expression)", () => {
    expect(evaluateMathExpression("42")).toBe(42);
    expect(evaluateMathExpression("19.99")).toBe(19.99);
    expect(evaluateMathExpression(".5")).toBe(0.5);
    expect(evaluateMathExpression("  7 ")).toBe(7);
  });

  it("follows the order of operations", () => {
    expect(evaluateMathExpression("2+3*4")).toBe(14);
    expect(evaluateMathExpression("(2+3)*4")).toBe(20);
    expect(evaluateMathExpression("10-4/2")).toBe(8);
    expect(evaluateMathExpression("2*3+4*5")).toBe(26);
    expect(evaluateMathExpression("100/4/5")).toBe(5);
    expect(evaluateMathExpression("10-3-2")).toBe(5);
  });

  it("handles unary minus and nested parens", () => {
    expect(evaluateMathExpression("-5")).toBe(-5);
    expect(evaluateMathExpression("10*-2")).toBe(-20);
    expect(evaluateMathExpression("-(3+2)")).toBe(-5);
    expect(evaluateMathExpression("((1+2)*(3+4))")).toBe(21);
  });

  it("treats % as calculator percent: relative in + and −", () => {
    // The issue's example: 19.99 + 7.5% = 19.99 × 1.075.
    expect(evaluateMathExpression("19.99+7.5%")).toBeCloseTo(21.48925, 10);
    expect(evaluateMathExpression("100-25%")).toBe(75);
    expect(evaluateMathExpression("10+-50%")).toBe(5);
    // Chained: each percent applies to the running total.
    expect(evaluateMathExpression("100+10%+10%")).toBeCloseTo(121, 10);
  });

  it("treats % as a plain fraction in × and ÷ and standalone", () => {
    expect(evaluateMathExpression("200*50%")).toBe(100);
    expect(evaluateMathExpression("50%")).toBe(0.5);
    expect(evaluateMathExpression("10/50%")).toBe(20);
    // Parenthesized percents resolve inside — no longer relative outside.
    expect(evaluateMathExpression("10+(50%)")).toBe(10.5);
  });

  it("strips cosmetic dollar signs, commas and unicode operators", () => {
    expect(evaluateMathExpression("$19.99+$5")).toBeCloseTo(24.99, 10);
    expect(evaluateMathExpression("1,000+500")).toBe(1500);
    expect(evaluateMathExpression("6×7")).toBe(42);
    expect(evaluateMathExpression("84÷2")).toBe(42);
    expect(evaluateMathExpression("10−3")).toBe(7);
  });

  it("returns null for garbage, dangling operators, and unbalanced parens", () => {
    expect(evaluateMathExpression("")).toBeNull();
    expect(evaluateMathExpression("abc")).toBeNull();
    expect(evaluateMathExpression("1+")).toBeNull();
    expect(evaluateMathExpression("*3")).toBeNull();
    expect(evaluateMathExpression("(1+2")).toBeNull();
    expect(evaluateMathExpression("1+2)")).toBeNull();
    expect(evaluateMathExpression("1..2")).toBeNull();
    expect(evaluateMathExpression("1 2")).toBeNull(); // two numbers, no operator
    expect(evaluateMathExpression("1e5")).toBeNull(); // no exponent notation
  });

  it("never returns NaN or Infinity (division by zero is invalid input)", () => {
    expect(evaluateMathExpression("1/0")).toBeNull();
    expect(evaluateMathExpression("0/0")).toBeNull();
  });
});

describe("roundTo", () => {
  it("rounds half up at the requested precision", () => {
    expect(roundTo(21.48925, 2)).toBe(21.49);
    expect(roundTo(2.345, 2)).toBe(2.35);
    expect(roundTo(2.344, 2)).toBe(2.34);
    expect(roundTo(2.5, 0)).toBe(3);
  });
});

describe("parseAmount", () => {
  it("parses plain amounts and expressions, rounded to cents", () => {
    expect(parseAmount("69.99")).toBe(69.99);
    // The issue's example, landing on the money answer.
    expect(parseAmount("19.99+7.5%")).toBe(21.49);
    expect(parseAmount("59.99+8.25%")).toBe(64.94);
    expect(parseAmount("(20+5)/2")).toBe(12.5);
  });

  it("is null for blank or invalid input — callers keep their fallbacks", () => {
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("   ")).toBeNull();
    expect(parseAmount("free")).toBeNull();
    expect(parseAmount("19.99+")).toBeNull();
  });

  it("honors a custom precision", () => {
    expect(parseAmount("100/3", 0)).toBe(33);
    expect(parseAmount("1/8", 3)).toBe(0.125);
  });
});
