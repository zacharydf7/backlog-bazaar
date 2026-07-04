import { describe, it, expect } from "vitest";
import {
  buildLibraryExport,
  serializeExport,
  exportFilename,
  EXPORT_SCHEMA_VERSION,
  type LibraryExportInput,
} from "./dataExport";
import type { Game, Compilation } from "../types";

function input(over: Partial<LibraryExportInput> = {}): LibraryExportInput {
  return {
    displayName: "You",
    email: "you@example.com",
    coins: 120,
    vouchers: 2,
    platforms: ["PC", "Nintendo Switch"],
    games: [],
    compilations: [],
    now: new Date("2026-07-04T09:30:00.000Z"),
    ...over,
  };
}

describe("buildLibraryExport", () => {
  it("captures profile, economy, and stamps app + schema version + timestamp", () => {
    const out = buildLibraryExport(input());
    expect(out.app).toBe("Backlog Bazaar");
    expect(out.schemaVersion).toBe(EXPORT_SCHEMA_VERSION);
    expect(out.exportedAt).toBe("2026-07-04T09:30:00.000Z");
    expect(out.profile).toEqual({
      displayName: "You",
      email: "you@example.com",
      platforms: ["PC", "Nintendo Switch"],
    });
    expect(out.economy).toEqual({ coins: 120, vouchers: 2 });
  });

  it("passes the full games and compilations through untouched", () => {
    const games = [{ id: "g1", title: "Hollow Knight", status: "backlog" }] as unknown as Game[];
    const compilations = [{ id: "c1", title: "Trilogy" }] as unknown as Compilation[];
    const out = buildLibraryExport(input({ games, compilations }));
    expect(out.games).toBe(games);
    expect(out.compilations).toBe(compilations);
  });

  it("preserves a null display name / email (guest export)", () => {
    const out = buildLibraryExport(input({ displayName: null, email: null }));
    expect(out.profile.displayName).toBeNull();
    expect(out.profile.email).toBeNull();
  });
});

describe("serializeExport", () => {
  it("produces valid, pretty JSON that round-trips", () => {
    const out = buildLibraryExport(input());
    const json = serializeExport(out);
    expect(json).toContain("\n  "); // pretty-printed (2-space indent)
    expect(JSON.parse(json)).toEqual(out);
  });
});

describe("exportFilename", () => {
  it("is date-stamped and .json", () => {
    expect(exportFilename(new Date("2026-07-04T23:59:00.000Z"))).toBe(
      "backlog-bazaar-export-2026-07-04.json",
    );
  });
});
