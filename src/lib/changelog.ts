// Backlog Bazaar release notes.
//
// HOW TO ADD A RELEASE: when you deploy a meaningful update, prepend a new entry
// to RELEASES (newest first) with a fresh, unique `id` and a few short,
// user-facing bullet points. The `id` doubles as the "seen" marker — a new top
// entry makes the "What's new" dot light up for everyone until they open the
// panel. Keep items benefit-focused; skip pure refactors/infra.
//
// An item can be a plain string, or `{ text, tag }` to show a small category
// badge ("Feature" / "Fix" / "Improvement") next to it. Untagged items render
// without a badge — both forms can be mixed freely in one release.

/** Category badge for a release item. Add a new kind here + in ReleaseNotes. */
export type ReleaseTag = "feature" | "fix" | "improvement";

export interface ReleaseItem {
  text: string;
  tag?: ReleaseTag;
}

export interface Release {
  /** Stable, unique slug. Also used to track which release a user has seen. */
  id: string;
  /** ISO date the release went out, e.g. "2026-06-21". */
  date: string;
  title: string;
  /** Short, user-facing bullet points. A string = no badge; an object adds one. */
  items: (string | ReleaseItem)[];
}

/** Coerce an item to its object form, so the UI can render strings and tagged
 *  items uniformly. */
export function normalizeReleaseItem(item: string | ReleaseItem): ReleaseItem {
  return typeof item === "string" ? { text: item } : item;
}

/** Newest first. RELEASES[0] is the current/latest release. */
export const RELEASES: Release[] = [
  {
    id: "2026-06-25-game-compilations",
    date: "2026-06-25",
    title: "Add game compilations",
    items: [
      { tag: "feature", text: "“Add compilation” lets you log a collection or bundle as one purchase — record the title, total price, platform and format once." },
      { tag: "feature", text: "Every game you list inside the compilation gets its own card on your board, so you can buy, play and finish each one on its own." },
      { tag: "feature", text: "Search each game as you add it — picking a match fills in its length and cover art automatically." },
      { tag: "feature", text: "The total price is split across the games automatically — evenly, weighted by length, or a custom breakdown you enter yourself." },
      { tag: "feature", text: "Each card shows a “Part of …” badge; open it for the Compilation Hub with the total spent, total hours played, and a checklist of every game with its status and time." },
      { tag: "feature", text: "Edit a compilation any time from its hub — rename it, change the price, re-split, or add and remove games." },
      { tag: "feature", text: "Share a compilation you built so others can add it in one tap: suggest it for everyone, and once a moderator approves it, it autocompletes when anyone types its title — pre-filling the games and platform (you still set your own price). Suggest improvements to shared ones too — approved contributions earn coins." },
      { tag: "improvement", text: "Your suggestions — games and compilations — now share one filterable “My contributions” list, newest first, each tagged by type." },
      { tag: "improvement", text: "A compilation's games are deleted together from the hub — they can't be removed one at a time, keeping the purchase intact." },
    ],
  },
  {
    id: "2026-06-24-edit-playtime-by-version",
    date: "2026-06-24",
    title: "Edit playtime by version",
    items: [
      { tag: "feature", text: "Editing a game lets you set your hours per version — one field per copy you own — so corrections land on the right edition, not just the grand total." },
      { tag: "feature", text: "Physical and digital copies of the same platform are tracked separately, in both the log-time picker and the breakdown." },
      { tag: "improvement", text: "Older time logged before formats existed automatically shows under your copy's format when you own that platform in just one format — no manual cleanup." },
      { tag: "improvement", text: "“Played by version” lists only the copies you currently own. Time not tied to one — logged without a version, or on a copy you've changed or removed — collects in a single reassignable “Unspecified” row you can move onto the version you actually played." },
      { tag: "fix", text: "Playtime edited from the Edit Game screen is now attributed to a version, matching how Now Playing logs already worked." },
    ],
  },
  {
    id: "2026-06-24-playtime-and-families",
    date: "2026-06-24",
    title: "Per-version playtime & family polish",
    items: [
      { tag: "feature", text: "Log time on a multi-platform game and it remembers which version you last played — that version stays selected when you come back to log more." },
      { tag: "feature", text: "Open a game to see a “Time by version” breakdown of how many hours you've put in on each platform." },
      { tag: "improvement", text: "The Transaction Ledger now shows which game a Contribution Reward was for, and whether it was a new game or a catalog edit." },
      { tag: "improvement", text: "Editing a game that's part of a Game Family now shows the family's name up top." },
      { tag: "improvement", text: "Linking editions moved into a game card's ⋮ menu to keep the detail view focused." },
      { tag: "fix", text: "Closing the Manage Family window now returns you to the game's details instead of closing everything, and it no longer closes when you tap outside it." },
    ],
  },
  {
    id: "2026-06-23-privacy-and-developer",
    date: "2026-06-23",
    title: "Developer edits & a Privacy Policy",
    items: [
      { tag: "feature", text: "Suggest Edit now includes a Developer field, so you can fix or fill in which studio made a game (separate multiple studios with commas)." },
      { tag: "feature", text: "A new Privacy page (in the sidebar) explains what data we collect, how it's used, and your rights — we don't sell your data." },
      { tag: "fix", text: "Suggesting a game edit no longer shows a stray “Saved” pop-up alongside the confirmation." },
    ],
  },
  {
    id: "2026-06-23-issue-links",
    date: "2026-06-23",
    title: "Link issues together",
    items: [
      { tag: "feature", text: "Open a request or bug and link it to others — “blocks”, “blocked by”, “relates to”, “duplicates”, or “duplicated by” — Jira-style. Linked issues are listed in the detail and jump straight to each other." },
      { tag: "feature", text: "Link a brand-new request to existing ones right as you create it." },
      { tag: "improvement", text: "Admins can change an issue's status right from its detail view, without going back to the board." },
    ],
  },
  {
    id: "2026-06-23-decentralized-families",
    date: "2026-06-23",
    title: "Game Families, Reimagined",
    items: [
      { tag: "improvement", text: "Linked editions no longer hide inside one folder card — each edition gets its own card on the board that matches its status, so your Finished pile shows completed older versions and Now Playing shows the exact port you're tackling." },
      { tag: "improvement", text: "Family members are marked with a small “Family” tag; open any one to see the family's combined hours played and money spent." },
      { tag: "feature", text: "A new Manage Family hub lets you see the full roster and link or unlink editions in one place." },
    ],
  },
  {
    id: "2026-06-23-mobile-header",
    date: "2026-06-23",
    title: "Mobile header polish",
    items: [
      { tag: "fix", text: "The full Backlog Bazaar name no longer gets cut off in the mobile header, and the tagline now appears there too." },
    ],
  },
  {
    id: "2026-06-23-reports-and-notifications",
    date: "2026-06-23",
    title: "Smoother reports & notifications",
    items: [
      { tag: "feature", text: "Paste a screenshot straight into a bug or feature report (or a comment) — no need to save and upload it first." },
      { tag: "fix", text: "Tapping a notification about a request now opens that exact item, even when you're already on the Requests page." },
      { tag: "improvement", text: "The Add a game window now retitles itself — Bazaar, Wishlist, or Finished — to match where the game is headed." },
    ],
  },
  {
    id: "2026-06-23-import-charters",
    date: "2026-06-23",
    title: "Import Charters",
    items: [
      { tag: "feature", text: "Games you already own still add to your Bazaar for free. Your Wishlist is now for games you don't own yet." },
      { tag: "feature", text: "Move a Wishlist game into your Bazaar by spending an Import Charter — buy them with coins from the new charter chip next to your balance, and sell unused ones back." },
      { tag: "improvement", text: "Refreshed the wallet: coins and charters now sit in clean, tappable chips, with a satisfying stamp when you import a game." },
    ],
  },
  {
    id: "2026-06-22-transaction-ledger",
    date: "2026-06-22",
    title: "Transaction Ledger",
    items: [
      { tag: "feature", text: "Tap your coin balance — or “Transaction Ledger” in the menu — to see a full, dated record of every coin you've earned and spent." },
      { tag: "feature", text: "Each entry shows what happened (bounty, activation fee, shelve refund, contribution reward…), the game involved, the exact change, and your balance right after." },
      { tag: "feature", text: "Filter your history to just income, just expenses, or by currency, and scroll back through your whole timeline." },
    ],
  },
  {
    id: "2026-06-22-community-catalog",
    date: "2026-06-22",
    title: "Help build the game catalog",
    items: [
      { tag: "feature", text: "See wrong or missing details on a game? Hit “Suggest edit” on any game to propose a fix — title, cover, platforms, genres, release date or length." },
      { tag: "feature", text: "Searched for a game that isn't listed? Suggest it as a new entry so everyone can add it." },
      { tag: "feature", text: "Earn coins when a moderator approves your suggestion. Approved changes update the game for every player." },
      { tag: "feature", text: "Track your suggestions on the new “My contributions” page: see exactly which fields went live, the coins you earned, and each one's status — and jump there straight from the notification." },
      { tag: "feature", text: "Moderators can approve just some of a suggestion's fields; a partial approval still earns you a (smaller) reward." },
      { tag: "improvement", text: "Editing a game's platforms no longer changes it for everyone instantly — catalog changes now go through a quick review so the shared data stays accurate." },
    ],
  },
  {
    id: "2026-06-22-cover-comments-notifs",
    date: "2026-06-22",
    title: "Restore covers, comment attachments & tidier notifications",
    items: [
      { tag: "feature", text: "Customized a game's cover? You can now restore its original artwork from the edit screen." },
      { tag: "feature", text: "Attach screenshots or logs to a comment, so you can share evidence in a discussion." },
      { tag: "improvement", text: "Opening your notifications and closing them now clears the unread count automatically — no need to open each one." },
      { tag: "fix", text: "The request/bug window now closes only with the ✕ (like the game windows), so a stray tap outside won't lose your comment." },
      { tag: "improvement", text: "What's new now tags each change as a Feature, Fix, or Improvement at a glance." },
    ],
  },
  {
    id: "2026-06-22-mobile-polish-2",
    date: "2026-06-22",
    title: "Mobile fixes",
    items: [
      { tag: "fix", text: "The theme picker opens next to its button and scrolls on its own, instead of stretching the whole menu on mobile." },
      { tag: "improvement", text: "Notifications load more as you scroll, so you can browse your full history." },
    ],
  },
  {
    id: "2026-06-22-profile-badges",
    date: "2026-06-22",
    title: "Profile badges & titles",
    items: [
      { tag: "feature", text: "Players can now earn prestige badges that show on their profile and the leaderboard." },
      { tag: "feature", text: "Choose one of your badges to display as your title from the Account page — or hide it." },
      "Everyone who joined during the beta has been awarded a Beta Tester badge. Thanks for helping shape Backlog Bazaar!",
    ],
  },
  {
    id: "2026-06-22-board-tags-priority",
    date: "2026-06-22",
    title: "Tag and prioritize requests & bugs",
    items: [
      { tag: "feature", text: "Add tags to a request or bug — pick common ones like “mobile” or “quality of life”, or type your own. Custom tags become available to everyone afterward." },
      { tag: "feature", text: "Set a priority (Low / Medium / High) when creating or editing a request, and sort the board by it." },
      { tag: "improvement", text: "Display names are now unique, so no two players share one." },
      { tag: "fix", text: "Fixed the “requested changes” notification icon so it no longer looks like an approval." },
    ],
  },
  {
    id: "2026-06-22-master-ledger",
    date: "2026-06-22",
    title: "The Master Ledger — your whole collection at a glance",
    items: [
      "A new Master Ledger view gathers every game you own — across the Bazaar, Now Playing, and Finished — into one dashboard (Wishlist stays out, since you don't own those yet).",
      "Each card shows a colour-coded status badge so you can see where every game sits at a glance.",
      "Group your library by platform or status, and filter by platform, status, or genre — e.g. every PS5 game you own, finished or not.",
      "A summary header tracks your library health: total games owned, completion percentage, lifetime hours played, games finished this year, and coins earned from clears.",
      "The Master Ledger now lives in the main menu alongside your boards, so it's one tap away.",
      "Visiting another player? Open their Master Ledger to browse their whole collection in the same view.",
    ],
  },
  {
    id: "2026-06-22-edit-display-name",
    date: "2026-06-22",
    title: "Choose your display name",
    items: [
      "Edit your display name anytime from the Account page — fix the capitalization or pick something new.",
      "Signed up with Google? You're no longer stuck with the lowercased name pulled from your email.",
    ],
  },
  {
    id: "2026-06-22-add-game-polish",
    date: "2026-06-22",
    title: "Smoother adding & tidier boards",
    items: [
      "The Add a game window no longer closes when you tap outside it — only the ✕ closes it, so a stray tap can't wipe what you've typed.",
      "The Edit game window works the same way now — only the ✕ closes it, so you won't lose your changes to an accidental tap outside.",
      "Adding a game that isn't in the suggestions? Tap “Add as a custom game” to dismiss the dropdown and keep your own title.",
      "Game cards now share a consistent height for a cleaner, more even look across your collection.",
    ],
  },
  {
    id: "2026-06-22-edit-platforms",
    date: "2026-06-22",
    title: "Add missing platforms to a game",
    items: [
      "Edit a game's platforms from its edit screen — add one the catalog was missing (like Nintendo Switch 2).",
      "Platforms you add to a catalog game are shared, so the next person who adds it sees them too.",
    ],
  },
  {
    id: "2026-06-22-custom-cover",
    date: "2026-06-22",
    title: "Use your own cover art",
    items: [
      "Upload a custom cover image for any game from its edit screen — perfect for manually-added games that aren't in the catalog.",
      "Swap or remove the image anytime to keep your boards looking consistent.",
    ],
  },
  {
    id: "2026-06-22-family-name",
    date: "2026-06-22",
    title: "Name your Game Families",
    items: [
      "Give a linked Game Family its own name — it becomes the title on the family card, instead of defaulting to one edition's name.",
    ],
  },
  {
    id: "2026-06-22-wishlist-version",
    date: "2026-06-22",
    title: "Pick a version for wishlist games",
    items: [
      "Note which platform/edition you're planning to get for a wishlisted game — it shows as “Want on …” on the card.",
      "When you later buy it, that version carries over as your owned copy.",
    ],
  },
  {
    id: "2026-06-22-add-context",
    date: "2026-06-22",
    title: "Smarter Add games button",
    items: [
      "Adding a game now defaults to the board you're on — open it from your Wishlist and it lands in your Wishlist.",
      "On mobile, the floating Add button only shows on your game boards, so it's out of the way on pages like Requests & bugs.",
    ],
  },
  {
    id: "2026-06-22-finish-bounty",
    date: "2026-06-22",
    title: "Finishing pays a bounty",
    items: [
      "Coins now arrive as a single bounty when you finish a game, instead of trickling in per hour you logged.",
      "Logging play time still tracks your hours — it just isn't where the coins come from anymore.",
      "Buy prices and finish bounties can now be balanced by the team without an app update.",
    ],
  },
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
