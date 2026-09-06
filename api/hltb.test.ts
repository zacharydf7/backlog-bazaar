import { describe, it, expect } from "vitest";
import { extractEndpoints } from "./hltb";

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
