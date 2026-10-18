// @vitest-environment node
//
// apply_purchase's lane routing (issue d06bb5fd). A card bound to a live Co-op
// Pact must start into the uncapped Co-op lane even when Focus is full — the
// server derives that from co_op_pacts itself rather than trusting a client
// flag, and only falls through to the Focus slot picker when it isn't co-op.
// The function needs auth + the full schema, so this pins the contract in the
// schema text (the real call was exercised against the DB in a rolled-back
// dry run when this shipped).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync(new URL("../../supabase/schema.sql", import.meta.url), "utf8");
const start = schema.indexOf("create or replace function public.apply_purchase(");
const body = schema.slice(start, schema.indexOf("\n$$;", start));

describe("apply_purchase price guard", () => {
  it("rejects a negative or missing client price before any coins move", () => {
    const guard = body.search(/if p_price is null or p_price < 0 then\s+raise exception 'Invalid price';/);
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(body.indexOf("set coins = coins - p_price"));
  });
});

describe("apply_purchase lane routing", () => {
  it("derives co-op from a live pact bound to the card, letting Completionist win", () => {
    expect(start).toBeGreaterThan(-1);
    expect(body).toContain("v_coop := coalesce(p_coop, false)");
    expect(body).toContain("not coalesce(p_completionist, false) and exists (");
    expect(body).toContain("cp.status in ('pending', 'active')");
    expect(body).toContain("p_game in (cp.inviter_game, cp.invitee_game)");
  });

  it("only reaches the Focus slot picker when the buy is neither co-op nor Completionist", () => {
    const coop = body.indexOf("if v_coop then");
    const completionist = body.indexOf("elsif coalesce(p_completionist, false) then");
    const picker = body.indexOf("public.pick_start_slot(");
    expect(coop).toBeGreaterThan(-1);
    expect(coop).toBeLessThan(completionist);
    expect(completionist).toBeLessThan(picker);
    expect(body).toContain("co_op = v_coop");
  });
});
