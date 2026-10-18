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

describe("apply_purchase pricing", () => {
  it("charges the server's own price, never the client's, before any coins move", () => {
    const priced = body.indexOf("v_full_price := public.game_start_price(v_row);");
    const refused = body.indexOf("if coalesce(p_price, 0) > 0 and v_full_price > p_price then");
    const charged = body.indexOf("p_price := v_full_price;");
    expect(priced).toBeGreaterThan(-1);
    expect(priced).toBeLessThan(refused);
    expect(refused).toBeLessThan(charged);
    expect(charged).toBeLessThan(body.indexOf("set coins = coins - p_price"));
    expect(body).toMatch(/status = 'backlog'\s+for update;/);
    expect(body).toContain("case when v_family_discount then 'family_discount_purchase' else 'purchase' end");
  });
});

describe("apply_finish payout", () => {
  const finishStart = schema.indexOf("create or replace function public.apply_finish(");
  const finish = schema.slice(finishStart, schema.indexOf("\n$$;", finishStart));

  it("pays the server's own bounty and bonus shares, never the client's amounts", () => {
    expect(finish).toContain("select public.game_bounty(g) into v_full");
    expect(finish).not.toMatch(/coalesce\(p_(full|replay|completion)_reward/);
  });

  it("doesn't count a retired edition as the family's clear", () => {
    expect(finish).toContain("g.status = 'finished' and coalesce(g.finish_tag, '') <> 'retired'");
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
