import { describe, it, expect, vi, afterEach } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import handler, { extractEndpoints } from "./hltb";

// A slice of HLTB's minified search context (2026-09 bundle): the init fetch
// with its cache-busting timestamp, and the POST with the x-auth-token header.
const BUNDLE =
  'er=async()=>{try{let e=await fetch(`/api/search/site/init?t=${Date.now()}`);if(e.ok){let t=await e.json();' +
  'return ee({token:t.token,hpKey:t.hpKey,hpVal:t.hpVal}),t}}catch(e){console.error("Search security init failed",e)}return null};' +
  'let n=await fetch("/api/search/site",{method:"POST",headers:{"Content-Type":"application/json","x-auth-token":t,"x-hp-key":a,"x-hp-val":r},body:JSON.stringify(s)});';

describe("extractEndpoints (HLTB endpoint discovery)", () => {
  it("pulls the init + search pair out of the page bundle", () => {
    expect(extractEndpoints(BUNDLE)).toEqual({
      init: "/api/search/site/init",
      search: "/api/search/site",
    });
  });

  it("follows a renamed pair as long as the handshake shape holds", () => {
    const moved = BUNDLE.replaceAll("/api/search/site", "/api/seek/v2");
    expect(extractEndpoints(moved)).toEqual({ init: "/api/seek/v2/init", search: "/api/seek/v2" });
  });

  it("returns null when either half is missing", () => {
    expect(extractEndpoints("")).toBeNull();
    expect(extractEndpoints('fetch(`/api/search/site/init?t=${Date.now()}`)')).toBeNull();
    expect(
      extractEndpoints(
        'fetch("/api/search/site",{method:"POST",headers:{"Content-Type":"application/json","x-auth-token":t}',
      ),
    ).toBeNull();
  });
});

/** Runs the proxy for a title against a stubbed HLTB whose init returns
 *  `initBody`; resolves with the JSON sent back and the search request. */
async function lookup(initBody: Record<string, string>) {
  const fetchMock = vi.fn(async (url: string) =>
    url.includes("/init?t=")
      ? new Response(JSON.stringify(initBody))
      : new Response(JSON.stringify({ data: [{ game_name: "Hades", comp_main: 84937, comp_plus: 174921, comp_100: 343080 }] })),
  );
  vi.stubGlobal("fetch", fetchMock);
  let sent: unknown;
  const res = { setHeader: () => res, status: () => res, json: (b: unknown) => (sent = b) };
  await handler({ query: { title: "Hades" } } as unknown as VercelRequest, res as unknown as VercelResponse);
  const [, search] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
  return { sent, headers: search.headers as Record<string, string>, body: JSON.parse(search.body as string) };
}

describe("hltb proxy handshake", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("searches with the token alone when init no longer hands out a honeypot pair", async () => {
    const { sent, headers } = await lookup({ token: "tok" });
    expect(sent).toEqual({ main: 24, mainExtra: 49, completionist: 95 });
    expect(headers["x-auth-token"]).toBe("tok");
    expect(headers).not.toHaveProperty("x-hp-key");
  });

  it("still echoes the honeypot pair back when init provides one", async () => {
    const { sent, headers, body } = await lookup({ token: "tok", hpKey: "k1", hpVal: "v1" });
    expect(sent).toEqual({ main: 24, mainExtra: 49, completionist: 95 });
    expect(headers).toMatchObject({ "x-auth-token": "tok", "x-hp-key": "k1", "x-hp-val": "v1" });
    expect(body.k1).toBe("v1");
  });
});
