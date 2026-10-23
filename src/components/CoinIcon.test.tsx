import { beforeEach, describe, expect, it } from "vitest";
import { act, render } from "@testing-library/react";
import { CoinIcon } from "./CoinIcon";
import { useStore } from "../store";
import { ViewingProvider } from "../lib/viewContext";

/** The face a rendered coin wears, from its /coins/<face>.svg source. */
function face(ui: React.ReactElement): string | undefined {
  const { container } = render(ui);
  return container.querySelector("img")?.getAttribute("src")?.match(/\/coins\/(.+)\.svg$/)?.[1];
}

beforeEach(() => {
  // You wear Witchglass; the app default is the Treasure Chest.
  act(() => useStore.setState({ coinSkin: "witchglass", defaultCoin: "chest" }));
});

describe("CoinIcon: whose coin it is", () => {
  it("wears your skin on your own coins", () => {
    expect(face(<CoinIcon />)).toBe("witchglass");
  });

  it("wears another player's skin, or the app default when they wear none, never yours", () => {
    expect(face(<CoinIcon ownerCoin="opal" />)).toBe("opal");
    expect(face(<CoinIcon ownerCoin={null} />)).toBe("chest");
  });

  it("wears a visited library's skin on its coins", () => {
    const visited = (coin: string | null) => (
      <ViewingProvider value={{ readOnly: true, hideSpend: false, ownerCoin: coin }}>
        <CoinIcon />
      </ViewingProvider>
    );
    expect(face(visited("opal"))).toBe("opal");
    expect(face(visited(null))).toBe("chest");
  });

  it("keeps your own coins yours inside a visited library", () => {
    expect(
      face(
        <ViewingProvider value={{ readOnly: true, hideSpend: false, ownerCoin: "opal" }}>
          <CoinIcon mine />
        </ViewingProvider>,
      ),
    ).toBe("witchglass");
  });

  it("lets an explicit face win, as in shop previews", () => {
    expect(face(<CoinIcon variant="stall" ownerCoin="opal" />)).toBe("stall");
  });
});
