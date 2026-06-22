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
    id: "2026-06-22-flexible-length",
    date: "2026-06-22",
    title: "Enter game length in hours and minutes",
    items: [
      "Set a game's length the same flexible way as played time — “1h 30m”, “90m”, or “1:30” all work, not just whole hours.",
      "Lengths now show as a tidy “1h 30m” across your cards and details.",
    ],
  },
  {
    id: "2026-06-22-owned-platform-filter",
    date: "2026-06-22",
    title: "Platform filter matches what you own",
    items: [
      "Filtering by platform now matches the copies you actually own — own a game on Switch 2 but not the Switch release, and the Switch filter won't surface it.",
      "Games with no copies recorded still filter by where they released, so nothing disappears.",
    ],
  },
  {
    id: "2026-06-22-visit-focus",
    date: "2026-06-22",
    title: "A cleaner view when visiting",
    items: [
      "While visiting another player's Bazaar, your own wallet, Add games, The Caravan, and the utility menu step aside — so it's never unclear whose stats you're looking at.",
      "The only coin balance on screen is the player you're visiting; use “Leave” to return to your own pages.",
    ],
  },
  {
    id: "2026-06-22-report-attachments",
    date: "2026-06-22",
    title: "Attach screenshots & logs to reports",
    items: [
      "Add images or log files to a bug or feature report — show the problem instead of just describing it.",
      "Screenshots preview right inside the report; log and text files attach as quick downloads.",
      "Attach up to 5 files (10 MB each) when you create a report, or add and remove them later while editing.",
    ],
  },
  {
    id: "2026-06-22-mobile-nav",
    date: "2026-06-22",
    title: "Smoother navigation on mobile",
    items: [
      "The Back button now works the way you'd expect: it closes an open form or window first, then steps back through the pages you visited.",
      "Refreshing the page keeps you where you were instead of bouncing you Home.",
      "You can cancel a bug or feature report you started, and scroll the Requests page freely while writing one.",
    ],
  },
  {
    id: "2026-06-22-online-presence",
    date: "2026-06-22",
    title: "See who's online",
    items: [
      "A green dot on the leaderboard shows who's active right now.",
      "Peek at what they're up to — “Browsing the Caravan”, “Reading Requests & bugs”, and more.",
      "Want privacy? Flip on “Appear offline” in Account settings to hide your status and activity.",
    ],
  },
  {
    id: "2026-06-22-visit-bazaars",
    date: "2026-06-22",
    title: "Visit other players' Bazaars",
    items: [
      "Tap anyone on the leaderboard — or a poster's name on the Requests board — to browse their Bazaar, Now Playing, Finished, and Wishlist.",
      "You see their pages in their own theme, read-only, so there's nothing to accidentally change.",
      "Your theme now follows you across devices.",
      "New privacy setting: hide what you paid in real money for your games from visitors.",
    ],
  },
  {
    id: "2026-06-22-bazaar-sort-filter",
    date: "2026-06-22",
    title: "Sort & filter your boards",
    items: [
      "Sort any board by lowest unlock cost, highest completion bounty, shortest playtime, name, or date added.",
      "Stack filters for platform, genre, and format (physical vs. digital) — e.g. find your Switch RPGs under 20 hours in seconds.",
      "Built for big backlogs: slice hundreds of games down to exactly what fits your coins and your schedule.",
    ],
  },
  {
    id: "2026-06-22-requests-roomier",
    date: "2026-06-22",
    title: "Roomier requests & bugs",
    items: [
      "Bigger, drag-to-resize text boxes and a wider detail window make writing and editing requests, bugs, and comments much easier.",
      "Much higher text limits, so you no longer have to split a long request across replies.",
      "Edited requests and comments now show an “edited” marker with when they changed.",
    ],
  },
  {
    id: "2026-06-22-unified-family-cards",
    date: "2026-06-22",
    title: "Game Families collapse into one card",
    items: [
      "Linked editions of a game now show as a single card on your boards instead of cluttering them with every port and remaster.",
      "The card tags every platform in the family and sits on one board based on its top edition (Now Playing > Bazaar > Wishlist > Finished).",
      "Open it to get per-edition tabs — each version's stats, cost, progress notes, and actions live there.",
    ],
  },
  {
    id: "2026-06-22-how-it-works",
    date: "2026-06-22",
    title: "A “How it works” page",
    items: [
      "New “How it works” page (in the sidebar) explains the whole concept — the play-to-earn-to-buy loop, the coin economy, slots, and more.",
      "First-timers get a quick link to it from an empty Bazaar.",
    ],
  },
  {
    id: "2026-06-22-avatars",
    date: "2026-06-22",
    title: "Profile pictures",
    items: [
      "Upload a profile picture from your Account page — we crop and shrink it for you.",
      "Your picture shows next to your name in the top bar, on the leaderboard, and in the admin tools.",
      "No picture yet? You'll get a clean circle with your initials.",
    ],
  },
  {
    id: "2026-06-22-mobile-polish",
    date: "2026-06-22",
    title: "Mobile fit-and-finish",
    items: [
      "Notifications stay on screen and show your most recent ones instead of scrolling forever.",
      "Long lists of owned platforms wrap neatly instead of running off the edge of a card.",
      "The Caravan shows one card per row on phones, so the card menus no longer get cut off.",
    ],
  },
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
