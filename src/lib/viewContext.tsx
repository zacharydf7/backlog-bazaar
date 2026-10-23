import { createContext, useContext } from "react";
import type { ViewProfile } from "../types";

/** Whether the board/cards are being shown read-only (you're visiting another
 *  user's Bazaar) and whether that user has hidden their real-world spend.
 *  Cards, the family detail modal, and the read-only footer read this instead of
 *  prop-drilling through every level. Default = your own, fully-interactive view. */
export interface ViewingValue {
  readOnly: boolean;
  hideSpend: boolean;
  /** The coin skin worn by the player whose library this is, for CoinIcon:
   *  undefined = your own library, null = theirs wears none. */
  ownerCoin?: string | null;
}

const ViewingContext = createContext<ViewingValue>({ readOnly: false, hideSpend: false });

export const ViewingProvider = ViewingContext.Provider;

/** The value for a library that's yours (`viewing` null) or a visited player's. */
export function viewingValue(viewing: ViewProfile | null): ViewingValue {
  return {
    readOnly: viewing != null,
    hideSpend: viewing?.hideSpend ?? false,
    ownerCoin: viewing ? viewing.cosmetics.coin : undefined,
  };
}

export function useViewing(): ViewingValue {
  return useContext(ViewingContext);
}
