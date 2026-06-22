import { createContext, useContext } from "react";

/** Whether the board/cards are being shown read-only (you're visiting another
 *  user's Bazaar) and whether that user has hidden their real-world spend.
 *  Cards, the family detail modal, and the read-only footer read this instead of
 *  prop-drilling through every level. Default = your own, fully-interactive view. */
export interface ViewingValue {
  readOnly: boolean;
  hideSpend: boolean;
}

const ViewingContext = createContext<ViewingValue>({ readOnly: false, hideSpend: false });

export const ViewingProvider = ViewingContext.Provider;

export function useViewing(): ViewingValue {
  return useContext(ViewingContext);
}
