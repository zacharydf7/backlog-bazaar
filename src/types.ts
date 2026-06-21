export type GameStatus = "backlog" | "playing" | "finished" | "wishlist";

/** Core fields fetched from RAWG (or entered manually). */
export interface GameMeta {
  rawgId?: number;
  title: string;
  released?: string; // ISO date, e.g. "2017-03-03"
  hours?: number; // estimated length in hours (RAWG "playtime")
  rating?: number; // 0–5
  metacritic?: number | null;
  genres: string[];
  image?: string;
  platforms?: string[];
  developers?: string[];
  esrb?: string; // e.g. "Mature", "Everyone 10+"
}

export interface Game extends GameMeta {
  id: string;
  status: GameStatus;
  addedAt: number;
  startedAt?: number;
  finishedAt?: number;
  reward?: number; // coins earned at finish (snapshot)
  pricePaid?: number; // coins spent at purchase (snapshot)
}

export interface Transaction {
  id: string;
  type: "earn" | "spend";
  amount: number;
  label: string;
  at: number;
}

export type FeatureStatus = "submitted" | "planned" | "in_progress" | "done" | "declined";

/** A per-user alert. Named AppNotification to avoid clashing with the DOM type. */
export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: number | null;
  createdAt: number;
}

/** A feature-board request with its vote tally and the caller's vote state. */
export interface FeatureRequest {
  id: string;
  title: string;
  description: string | null;
  status: FeatureStatus;
  userId: string;
  requesterName: string | null;
  isAdminItem: boolean;
  createdAt: number;
  voteCount: number;
  votedByMe: boolean;
}
