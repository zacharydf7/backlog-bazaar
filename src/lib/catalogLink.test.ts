import { describe, expect, it } from "vitest";
import { linkResultMessage, mergeLinkedFields, providerCatalogFields, unlinkResultMessage } from "./catalogLink";
import { emptyCatalogFields, type CatalogFields } from "./submissions";

// The real duplicate from issue 52f98b68: a community entry typed with a tilde,
// and the IGDB game it should have been.
const community: CatalogFields = {
  ...emptyCatalogFields(),
  title: "Kingdom Hearts Collection [I~III]",
  image: "https://x/community.jpg",
  platforms: ["PlayStation 4"],
  hours: 120,
  screenshots: ["https://x/shot.jpg"],
  isLiveService: false,
};
const igdb: CatalogFields = {
  ...emptyCatalogFields(),
  title: "Kingdom Hearts Collection [I-III]",
  image: "https://x/igdb.jpg",
  platforms: ["PlayStation 4", "PC"],
  genres: ["RPG"],
  developers: ["Square Enix"],
  released: "2019-03-29",
};

describe("mergeLinkedFields", () => {
  it("takes the provider's values when it is primary and fills its gaps from the catalog", () => {
    const { fields, sources } = mergeLinkedFields(community, igdb, "provider");
    expect(fields).toMatchObject({
      title: "Kingdom Hearts Collection [I-III]",
      image: "https://x/igdb.jpg",
      platforms: ["PlayStation 4", "PC"],
      genres: ["RPG"],
      developers: ["Square Enix"],
      released: "2019-03-29",
      hours: 120, // IGDB search carries no length
    });
    expect(sources).toEqual({
      title: "provider",
      image: "provider",
      platforms: "provider",
      genres: "provider",
      developers: "provider",
      released: "provider",
      hours: "catalog",
    });
  });

  it("keeps the catalog's values when it is primary and fills its gaps from the provider", () => {
    const { fields, sources } = mergeLinkedFields(community, igdb, "catalog");
    expect(fields).toMatchObject({
      title: "Kingdom Hearts Collection [I~III]",
      image: "https://x/community.jpg",
      platforms: ["PlayStation 4"],
      genres: ["RPG"],
      developers: ["Square Enix"],
      released: "2019-03-29",
      hours: 120,
    });
    expect(sources.title).toBe("catalog");
    expect(sources.genres).toBe("provider");
  });

  it("treats blank strings, null and empty lists as gaps, and never empties the title", () => {
    const blank: CatalogFields = { ...emptyCatalogFields(), title: "  ", image: " " };
    const { fields, sources } = mergeLinkedFields(community, blank, "provider");
    expect(fields.title).toBe("Kingdom Hearts Collection [I~III]");
    expect(fields.image).toBe("https://x/community.jpg");
    expect(sources.genres).toBeNull();
    expect(fields.genres).toEqual([]);
  });

  it("leaves screenshots and the live-service flag as the catalog has them", () => {
    const { fields } = mergeLinkedFields(
      community,
      { ...igdb, screenshots: ["https://x/other.jpg"], isLiveService: true },
      "provider",
    );
    expect(fields.screenshots).toEqual(["https://x/shot.jpg"]);
    expect(fields.isLiveService).toBe(false);
  });
});

describe("providerCatalogFields", () => {
  it("maps provider terms onto the master lists and drops unknown ones", () => {
    const f = providerCatalogFields(
      {
        title: "Kingdom Hearts Collection [I-III]",
        igdbId: 1,
        genres: ["role-playing (RPG)", "rpg"],
        platforms: ["pc", "Sega Pico"],
      },
      ["RPG"],
      ["PC"],
    );
    expect(f.genres).toEqual(["RPG"]);
    expect(f.platforms).toEqual(["PC"]);
    expect(f.image).toBe("");
    expect(f.hours).toBeNull();
  });
});

describe("link toasts", () => {
  it("report the RPC counts", () => {
    expect(linkResultMessage(2, 1)).toBe("Linked. 2 copies adopted, 1 stamped.");
    expect(linkResultMessage(1, 0)).toBe("Linked. 1 copy adopted, 0 stamped.");
    expect(unlinkResultMessage(2, 1)).toBe("Unlinked. 2 copies restored, 1 left as they were (changed since).");
    expect(unlinkResultMessage(1, 0)).toBe("Unlinked. 1 copy restored.");
  });
});
