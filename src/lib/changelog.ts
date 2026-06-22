// Backlog Bazaar release notes.
//
// HOW TO ADD A RELEASE: when you deploy a meaningful update, prepend a new entry
// to RELEASES (newest first) with a fresh, unique `id` and a few short,
// user-facing bullet points. The `id` doubles as the "seen" marker — a new top
// entry makes the "What's new" dot light up for everyone until they open the
// panel. Keep items benefit-focused; skip pure refactors/infra.

export interface Release {
  /** Stable, unique slug. Also used to track which release a user has seen. */
  id: string;
  /** ISO date the release went out, e.g. "2026-06-21". */
  date: string;
  title: string;
  /** Short, user-facing bullet points describing what changed. */
  items: string[];
}

/** Newest first. RELEASES[0] is the current/latest release. */
export const RELEASES: Release[] = [
  {
    id: "2026-06-22-top-bar-roomier-pages",
    date: "2026-06-22",
    title: "Notifications up top, roomier pages",
    items: [
      "Notifications, the theme picker, and your account now sit in a top-right bar — the spot you'd expect them.",
      "Pages like the Leaderboard, Requests board, and Account now stretch to fill the screen instead of sitting in a narrow strip.",
      "Tap the Backlog Bazaar name to jump back to your Bazaar; on phones, Add is now a floating button so the name isn't cut off.",
    ],
  },
  {
    id: "2026-06-22-pages-not-popups",
    date: "2026-06-22",
    title: "Pages, not pop-ups",
    items: [
      "The Leaderboard, Account, Requests & bugs, What's new, and admin tools now open as full pages instead of pop-up dialogs — they get the whole screen and the active one is highlighted in the menu.",
    ],
  },
  {
    id: "2026-06-21-sidebar-nav",
    date: "2026-06-21",
    title: "A clearer, friendlier layout",
    items: [
      "Navigation moved to a labeled sidebar on desktop — every section now shows its name and count at a glance, no more guessing icons.",
      "On phones, a bottom tab bar makes jumping between sections one-tap easy.",
      "Account, leaderboard, requests, theme, and more are tidied into one clearly labeled menu.",
    ],
  },
  {
    id: "2026-06-21-the-caravan",
    date: "2026-06-21",
    title: "The Market is now The Caravan",
    items: [
      "Renamed the Market to The Caravan — a clearer name, since you don't spend coins there.",
      "Adding a game now just says “Send to Bazaar” instead of showing a coin price.",
      "Games already in your Bazaar or wishlist drop out of The Caravan and are replaced with fresh suggestions.",
    ],
  },
  {
    id: "2026-06-21-coin-icon",
    date: "2026-06-21",
    title: "A coin of our own",
    items: [
      "Coins now use a custom Backlog Bazaar coin throughout the app — in your wallet, on prices, and everywhere else — instead of the stock emoji.",
      "The browser tab icon matches it too.",
    ],
  },
  {
    id: "2026-06-21-game-families",
    date: "2026-06-21",
    title: "Link editions into a Game Family",
    items: [
      "Link different versions of the same game — a remaster, a Switch port, a PC copy — into one “Game Family” from a game's edit screen.",
      "A linked game shows Family Stats: your combined playtime and total real-world spend across every version.",
      "Linked editions share a single Now Playing slot, so playing two versions at once won't eat extra space.",
      "Finishing pays the full bonus only the first time you clear a family — re-clears on other platforms earn a smaller Replay Bonus.",
    ],
  },
  {
    id: "2026-06-21-platforms-copies",
    date: "2026-06-21",
    title: "Your platforms, your way",
    items: [
      "Add your own platforms (like “Nintendo Switch 2”) in Account settings, or just type one while adding a game — it's saved for next time.",
      "When adding a game, the platform options now come from the consoles you own.",
      "Mark each copy you own as Physical or Digital — so you can track owning a game both ways on the same console.",
    ],
  },
  {
    id: "2026-06-21-playtime-granularity",
    date: "2026-06-21",
    title: "Log play time to the minute",
    items: [
      "Play-time fields now take minutes, not just half-hours — type “1h 30m”, “90m”, “1:30”, or “2.75”.",
      "Your played time shows as a tidy “2h 45m” everywhere.",
    ],
  },
  {
    id: "2026-06-21-targeted-slots",
    date: "2026-06-21",
    title: "Targeted Now Playing slots",
    items: [
      "Admins can hand out special slots that only hold games of a certain length — like a “Quick Clear” slot just for short games.",
      "Your Now Playing slots now show what each one accepts, and a game tells you which slot it's filling.",
      "Move a game out of a general slot into a matching targeted slot to free the general one for something bigger.",
    ],
  },
  {
    id: "2026-06-21-now-playing-slots",
    date: "2026-06-21",
    title: "Now Playing slots",
    items: [
      "You now have a limited number of Now Playing slots — start with 2 — and need an open one to begin a new game.",
      "A slot meter on the Now Playing tab shows what's in use, so you finish or shelve before piling on another big title.",
    ],
  },
  {
    id: "2026-06-21-shelve-it",
    date: "2026-06-21",
    title: "The \"Shelve It\" penalty",
    items: [
      "Dropping a game from Now Playing without finishing it refunds half of what you paid — you recoup some coins but forfeit the rest to the Bazaar.",
      "You'll see the exact refund before you confirm, so there are no surprises.",
    ],
  },
  {
    id: "2026-06-21-add-finished",
    date: "2026-06-21",
    title: "Add games you've already finished",
    items: [
      "When adding a game, choose where it lands: Bazaar, Wishlist, or Finished.",
      "Add finished games straight to your collection — record platforms, cost, and hours played, no coins involved.",
    ],
  },
  {
    id: "2026-06-21-progress-notes",
    date: "2026-06-21",
    title: "Progress notes",
    items: [
      "Jot a quick \"where I left off\" note on any game you're playing — your current chapter, objective, or reminder.",
      "The note shows right on the Now Playing card, and on other players' active boards for context.",
    ],
  },
  {
    id: "2026-06-21-request-tweaks",
    date: "2026-06-21",
    title: "Requests & Bugs tweaks",
    items: [
      "Change a submission's type — switch a feature to a bug (or back) when editing it.",
      "New \"Awaiting Feedback\" status for items that are built and waiting on the requester to sign off.",
      "Submitters can approve their item (marks it Done) or request changes (sends it back to In Progress) once it's awaiting their feedback.",
    ],
  },
  {
    id: "2026-06-21-library-upgrades",
    date: "2026-06-21",
    title: "Your library, leveled up",
    items: [
      "Track which platforms you own each game on — owning it on several shows right on the card.",
      "Record what each copy cost you, with a per-version spend breakdown.",
      "Click any game to edit its details — title, length, hours played, and your copies.",
      "New: this Release Notes panel, so you can keep up with what's changed.",
    ],
  },
  {
    id: "2026-06-21-update-banner",
    date: "2026-06-21",
    title: "Never miss an update",
    items: [
      "A banner now appears when a new version is deployed, prompting a quick refresh.",
    ],
  },
  {
    id: "2026-06-21-red-themes",
    date: "2026-06-21",
    title: "Three new red themes",
    items: ["Added Bloodmoon, Phoenix, and Crimson themes for the red-lovers."],
  },
  {
    id: "2026-06-21-requests-rework",
    date: "2026-06-21",
    title: "Requests & Bugs, reworked",
    items: [
      "A full-screen, searchable board with filtering and sorting.",
      "Edit or delete your own submissions.",
      "Comment threads with replies and emoji reactions.",
      "Get notified when someone replies on a thread you're in or reacts to your comment.",
      "Report bugs, not just feature requests.",
    ],
  },
  {
    id: "2026-06-21-playtime",
    date: "2026-06-21",
    title: "Play-time tracking",
    items: [
      "Log the hours you put into a game and earn a steady trickle of coins as you go.",
      "Record time you'd already played before you started tracking.",
      "See played hours across libraries, plus a clearer estimated coin payout.",
    ],
  },
  {
    id: "2026-06-21-notifications",
    date: "2026-06-21",
    title: "Notifications",
    items: ["A notification bell keeps a permanent history of activity on your account."],
  },
  {
    id: "2026-06-21-market-wishlist",
    date: "2026-06-21",
    title: "The Market & Wishlist",
    items: [
      "Discover games on a dedicated Market page, filtered to the platforms you own.",
      "Wishlist games you can't play yet, and hide ones you're not interested in.",
    ],
  },
  {
    id: "2026-06-21-redesign",
    date: "2026-06-21",
    title: "A fresh look",
    items: [
      "A modern redesign with light/dark mode and several gaming-themed palettes.",
      "Toast feedback and smooth card animations throughout.",
    ],
  },
  {
    id: "2026-06-21-game-data",
    date: "2026-06-21",
    title: "Smarter game data",
    items: [
      "Game stats and box art pulled in automatically from RAWG.",
      "Accurate lengths from HowLongToBeat, with a playstyle selector (story / extras / completionist).",
    ],
  },
  {
    id: "2026-06-21-accounts",
    date: "2026-06-21",
    title: "Accounts",
    items: ["Sign in with Google and link it to your existing account."],
  },
  {
    id: "2026-06-20-leaderboard",
    date: "2026-06-20",
    title: "Leaderboard",
    items: ["Compete on the leaderboard and drill into any player's library."],
  },
  {
    id: "2026-06-20-launch",
    date: "2026-06-20",
    title: "Welcome to Backlog Bazaar",
    items: [
      "Build your game backlog, earn coins by finishing games, and spend them to start new ones.",
    ],
  },
];

/** The id of the latest release (the one users are compared against). */
export const LATEST_RELEASE_ID = RELEASES[0]?.id ?? "";

const SEEN_KEY = "bb-changelog-seen";

/** Pure: is there a newer release than the one the user last saw? */
export function isUnseen(latestId: string, seenId: string | null): boolean {
  return Boolean(latestId) && latestId !== seenId;
}

/** The release id the user has acknowledged (null if they never opened it). */
export function loadSeenReleaseId(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}

/** Mark the latest release as seen (called when the panel is opened). */
export function markReleasesSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, LATEST_RELEASE_ID);
  } catch {
    /* ignore */
  }
}
