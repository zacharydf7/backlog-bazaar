import { describe, it, expect, beforeEach, vi } from "vitest";

// A bundled game's own screenshots (issue 86fc0b4b) are cloud-only: the store
// uploads into the covers bucket and writes the URL list to the game row. We
// mock the Supabase boundary (and the canvas-based downscale jsdom can't run)
// and keep every other real export.
const { update, upload, remove, from, storage } = vi.hoisted(() => {
  const update = vi.fn();
  const upload = vi.fn();
  const remove = vi.fn();
  return {
    update,
    upload,
    remove,
    from: vi.fn(() => ({ update: (patch: unknown) => ({ eq: () => update(patch) }) })),
    storage: {
      from: () => ({
        upload,
        remove,
        getPublicUrl: (path: string) => ({
          data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/covers/${path}` },
        }),
      }),
    },
  };
});

vi.mock("./lib/supabase", async (importActual) => {
  const actual = await importActual<typeof import("./lib/supabase")>();
  return { ...actual, supabase: { from, storage } };
});
vi.mock("./lib/image", async (importActual) => ({
  ...(await importActual<typeof import("./lib/image")>()),
  downscaleImage: vi.fn(async () => new Blob(["x"])),
}));

import { useStore } from "./store";
import type { Game } from "./types";

const store = () => useStore.getState();

function game(over: Partial<Game> = {}): Game {
  return { id: "g1", title: "Toy Story 3", status: "backlog", genres: [], addedAt: 1, compilationId: "C", ...over } as Game;
}

beforeEach(() => {
  update.mockReset().mockResolvedValue({ error: null });
  upload.mockReset().mockResolvedValue({ error: null });
  remove.mockReset().mockResolvedValue({ error: null });
  useStore.setState({ cloud: true, userId: "u1", games: [game({ personalScreenshots: ["old.jpg"] })], error: null });
});

describe("personal screenshots (86fc0b4b)", () => {
  it("uploads into the player's covers folder and appends the URL to the game", async () => {
    await store().addPersonalScreenshot("g1", new File(["x"], "shot.png", { type: "image/png" }));
    expect(upload.mock.calls[0][0]).toMatch(/^u1\/g1-shot-\d+\.jpg$/);
    const list = store().games[0].personalScreenshots!;
    expect(list).toHaveLength(2);
    expect(list[0]).toBe("old.jpg");
    expect(list[1]).toMatch(/\/covers\/u1\/g1-shot-\d+\.jpg$/);
    expect(update).toHaveBeenCalledWith({ personal_screenshots: list });
  });

  it("refuses past the limit without uploading", async () => {
    useStore.setState({ games: [game({ personalScreenshots: Array.from({ length: 12 }, (_, i) => `${i}.jpg`) })] });
    await store().addPersonalScreenshot("g1", new File(["x"], "shot.png"));
    expect(upload).not.toHaveBeenCalled();
    expect(store().games[0].personalScreenshots).toHaveLength(12);
  });

  it("removes a screenshot from the game and deletes its file", async () => {
    const url = "https://x.supabase.co/storage/v1/object/public/covers/u1/g1-shot-5.jpg";
    useStore.setState({ games: [game({ personalScreenshots: ["keep.jpg", url] })] });
    await store().removePersonalScreenshot("g1", url);
    expect(store().games[0].personalScreenshots).toEqual(["keep.jpg"]);
    expect(update).toHaveBeenCalledWith({ personal_screenshots: ["keep.jpg"] });
    expect(remove).toHaveBeenCalledWith(["u1/g1-shot-5.jpg"]);
  });

  it("keeps the list and deletes the uploaded file when the database write fails", async () => {
    update.mockResolvedValue({ error: { message: "nope" } });
    await store().addPersonalScreenshot("g1", new File(["x"], "shot.png"));
    expect(store().games[0].personalScreenshots).toEqual(["old.jpg"]);
    expect(store().error).toBe("Couldn't add that screenshot.");
    expect(remove).toHaveBeenCalledWith([upload.mock.calls[0][0]]);
  });
});
