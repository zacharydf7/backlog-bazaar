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

// Display order of the category groups within a release: untagged intro lines
// first, then Features, Improvements, and Fixes.
const TAG_RANK: Record<ReleaseTag, number> = { feature: 1, improvement: 2, fix: 3 };

/** A release's items grouped by category for display — untagged first, then
 *  feature / improvement / fix — keeping the authored order within each group.
 *  Entries can then be WRITTEN in whatever order tells the story best while
 *  always RENDERING with like items together. */
export function orderReleaseItems(items: (string | ReleaseItem)[]): ReleaseItem[] {
  return items
    .map((raw, i) => ({ item: normalizeReleaseItem(raw), i }))
    .sort((a, b) => {
      const ra = a.item.tag ? TAG_RANK[a.item.tag] : 0;
      const rb = b.item.tag ? TAG_RANK[b.item.tag] : 0;
      return ra - rb || a.i - b.i;
    })
    .map(({ item }) => item);
}

/** Newest first. RELEASES[0] is the current/latest release. */
export const RELEASES: Release[] = [
  {
    // Re-slugged as today's shop waves shipped (economy toggle, premium wave,
    // then companions/coins/collections) so the "What's new" dot re-lights.
    id: "2026-07-19-curio-shop-collections",
    date: "2026-07-19",
    title: "The Curio Shop, an optional coin economy, and pre-order polish",
    items: [
      {
        text: "The Curio Shop is open! Spend your hard-earned coins on permanent cosmetics: titles to wear beside your name, avatar frames, and stall decorations that dress up your Market Square stall and profile. Find it in the sidebar — and watch for seasonal stock that's only on the shelf for a while (once bought, it's yours forever).",
        tag: "feature",
      },
      {
        text: "The shop now carries a Premium class of cosmetics with animation and flair — a frame with a passing glint of starlight, a slowly turning Prismatic ring, twinkling Marquee Lights for your stall — at premium prices, marked with a gilded chip.",
        tag: "feature",
      },
      {
        text: "Seasonal surprise drops: some shop items now stay completely hidden until their season arrives, then appear on the shelf out of nowhere. Keep an eye on the Curio Shop around the holidays…",
        tag: "feature",
      },
      {
        text: "Companions and weather join the premium shelf: a Cat Familiar that naps on your frame (it blinks — and judges), an Ember ring with drifting sparks, a Stormcaller frame with the occasional lightning strike, and a Shooting Star stall where a comet streaks past while you watch.",
        tag: "feature",
      },
      {
        text: "Coin skins: buy a custom mint — Rose Gold, Obsidian, or the glinting Radiant — and every coin and price you see wears it. Visitors see your mint on your profile, too.",
        tag: "feature",
      },
      {
        text: "New premium stall: Penguin Cove — an igloo on the frozen shore with a warm glow in the doorway, glittering ice, and penguins that toboggan clear across your stall when you least expect it.",
        tag: "feature",
      },
      {
        text: "The Retro Arcade shelf is stocked: video-game-inspired cosmetics year-round — a Pixel Heart frame with a blinking low-HP heart, an Invincibility Star that runs the rainbow, CRT scanlines, a Boss Bar, an Arcade Cabinet stall flashing INSERT COIN, a 16-bit Pixel Sunset, a torchlit Dungeon Gate, a Loot Chest that creaks open, a Starfield Warp, a Save Point crystal, arcade coin mints, and titles from Press Start to NPC. Collect the four Retro Arcade pieces for the exclusive High Score title.",
        tag: "feature",
      },
      {
        text: "New premium stall: Coral Reef — your stall underwater, with tropical fish cruising through, bubbles rising off the coral, seaweed swaying in the current, and light glinting near the surface.",
        tag: "feature",
      },
      {
        text: "New premium stall: Deep Space — a black void of resting and twinkling stars, a ringed gas giant, a little red planet, and a UFO that jinks across the sky when you least expect it. Look closely: someone's flying it.",
        tag: "feature",
      },
      {
        text: "Three more premium stalls: Puppy Park (a sunny lawn where a golden pup gallops clear across after a runaway ball, doghouse and paw prints included), Cat Nap (a sunbeam corner with a cat asleep on a cushion — breathing slowly, Zzz's drifting up, yarn and a butterfly pointedly ignored), and High Seas (two pirate ships riding the swell, trading cannon fire — muzzle flash, arcing shot, splash — under a flock of gulls).",
        tag: "feature",
      },
      {
        text: "New premium stall: Trophy Cabinet — a glass case of hard-won gold and silver behind your stall, with the glare sweeping the glass and the trophies catching the light when you least expect it.",
        tag: "feature",
      },
      {
        text: "New premium stall: Dragon's Keep — a storybook castle with fluttering pennants and a lit window, standing over a green field, while a dragon beats its wings clear across the sky above your stall.",
        tag: "feature",
      },
      {
        text: "The Iridescent collection (community-requested!): a shifting-color set — the Iridescent title that's never the same color twice, a Pearlescent frame swirling every color at once, the Iridescent Veil stall with aurora curtains rippling over a starlit night, and a milky Opal Mint whose colors move. Own all four and the pearlescent Opalescent title is yours. Plus a Soap Bubble frame on the side.",
        tag: "feature",
      },
      {
        text: "Collections with set bonuses: own every piece of a seasonal collection and an exclusive animated title is yours on the spot — shimmering, glowing chips no amount of coins can buy directly.",
        tag: "feature",
      },
      {
        text: "Stall decorations now scale up on profile pages, so your cobwebs, light strings, and snowfall are easy to admire on the big header.",
        tag: "improvement",
      },
      {
        text: "On compact cards (Market Square rows, shop previews), stall decorations now fade into the background so names and stats stay easy to read — the full-strength scene lives on the big profile header.",
        tag: "improvement",
      },
      {
        text: "Prefer a plain backlog tracker? Turn off the coin economy in Account settings: starting a game becomes free, finishes pay no bounty, and prices, coins, charters and vouchers disappear from the app. Your balance is kept safe and frozen — flip it back on any time and pick up exactly where you left off (active game backings are returned when you switch off).",
        tag: "feature",
      },
      {
        text: "Importing a Wishlist game that isn't out yet now asks: did you pre-order it? Confirm with the expected date and what you paid, and it lands in your Bazaar as a locked pre-order with its countdown — and if the order ever falls through, cancelling it returns the Import Charter you spent.",
        tag: "feature",
      },
      {
        text: "The Bazaar's Coming up strip now announces only pre-orders arriving within the next 30 days, so it means what it says: time to get your coins and slots ready. Far-off pre-orders still pin on the board with their countdowns.",
        tag: "improvement",
      },
      {
        text: "Adding a game whose release date has already passed no longer offers the pre-order checkbox — it only appears when it could actually apply.",
        tag: "improvement",
      },
      {
        text: "Jump back to the top with one tap: a floating button appears on your boards and the Master Ledger once you've scrolled a screenful deep — no more flicking all the way back up a long list.",
        tag: "improvement",
      },
      {
        text: "The Co-op Pact banner on a game's page now lays out properly on phones — the pact status gets its own line instead of being squeezed into a sliver beside the buttons.",
        tag: "fix",
      },
      {
        text: "The banner-positioning dialog no longer hides behind your game cards, and clicking outside it no longer throws away your positioning — only Cancel or the X closes it.",
        tag: "fix",
      },
    ],
  },
  {
    id: "2026-07-18-ledger-paging",
    date: "2026-07-18",
    title: "The Market Square, Player 2 Co-op Pacts, and pre-orders",
    items: [
      {
        text: "The Leaderboard is now the Market Square: players with their stall open right now are pinned up top with what they're playing, and everyone else lists below — sort by recent activity, most clears, or name. Coin rankings are gone; tap any stall to visit that player's Bazaar, just like before.",
        tag: "feature",
      },
      {
        text: "The Market Square is a community hub: Fresh Clears streams finished games from the whole community (cheer anyone on — no friendship needed), Talk of the Bazaar shows the newest reviews with their scores, and the Stall of the Week crowns whoever cleared the most games in the last seven days.",
        tag: "feature",
      },
      {
        text: "New privacy toggle in Account settings: Keep my clears out of the Market Square. Your friends' activity feed is unaffected, and nothing from before today ever appears in the community feed.",
        tag: "feature",
      },
      {
        text: "Hot This Week in the Market Square: a shelf of the titles the community is adding, finishing, liking and reviewing right now — anonymous counts, refreshed from the last seven days. Titles you own open straight into your library.",
        tag: "feature",
      },
      {
        text: "Curated Stalls in the Market Square: browse players' public game lists — cover previews, game counts, and a tap to open the list or visit its curator. Publishing a list (visibility: Public) is all it takes to appear.",
        tag: "feature",
      },
      {
        text: "Back a Game! Visiting a friend's Bazaar, stake some of your own coins on a backlog game — they claim the stake as a bonus on top of the bounty by finishing it. Unclaimed stakes quietly return to you after 60 days (or if the game is retired or removed), and a Backed chip on your own cards shows who's rooting for you.",
        tag: "feature",
      },
      {
        text: "Co-op Pacts now welcome friends who don't own the game: invite any friend — accepting adds it to their library as a Player 2 copy on your platform (no Import Charter needed, just the activation fee) and starts it right away. Invites for games you don't own appear at the top of your Bazaar and in your notifications.",
        tag: "feature",
      },
      {
        text: "Feeling generous? When sending a pact invite you can offer to cover your friend's activation fee — it's charged to you the moment they accept, so coins never stand between you two.",
        tag: "feature",
      },
      {
        text: "New Co-op Pacts lane in Now Playing: pact games play there with no limit and never take a Focus slot, so a slow partner can't block you. Sending an invite moves your game there immediately (freeing its slot) with a chip showing you're waiting on your friend.",
        tag: "feature",
      },
      {
        text: "Pre-orders! A game you've already bought but isn't out yet lives in your Bazaar, like your console library: mark it while adding it (or from its card's ⋮ menu) with its release date and what you paid. It pins to the top of the Bazaar with a countdown, locked from starting — then unlocks by itself on release day with an arrival alert. Order fell through? Cancel it and either remove the game or keep it as a Wishlist want.",
        tag: "feature",
      },
      {
        text: "Game Families break out on the game page: Journey can follow the whole family's story or a single edition's, and Review lets you pick which edition you're reviewing (the primary by default).",
        tag: "feature",
      },
      {
        text: "Choose which edition's cover art fronts your family — the board card and the game page both wear it (Overview → Family cover).",
        tag: "feature",
      },
      {
        text: "Big collections no longer slow down the Master Ledger — it now loads a page of games at a time and quietly fetches more as you scroll, just like the boards.",
        tag: "improvement",
      },
      {
        text: "Coming back from a game's page still drops you right on the row you left, even deep in a long ledger.",
        tag: "improvement",
      },
      {
        text: "A family's Owned On section now names each edition with its own platforms, instead of one merged pile of tags.",
        tag: "improvement",
      },
      {
        text: "“Link another edition” now suggests kindred titles from your library — sequels, remasters, other entries in the series — instead of whatever you added most recently.",
        tag: "improvement",
      },
      {
        text: "Fixed the Sever Family Link button: its confirmation was opening invisibly behind the Family Breakdown window.",
        tag: "fix",
      },
      {
        text: "Changed your mind after inviting? You can now offer to cover your friend's activation fee — or retract the offer — on a pact invite you've already sent, straight from the pact banner. No more withdrawing and re-inviting.",
        tag: "feature",
      },
      {
        text: "The pact invite window now shows roughly what covering the fee will cost, and warns you up front if your balance won't stretch that far.",
        tag: "improvement",
      },
      {
        text: "A covered pact fee no longer dead-ends when the gifting friend is short on coins at accept time: instead of a confusing error, you're told plainly what happened and offered to pay your own way or wait — and they get a nudge to top up.",
        tag: "fix",
      },
      {
        text: "A Co-op Pact game that detours through the Completionist lane now returns to its Co-op lane seat when you stop the 100% run, instead of dropping into Focus and stranding the pact.",
        tag: "fix",
      },
    ],
  },
  {
    id: "2026-07-13-quality-of-life",
    date: "2026-07-13",
    title: "Fly through big boards",
    items: [
      { tag: "feature", text: "Long boards get a fast-scroll rail on phones: start scrolling and a slim track fades in on the right edge. Sorted A–Z it's a letter index — tap or slide to a letter to jump straight to those titles; under any other sort it's a drag handle that whips through the whole list, with a big center bubble anchoring where you are (“Jul 2026”, “~50h”, “120 coins”). It fades back out two seconds after you stop." },
      { tag: "fix", text: "Scrolling the page no longer changes a number field you were typing in — cost, coins and other numeric inputs now ignore the scroll wheel while focused." },
      { tag: "improvement", text: "Not sure about a Mystery Pull? Tap the drawn game's cover (or its title) to jump to its page and look it over — the pull simply steps aside, nothing is charged." },
      { tag: "improvement", text: "A game's “Owned on” spend breakdown now says where each copy came from — standalone purchases are listed first, and copies that came in a compilation sit under a “Part of …” header naming the bundle (each bundle listed if there are several)." },
    ],
  },
  {
    id: "2026-07-11-value-played",
    date: "2026-07-11",
    title: "Co-op Pacts arrive",
    items: [
      { tag: "feature", text: "Co-op Pacts: pledge to finish a game together with a friend. Invite them from the game card's ⋮ menu — they just need to own the same title, on any platform — and once you BOTH finish it, each of you earns a bonus on top of your own bounty. Pacted cards wear your partner's avatar, the game's page shows their progress, and “How it works” has the full details. Backing out (shelving, retiring, or dissolving) simply ends the pact — no bonus, no penalty." },
      { tag: "improvement", text: "Value Played on a game's Overview is now the dollars of play you've banked — your target rate × hours played (e.g. $7.50/hr × 10.65h = $79.88). Once it covers what you spent, it turns green with the gem; until then it shows exactly how much playtime is left to reach “well spent”." },
      { tag: "improvement", text: "Money amounts now group thousands with commas — “$1,234.56” — everywhere spend is shown, including the Master Ledger stats." },
      { tag: "fix", text: "Each tab now opens at the top, and returning to a card after backing out of its page no longer follows you to other tabs — the Master Ledger and the boards keep their places separate." },
    ],
  },
  {
    id: "2026-07-10-bundle-order",
    date: "2026-07-10",
    title: "Bundles keep their order",
    items: [
      { tag: "fix", text: "A newly added compilation now remembers its natural order — the order you entered the games (or the official bundle lists them) is the order its cards appear in everywhere, with no manual reordering needed. Previously the order could scramble after a reload." },
      { tag: "fix", text: "Editing a compilation keeps its games in their displayed order, and a game you add mid-list stays exactly where you put it." },
      { tag: "fix", text: "Previous / Next on a game's page now steps through games stacked into a same-game deck instead of skipping over them." },
      { tag: "fix", text: "Opening a compilation or Game Family card from deep in a long board and backing out now returns you to that card, instead of occasionally jumping to the top of the page." },
      { tag: "fix", text: "Expanding a game into a compilation no longer fails with an UNKNOWN_PLATFORM error when the community bundle's info carries an outdated platform spelling — off-list terms are now quietly cleaned up instead." },
      { tag: "improvement", text: "“Missing platform? Choose from all platforms” now lives at the bottom of the platform dropdown itself — pick it there to widen the choices, instead of hunting for a separate link below." },
      { tag: "feature", text: "New “Player 2” ownership type — log games you play on someone else's copy (couch co-op, screen share, a partner's license). They never count toward your spending, wear a distinct two-player badge on their cards, and get their own filter chip in the Master Ledger." },
      { tag: "feature", text: "“Money Well Spent”: set a target cost per hour in Account settings (e.g. $1.00/hour), and any game whose logged playtime pays off its purchase price earns a “Well spent” badge on its cards and page — hover it for the math. Each game's Overview also shows its value played (the $/hr it has cost so far) beside the money spent, and the Master Ledger stats gain total money spent and your real cost per hour, following your filters. Free and Player 2 games are never judged." },
    ],
  },
  {
    id: "2026-07-08-game-browsing",
    date: "2026-07-08",
    title: "Move through your collection your way",
    items: [
      { tag: "feature", text: "A game's page now has Previous / Next buttons when you opened it from the Bazaar, Finished, or Master Ledger — step through your collection card by card, in the same order you were browsing, without returning to the list each time." },
      { tag: "feature", text: "The ⋮ menu on a Bazaar game now has 'Move to Finished' (pick Beaten or Completed) — a quick fix for a game you'd already finished but added to the Bazaar by mistake. No coins are spent or earned." },
      { tag: "feature", text: "A game's detail page now has its own ⋮ menu with the same quick actions as a board card — move to Wishlist or Finished, make it private, link editions, or delete it — right from the page." },
      { tag: "fix", text: "Opening a game from deep in a long board — or from the Master Ledger — and clicking Back now returns you to that same card instead of jumping to the top of the list." },
      { tag: "fix", text: "A compilation's games now stay together in order — on the boards and in the Master Ledger — whether or not you've dragged them into a custom order, instead of scattering under the sort. Reorder them in the bundle's card to change it." },
      { tag: "improvement", text: "Deleting a game from its detail page now moves you to the previous card in the list (or the new first one) instead of dropping you back on the board, so you can keep working through your collection." },
      { tag: "fix", text: "Previous / Next now steps through a collapsed compilation's bundle page too, instead of skipping over it — and the bundle page has its own Previous / Next so you can keep browsing without backing out." },
    ],
  },
  {
    id: "2026-07-07-board-paging",
    date: "2026-07-07",
    title: "Smoother boards with big libraries",
    items: [
      { tag: "improvement", text: "Boards with hundreds of games now load a page of cards at a time and reveal more as you scroll, so opening the Bazaar (or any board) stays fast and smooth instead of lagging while everything renders at once." },
    ],
  },
  {
    id: "2026-07-07-csv-covers-and-cancel",
    date: "2026-07-07",
    title: "CSV imports now find cover art",
    items: [
      { tag: "improvement", text: "After a CSV import adds your games, a background pass automatically links each one to the game database and pulls in its cover art where there's a confident match — no more plain, art-less cards." },
      { tag: "improvement", text: "You can now cancel an import (or just the cover-finding step) at any time — everything already added is kept." },
    ],
  },
  {
    id: "2026-07-06-privacy-and-csv-import",
    date: "2026-07-06",
    title: "True profile privacy & CSV imports",
    items: [
      { tag: "improvement", text: "Making your profile private now hides you completely: you're off the leaderboard, your profile and library can't be visited (even by friends), and your reviews and activity stay yours alone. Friendships and messages keep working." },
      { tag: "feature", text: "Import your collection from a CSV file — Add → Import from CSV reads a spreadsheet export (title, platform, cost, hours, status…), shows you exactly what will be added or skipped, and imports the rest in one go." },
    ],
  },
  {
    id: "2026-07-06-lanes-and-bundle-order",
    date: "2026-07-06",
    title: "Visited Now Playing by lane, and reorderable bundles",
    items: [
      { tag: "feature", text: "Visiting a profile now breaks their Now Playing into lanes, so you can see what they're focused on finishing, replaying, or going for 100%." },
      { tag: "feature", text: "Open a compilation and drag its games into the order you want — that order carries to the collapsed card and to the separate cards when you split the bundle." },
    ],
  },
  {
    id: "2026-07-06-quick-wins",
    date: "2026-07-06",
    title: "Private at add, truer activity order & a clearer digital icon",
    items: [
      { tag: "feature", text: "Mark a game private right from the Add dialog with a new toggle — no need to add it first and hide it afterward." },
      { tag: "improvement", text: "Your profile's Recent Activity now lists events in the real order they happened, using the actual timestamp instead of a fixed step order." },
      { tag: "improvement", text: "The digital-copy icon on platform tags is now a download arrow, which reads more clearly than the old cloud." },
    ],
  },
  {
    id: "2026-07-06-ledger-bar-visiting-fix",
    date: "2026-07-06",
    title: "Master Ledger filter bar clears the header while visiting",
    items: [
      { tag: "fix", text: "The Master Ledger's pinned filter bar no longer hides behind the header on mobile when you're viewing another player — it now tracks the header's real height, including the \"You're visiting\" banner, on every screen size." },
    ],
  },
  {
    id: "2026-07-06-empty-lanes-collapse",
    date: "2026-07-06",
    title: "Now Playing takes up less room on mobile",
    items: [
      { tag: "improvement", text: "On phones, an empty Now Playing lane (Focus, Replay, Completionist, or Rotation) now collapses to just its heading instead of showing empty slots — so you spend less time scrolling past lanes you aren't using." },
    ],
  },
  {
    id: "2026-07-05-ledger-bar-mobile-fix",
    date: "2026-07-05",
    title: "Master Ledger filter bar fits on phones",
    items: [
      { tag: "fix", text: "The Master Ledger's pinned filter bar is no longer cut off behind the header on mobile — it now sits just below it." },
    ],
  },
  {
    id: "2026-07-05-wishlist-and-ledger-families",
    date: "2026-07-05",
    title: "Wishlist from a visit, clearer family cards & a copy fix",
    items: [
      { tag: "feature", text: "Viewing another player's game you don't have? A Wishlist button on their game page adds it straight to your own wishlist." },
      { tag: "improvement", text: "Family cards on the Master Ledger now show the family name and roll up spend and hours played across every linked edition, so a family reads as one." },
      { tag: "fix", text: "Re-adding a game you already own to your Bazaar or Finished shelf no longer shows text about your Wishlist — it names the shelf you're actually adding to." },
    ],
  },
  {
    id: "2026-07-05-on-hold-status",
    date: "2026-07-05",
    title: "Requests can be put On Hold",
    items: [
      { tag: "improvement", text: "Feature requests and bug reports can now be marked On Hold — parked for maybe-someday or while we wait for more detail, rather than closed. You’re notified if yours moves there, and On-Hold items stay out of the active queue (find them with the On Hold filter)." },
    ],
  },
  {
    id: "2026-07-05-ledger-filter-bar",
    date: "2026-07-05",
    title: "Master Ledger: a smarter, sticky filter bar",
    items: [
      { tag: "improvement", text: "The Master Ledger's controls now sit up top and stay pinned as you scroll, so you can re-filter or re-group without scrolling back to the top." },
      { tag: "improvement", text: "Your library-health stats now recalculate for whatever filter is applied — see games owned, completion rate and hours for just your PlayStation 5 shelf, for example — with a Filtered badge and a one-tap Clear back to lifetime totals." },
    ],
  },
  {
    id: "2026-07-05-game-detail-fixes",
    date: "2026-07-05",
    title: "Cleaner platform versions on the game page",
    items: [
      { tag: "fix", text: "Removing a platform version from a game's Library tab now deletes that version outright — with a quick confirm — instead of leaving an empty, platform-less card behind. Each version also gets its own Remove button." },
      { tag: "fix", text: "A game you only wishlist on another platform no longer shows up under “Owned on” or in the Journey/Review edition dropdowns — it’s listed under “Want on” instead." },
    ],
  },
  {
    id: "2026-07-05-video-attachments",
    date: "2026-07-05",
    title: "Attach screen recordings to reports",
    items: [
      { tag: "feature", text: "Attach an .mp4 screen recording (up to 50 MB) to a feature or bug report — it plays inline right on the board, so you can show a problem instead of describing it." },
    ],
  },
  {
    id: "2026-07-05-profile-in-rotation",
    date: "2026-07-05",
    title: "Live-service games read as In Rotation on your profile",
    items: [
      { tag: "improvement", text: "Your profile now lists live-service games under their own In Rotation section instead of lumping them into Now Playing, and their Recent Activity reads In Rotation rather than a generic Started." },
    ],
  },
  {
    id: "2026-07-05-keep-board-filter",
    date: "2026-07-05",
    title: "Filters stay put when you open a game",
    items: [
      { tag: "fix", text: "Filter a board or the Master Ledger, open a game, then hit Back — your filter stays applied and its panel stays open, instead of resetting." },
    ],
  },
  {
    id: "2026-07-05-rotation-unlimited",
    date: "2026-07-05",
    title: "Unlimited Rotation, In Rotation statuses & add-a-platform from the hub",
    items: [
      { tag: "feature", text: "The Rotation lane no longer has a cap — slot as many live-service and ongoing games as you play. The dashboard keeps its clean four-quadrant shape: past two games, the Rotation row scrolls sideways with edge arrows (trackpad swiping works too)." },
      { tag: "feature", text: "Own or want a game on another platform? The game page's Library tab now has an Add a platform button that opens the add form with the game already picked — just choose the platform, format and cost." },
      { tag: "improvement", text: "Live-service games now wear an In Rotation status (with the lane's ∞ mark) instead of Now Playing — on cards, the Master Ledger, search, the game hub and even other players' reviews. Rotation is its own rhythm; the label finally says so." },
      { tag: "improvement", text: "Convert to Endless and Add to Rotation are never blocked by a full lane anymore — the lane-size settings are gone from the admin screens too." },
    ],
  },
  {
    id: "2026-07-05-format-glyphs-comp-cover",
    date: "2026-07-05",
    title: "Format icons on your cards + a compilation-cover fix",
    items: [
      { tag: "feature", text: "Platform tags now carry little format icons — a disc for physical, a cloud for digital, a puzzle piece for DLC — so you can tell at a glance how you own each game. All three show when you own a platform in all three forms." },
      { tag: "fix", text: "A compilation added from a shared community template now shows its assigned cover on the collapsed card right away, instead of borrowing the first game's art until you reloaded." },
    ],
  },
  {
    id: "2026-07-05-game-details-hub",
    date: "2026-07-05",
    title: "The Game Details Hub — one page per game, every copy in one place",
    items: [
      "A game's page is now one unified hub for the whole title: whichever copy's card you open — PS5, Switch, a linked remaster — you land on the same page with the same cover, title and community info.",
      { tag: "feature", text: "The Library tab is the control center for every copy you own of that game: each version listed with its own platform, status and copies editor, plus the tools to link editions into a Game Family or sever a link — without leaving the page." },
      { tag: "feature", text: "Journey and Review gained a Select Edition dropdown: your milestones, playtime and written reviews stay safely on the copy that earned them, and you flip between them right on the page. A linked family shows as one entry." },
      { tag: "feature", text: "On stacked decks, each platform tag is now a shortcut — tap it to jump straight to that version's page." },
      { tag: "improvement", text: "The page header is now universal — cover art and global title only. Owned-on platforms and money spent roll up across all your copies on the Overview tab, and a new editions bar sums hours played across every copy." },
    ],
  },
  // The unified-families release, revised the same day it shipped: the
  // requester's follow-up (zero data migration + the Family Breakdown modal)
  // replaced the original Change-Primary handoff, so this entry describes the
  // FINAL behavior and its id was renamed to re-light the "What's new" dot.
  {
    id: "2026-07-05-unified-families-breakdown",
    date: "2026-07-05",
    title: "Game Families reimagined — one card, zero data migration",
    items: [
      "Duplicate copies of a game now truly play as one: a linked family is a single, ordinary-looking card driven by the primary edition you designate — and every edition's history stays permanently on its own record.",
      { tag: "feature", text: "Pick a primary edition when linking — the family card lives on its board, wears its box art, and new hours, notes and milestones save to its record." },
      { tag: "feature", text: "The card shows platform tags for every linked copy side by side (primary's first), the family's combined playtime, and a subtle badge — no more nested editions or expanders." },
      { tag: "feature", text: "The new Family Breakdown (tap the badge, or View linked editions in the ⋮ menu) lists every copy with its own platform, logged time and status — crown a different primary or remove a single copy right there." },
      { tag: "feature", text: "Changing the primary moves nothing: each edition keeps the playtime and milestones it earned, forever. The card simply follows the new primary's status." },
      { tag: "feature", text: "A linked game's Journey now interleaves every edition's milestones into one timeline, each entry marked with the edition that earned it." },
      { tag: "feature", text: "Sever family link dissolves a family back into standalone cards; the Breakdown's Remove takes out one copy at a time." },
      { tag: "improvement", text: "A family is one economy unit end to end: one activation fee, one slot, one Master Ledger entry, one completion bounty — hidden editions can't double-earn." },
      { tag: "feature", text: "Stacked decks now wear a platform tag for every copy in the stack, not just the top card's." },
      { tag: "feature", text: "Tapping Buy & Start (or Import with Charter, Add to Rotation, or Retire it) on a collapsed stack now asks which version you mean." },
    ],
  },
  {
    id: "2026-07-04-custom-lists",
    date: "2026-07-04",
    title: "Custom Lists — rank your favorites and share your taste",
    items: [
      "A new My Lists page (in the sidebar) lets you curate ordered game lists — a Top 10, a franchise ranked, a recommendation shelf — beyond the fixed boards.",
      { tag: "feature", text: "Search the whole game catalog to add entries — including games you never logged — drag to reorder them, and give every pick its own blurb explaining why it made the cut." },
      { tag: "feature", text: "Choose who sees each list: Public shows it on your profile, Unlisted lets anyone with the link view it (tap Copy link to share), Private keeps it yours." },
      { tag: "feature", text: "Folders keep a growing collection tidy: drag lists into them (or file them from a card's menu), filter with the directory's live count badges, and jump back with All Lists." },
      { tag: "feature", text: "Your profile gains a Lists shelf — visitors can browse your public lists, and the games they own themselves are badged when they read one." },
      { tag: "feature", text: "Three new Curator achievements reward curation: your first list of 5+ games, then 5 and 15 such lists." },
      { tag: "improvement", text: "Export my data now includes your custom lists and folders." },
    ],
  },
  {
    id: "2026-07-04-smart-banner-match",
    date: "2026-07-04",
    title: "Profile colors matched to your banner, in one tap",
    items: [
      { tag: "feature", text: "New in Profile colors: tap “Match my banner” and the Bazaar auto-picks a background and accent that complement your banner's colors — always readable, on any banner. Not feeling it? Tap again to cycle through other good matches." },
      { tag: "fix", text: "Release notes no longer claim to be from the future — the two newest entries were stamped a day ahead." },
    ],
  },
  {
    id: "2026-07-04-polish-likes-bars-nav",
    date: "2026-07-04",
    title: "A thumbs-up for Likes, readable platform bars & smoother visits",
    items: [
      { tag: "improvement", text: "Likes now use a thumbs-up everywhere (cards, game pages, filters, Favorites, the Tastemaker medals) — the heart belongs to your Wishlist, and the two kept getting mixed up." },
      { tag: "fix", text: "The profile Platforms bars got a readable palette: every status has its own distinct color (Completed wears medal gold, Endless sky blue, Retired a quiet stripe) on every theme and accent." },
      { tag: "fix", text: "Leaving someone's Bazaar returns you to the page you started the visit from — no more surprise landings on your own profile." },
      { tag: "fix", text: "The who-liked-this list no longer cuts off long game titles." },
    ],
  },
  {
    id: "2026-07-04-per-platform-instances",
    date: "2026-07-04",
    title: "Every platform is its own card",
    items: [
      "Your library now tracks one card per platform you own a game on. Each copy has its own status, play time and coin economy — finishing on PC and replaying on Switch are two real playthroughs.",
      { tag: "feature", text: "Adding a game on a new platform creates its own card (physical, digital and DLC copies of the same platform still live together). The Add flow shows you exactly where each copy will land before anything happens." },
      { tag: "feature", text: "A game you already beat on another platform wears a Cleared Elsewhere badge on its unplayed copies — context without touching their own progress or bounty." },
      { tag: "feature", text: "New Stack toggle on your boards: copies of the same game fold into one deck you can fan out with a tap, for a tidier shelf without merging anything." },
      { tag: "improvement", text: "A game owned standalone AND inside a compilation now shows as two honest, independent cards — the bundle copy stops silently merging into the standalone one." },
      { tag: "improvement", text: "Existing multi-platform cards were carefully split into per-platform cards: your most-played platform kept the coins, review and milestones, hours followed their platform, and finished games stayed finished everywhere." },
      { tag: "improvement", text: "Leaderboard, profile totals and achievements count distinct games — owning or finishing a game on three platforms counts it once, so nothing inflates." },
      { tag: "improvement", text: "Wishlist wants are per-platform too: buying the wishlisted platform settles exactly that entry, and an entry hunting a different platform is left alone." },
    ],
  },
  {
    id: "2026-07-04-likes",
    date: "2026-07-04",
    title: "Like your favorites — and see the community's",
    items: [
      { tag: "feature", text: "Tap the heart on any game — on its card or its page — to mark it a favorite. Likes are a pure taste marker: they never affect prices or bounties." },
      { tag: "feature", text: "Your profile gains a Favorites shelf showing the games you love, newest first — visible to visitors too (private games stay private)." },
      { tag: "feature", text: "A game's Community stats now count its likes across all players — tap the count to see who, and jump straight to their Bazaar." },
      { tag: "feature", text: "Filter any board or the Master Ledger down to liked games with the new Liked toggle." },
      { tag: "feature", text: "Three new Tastemaker achievements reward sharing your taste: like your first, your 10th, and your 50th game." },
    ],
  },
  {
    id: "2026-07-04-achievements",
    date: "2026-07-04",
    title: "Achievements — milestone medals for how you play",
    items: [
      { tag: "feature", text: "Earn Bronze, Silver and Gold medals automatically as you play: finishing games, 100% completions, hours logged, coins earned, library growth, reviews written, honest retirements, and milestones recorded — 24 achievements at launch." },
      { tag: "feature", text: "A new Achievements page (in the sidebar) shows your full trophy room: earned medals with the date you got them, upcoming targets with live progress bars, and how rare each medal is among all players." },
      { tag: "feature", text: "Your profile gains an Achievements case showing your current medal per family — and you can see the medals other players have earned when visiting theirs." },
      { tag: "improvement", text: "Your play history counts: the first time you sign in, everything you've already done is awarded retroactively." },
    ],
  },
  {
    id: "2026-07-04-consistent-game-page",
    date: "2026-07-04",
    title: "A calmer, more consistent game page",
    items: [
      { tag: "improvement", text: "A game's page now looks the same whichever board it's on — the status-specific buttons (buy, log time, finish, shelve) stay on the board card, so opening a game is always a clean, consistent view. You can still log play time from its Journey tab." },
      { tag: "fix", text: "When you're viewing another player's library, their game pages no longer show edit controls that aren't yours to use." },
    ],
  },
  {
    id: "2026-07-04-community-stats-and-acquisition",
    date: "2026-07-04",
    title: "Community stats and how you got each game",
    items: [
      { tag: "feature", text: "Every game's Community tab now opens with a stats panel: the community's average rating and score distribution, how many players have it Now Playing / in their Bazaar / Finished / Wishlisted, and total hours logged across everyone." },
      { tag: "feature", text: "Track how you have each copy — Owned, on a Subscription (Game Pass, PS Plus…), or Borrowed — with the service or lender noted. Subscription and borrowed games get a subtle tag on their card so a 'rented' copy is easy to spot." },
    ],
  },
  {
    id: "2026-07-04-retire-it-salvage",
    date: "2026-07-04",
    title: "Retire It — a graceful exit for games that aren't clicking",
    items: [
      { tag: "feature", text: "Done with a game you'll never finish? Retire It 🏳️: it moves to your Finished shelf under a muted Retired tag — out of your backlog for good, no more faking a 'Beaten' to declutter. Works from the Bazaar or straight from a Now Playing lane, with an optional note on why it didn't click." },
      { tag: "feature", text: "Retiring a game you're playing salvages coins back — the same rate as Shelve It — logged in your ledger as 'Dropped Game Salvage'. Retired games pay no bounty and stay out of your finished stats, platform clear rates, and the leaderboard." },
      { tag: "feature", text: "Changed your mind? Return a Retired game to the Bazaar anytime — playing it again is a normal full-price buy. You can also re-tag old shelf entries as Retired (or back) to clean up your history." },
    ],
  },
  {
    id: "2026-07-04-recent-activity-timeline",
    date: "2026-07-04",
    title: "A fuller Recent Activity timeline",
    items: [
      { tag: "improvement", text: "Your profile's Recent Activity now tells the whole story — when you added a game, started it, and beat or 100%'d it — instead of only your clears. A friend's profile shows theirs the same way." },
    ],
  },
  {
    id: "2026-07-04-profile-shelves-and-pull-intro",
    date: "2026-07-04",
    title: "Cleaner profile shelves and a friendlier Mystery Pull",
    items: [
      { tag: "improvement", text: "Tap any game in the Now Playing or Finished section of a profile to open its page — the same jump the Recent Activity feed already offered." },
      { tag: "improvement", text: "Profile game shelves are tidier: each cover now shows just its title, without the redundant status and platform chips." },
      { tag: "improvement", text: "The first time you open a Mystery Pull, a quick intro explains what the dice do before your first roll." },
    ],
  },
  {
    id: "2026-07-04-moderator-tools-and-detail-polish",
    date: "2026-07-04",
    title: "Mystery Pulls, community reviews, and compilation pages",
    items: [
      { tag: "feature", text: "Mystery Pull 🎲: can't decide what to play? Hit the dice on your Bazaar and it draws a random game you can start right now — at its normal price, into an open slot. Take it, re-roll, or walk away. The dice work on your Finished shelf too, drawing a beaten game to pull back for a free 100% run." },
      { tag: "feature", text: "Every game page now has a Community tab showing what the whole Bazaar thinks: each player's review of that game with their score, how far they got, and the platforms they played on — newest first. Visitors can browse it too." },
      { tag: "feature", text: "Collapsed compilations now open their own page, just like a game: cover art and bundle stats up top, every included game one click away, and a Journey tab with a milestone timeline per game." },
      { tag: "feature", text: "Export your data: download your whole collection — every game and compilation, your platforms and coin balance — as a JSON file from Account settings." },
      { tag: "improvement", text: "Moderators can now set or fix a game's release date when editing it, so newly added games show the right year in search results." },
      { tag: "improvement", text: "Platform tags on the game page and compilation cards now show just the platform, without the Physical/Digital label — your full per-copy format breakdown still lives on the Master Ledger." },
      { tag: "fix", text: "The 'Restore original' cover button now appears only when you've uploaded your own art, so it no longer offers to swap a community-approved cover back to the old one." },
      { tag: "fix", text: "Tooltips in a game card's ⋯ menu now describe the option you're hovering, instead of all reading 'Edit'." },
      { tag: "fix", text: "Wishlisting a game no longer stamps it with an 'Added' milestone — that's recorded when you actually bring it into your collection." },
      { tag: "fix", text: "Collapsed compilations and Family cards now sort and filter with the rest of the board instead of sticking to the first slots — A–Z files them by their title, and the other sorts place them where their best-fitting game would appear." },
    ],
  },
  {
    id: "2026-07-03-reviews-and-banner-matcher",
    date: "2026-07-03",
    title: "Leave a review — and match your colors to your banner",
    items: [
      { tag: "feature", text: "Every game page now has a Review tab: write up your thoughts, document the journey, and rate the game from half a star to five. Your score shows at a glance on the page and on finished cards, and visitors can read your take." },
      { tag: "feature", text: "The profile Colors panel can now match your banner: tap one of the suggested colors pulled from the image, or click anywhere on the banner to sample that exact spot for your background or accent." },
      { tag: "improvement", text: "Moderators can upload a cover image for compilation cards straight from their device — no more hunting for a URL." },
    ],
  },
  {
    id: "2026-07-03-profile-colors",
    date: "2026-07-03",
    title: "Make your profile yours: custom colors with live preview",
    items: [
      { tag: "feature", text: "Pick a background and accent color for your profile page — match them to your banner or go full custom with a color picker and hex codes. Everyone who visits sees your page in your colors." },
      { tag: "feature", text: "A live preview shows your colors on a mock header, buttons and a mini backlog bar before you save, and preset palettes (all twelve app themes) fill in a matched pair with one pick." },
      { tag: "improvement", text: "Whatever background you choose, the page re-tints its panels and text automatically so everything stays readable — no unreadable combos." },
    ],
  },
  {
    id: "2026-07-03-profile-and-polish",
    date: "2026-07-03",
    title: "Profile glow-up: platform shelves, a trophy feed & bigger banners",
    items: [
      { tag: "feature", text: "Your profile now breaks your library down by platform: one bar per platform showing what's in the Bazaar, playing, beaten, completed or endless — with a 100% cleared stamp once a shelf holds only finished games." },
      { tag: "feature", text: "A new Recent Activity feed celebrates your latest clears, newest first — gold cards for 100% Completed runs, silver for standard Beaten — with cover, platform, clear date and playtime on every entry." },
      { tag: "feature", text: "Profile banners got bigger and smarter: uploads up to 10 MB at double the resolution, and a new crop tool lets you drag, zoom and pinch to frame exactly the slice you want." },
      { tag: "improvement", text: "Moderators can now set cover art for a compilation's collapsed card. It fills in wherever an owner hasn't chosen their own cover — your personal covers always win, and the games inside keep theirs." },
      { tag: "fix", text: "On phones, the undo popup no longer sits on top of the bottom navigation — and every popup now has a clear ✕ and can be swiped away sideways." },
      { tag: "improvement", text: "Platforms now look the same everywhere: the game cards' chip style is used across the Master Ledger, game pages, profile, Caravan and bundle cards — with formats still shown where your inventory details matter." },
      { tag: "fix", text: "Profile banners now display exactly what you framed in the crop tool — the profile header shows the full 3:1 frame instead of a zoomed-in slice, making banners noticeably taller too." },
      { tag: "improvement", text: "Visiting another player's Bazaar is cleaner: the big banner is gone, and everything it held moved into the navigation — who you're visiting (with their online status), their Profile, Message/Add friend, Report, and a Leave button at the bottom of the sidebar. Their pages get the whole screen." },
    ],
  },
  {
    id: "2026-07-03-added-date-pricing",
    date: "2026-07-03",
    title: "Backdate a game's Added date to set its true price",
    items: [
      { tag: "feature", text: "The Added milestone on a game's page now doubles as its acquisition date: edit it and the game's Fresh-pickup price follows. Imported an old purchase yesterday? Backdate its Added date and it prices like the long-held game it really is." },
      { tag: "improvement", text: "Recently-added ordering follows the edited date too, so a backdated game files into your Bazaar's timeline where it belongs." },
    ],
  },
  {
    id: "2026-07-03-fresh-pickups",
    date: "2026-07-03",
    title: "Fresh pickups: prices now follow YOUR timeline",
    items: [
      { tag: "feature", text: "A game's coin price now reflects how recently it joined your Bazaar, not when it was released: a fresh pickup carries a premium that fades the longer it waits, so your longest-shelved games become the cheapest buys. Clear the classics!" },
      { tag: "improvement", text: "Backlog prices shifted under the new formula — recently added games cost more, long-held ones less. Everything you've already spent or earned is untouched, and coin balances are exactly as they were." },
      { tag: "improvement", text: "Less clutter, less typing: genres, developers, Metacritic scores and release dates are gone from cards, pages, forms, filters and stats. Adding a game is now just the title, your copies, and how long it takes." },
    ],
  },
  {
    id: "2026-07-03-game-pages",
    date: "2026-07-03",
    title: "Every game gets its own page",
    items: [
      { tag: "feature", text: "Clicking a game now opens a full page instead of a pop-up — a proper home with the artwork up top and three calm tabs: Overview (screenshots, details, your cover), Journey (play time, milestones, story order) and Library (the copies you own). Built with room to grow as games gain more to show." },
      { tag: "feature", text: "Game pages have real links you can bookmark and share, the browser Back button returns you to your board right where you left it, and search results jump straight to the game's page." },
      { tag: "improvement", text: "No more Save button on game details — every change saves the moment you make it, from a played-hours edit to a new copy. What you see is what's stored." },
      { tag: "improvement", text: "Buy & Start, the time logger, Mark Finished and the rest of a card's actions now sit right on the page too, so you can act without hopping back to the board." },
      { tag: "improvement", text: "Visiting a friend? Their games open on the same page, read-only — and it's linkable, so you can send someone straight to a game in your Bazaar." },
    ],
  },
  {
    id: "2026-07-03-game-milestones",
    date: "2026-07-03",
    title: "Game Milestones — your journey, dated",
    items: [
      { tag: "feature", text: "Every game now keeps a Milestones timeline in its details — the dates you added, started, beat, completed, retired, and un-retired it. New milestones record themselves automatically as you play." },
      { tag: "feature", text: "The dates are fully yours: backdate any milestone to when it really happened, add extra entries for replays or retire/unretire cycles, or remove ones you don't want. Perfect for bringing years of pre-Bazaar history into your library." },
      { tag: "feature", text: "Mark a game Retired even if it just sits in your Bazaar — and if you pick it up after all, starting it logs the comeback on its own." },
      { tag: "improvement", text: "Your existing library arrives pre-seeded: milestones were created from each game's recorded history, including finish dates that replays had overwritten." },
    ],
  },
  {
    id: "2026-07-03-family-cards-dlc-story-order",
    date: "2026-07-03",
    title: "One card per family, DLC copies & story order",
    items: [
      { tag: "feature", text: "Linked editions now fold into one focused Family card on the board of the edition that matters most — combined hours, spend and clears up top, the version you're playing fully expanded with its time logger and Mark Finished right on the card, and the other editions one tap behind \"View other editions\". Prefer the old separate cards? Split any family back apart from its Family hub." },
      { tag: "feature", text: "Dress up the family card: pick which edition's cover it wears, or upload your own — just like compilations." },
      { tag: "feature", text: "Record DLC as its own copy type alongside Physical and Digital: its cost counts in your spend totals and it shows a DLC tag wherever copies appear, but it never masquerades as owning another copy of the base game." },
      { tag: "feature", text: "Story order: lock a sequel behind another game in your library. It shows a Story-locked badge and can't be started until the prerequisite is Finished — and it unlocks by itself the moment that happens." },
    ],
  },
  {
    id: "2026-07-02-fresh-start-delete-account",
    date: "2026-07-02",
    title: "Your account, your call — and a hands-on welcome",
    items: [
      { tag: "feature", text: "New players now learn by playing: the old walkthrough is replaced by a Getting Started checklist — add a real game, start it with a real voucher, log your time and claim your first bounty, with the app highlighting each button as you go. It docks to a little progress pill and waits patiently across sessions until you finish." },
      { tag: "feature", text: "Fresh Start: wipe your collection and economy and begin again from day one — games, compilations, coins, charters, vouchers, slots and history all reset to a brand-new account, while your profile, friends, messages, badges and community posts stay put. Find it in Account settings, behind a typed confirmation so it can never happen by accident." },
      { tag: "feature", text: "Delete account: permanently remove your account and all of its data, right from Account settings, with the same typed confirmation. Your bug reports and comments stay on the community boards for other players — shown without your name." },
      { tag: "improvement", text: "Your free starter vouchers now arrive when the tutorial begins — so your very first game is on the house — instead of being held back until the tour ends." },
    ],
  },
  {
    id: "2026-07-02-family-discount-board-bundles",
    date: "2026-07-02",
    title: "Family Discounts, a fuller Now Playing & bundle upgrades",
    items: [
      { tag: "feature", text: "Family Discount: once any edition of a Game Family is Now Playing or Finished, its Bazaar siblings unlock at the same reduced percentage the Replay Bonus pays — the full fee shows crossed out on the card, and your Transaction Ledger records a Family Discount Activation. Unlink or remove the qualifying edition and the normal price simply returns." },
      { tag: "feature", text: "In Manage Game Family, click any other edition to jump straight to its card — no more hunting the boards for the version you meant." },
      { tag: "feature", text: "Collapsed compilations can wear their own cover: upload one from the Compilation Hub, or remove it to fall back to the first game's art." },
      { tag: "improvement", text: "The Now Playing board now packs your games into a responsive multi-column flow that fills wide screens — no more single column of cards with empty space beside it. Each card shows its own lane badge." },
      { tag: "improvement", text: "A compilation's release date now drives its games' coin prices: a recent collection of decades-old classics prices as the recent release you actually bought." },
      { tag: "improvement", text: "Owned games now show only the platforms you actually own them on — the Master Ledger and Game Hub no longer list every console a game ever launched on. (Discovery and search still show release platforms so you can identify the right game.)" },
    ],
  },
  {
    id: "2026-07-02-wishlist-aware-adding",
    date: "2026-07-02",
    title: "Wishlist-aware adding",
    items: [
      { tag: "improvement", text: "Adding a game you've wishlisted on a different platform now asks what to do with the Wishlist entry — keep it if you're still hunting that version, or remove it if the want is settled. Adding the exact version you wishlisted still clears the entry as before." },
    ],
  },
  {
    id: "2026-07-02-lanes-ledger-polish",
    date: "2026-07-02",
    title: "Drag between lanes, reversible Endless & a sharper Ledger",
    items: [
      { tag: "feature", text: "On desktop, drag a game's tile in the Now Playing slot meter onto another lane to move it — start or stop a 100% run, or send a live-service game into Rotation. While you drag, each lane shows whether the game can land there (and why not); only moves the workflow already allows will drop." },
      { tag: "feature", text: "Converting a finished game to Endless is now fully reversible: Remove from Rotation sends it straight back to Finished with the Beaten or Completed badge it already earned, and the weekly check-in switches off. Only your library changes — the shared catalog is never touched." },
      { tag: "improvement", text: "Removing a live-service game from Rotation now asks where it should go — park it back in the Bazaar or conclude it to Finished — instead of always sending it to the Bazaar." },
      { tag: "feature", text: "Finished games in the Master Ledger now wear their Beaten, Completed or Endless stamp, and the ledger stats break your clears down: how much of your library is finished, beaten and 100% completed, plus a count of your endless games." },
      { tag: "fix", text: "On short screens the sidebar no longer scrolls your main boards out of view — the boards stay pinned, the utility links scroll, and even a tiny window can always reach the whole menu." },
      { tag: "improvement", text: "Scrollbars across the whole app — including the main page — are now slim, rounded and theme-tinted instead of the chunky system ones." },
      { tag: "fix", text: "Cleaner wrapping: profile-tile status stamps stay on one line, and the “Beat games · Earn coins · Play more” tagline no longer splits mid-phrase." },
    ],
  },
  {
    id: "2026-07-02-multi-copy-compilations",
    date: "2026-07-02",
    title: "Compilations: every copy you own",
    items: [
      { tag: "feature", text: "Own a bundle on more than one platform? Compilations now record every copy — each with its own platform, format and price — and every copy's platform shows on each game inside." },
      { tag: "feature", text: "Each copy's price is split across the bundle's games to the cent, so per-game spend and your ledger totals reflect everything you've invested." },
      { tag: "feature", text: "Compilations can carry a release date — it fills in bundled games that don't have one, while games with a known date keep theirs." },
      { tag: "fix", text: "Deleting one of two linked editions no longer leaves the survivor showing a family icon for a family of one." },
    ],
  },
  {
    id: "2026-07-02-cleaner-card-chips",
    date: "2026-07-02",
    title: "Cleaner game cards",
    items: [
      { tag: "improvement", text: "The Family and compilation tags on game cards are now compact icons side by side — hover one to see the family or bundle's name." },
      { tag: "improvement", text: "The family icon is clickable: it opens Manage Game Family directly from the card (compilation icons already opened their bundle)." },
    ],
  },
  {
    id: "2026-07-02-ledger-profile-fixes",
    date: "2026-07-02",
    title: "Ledger & profile fixes",
    items: [
      { tag: "fix", text: "The Master Ledger now shows one card per game you own — a game owned in several bundles (or standalone and in a bundle) merges into a single card listing every version and your total spend." },
      { tag: "fix", text: "Friends' custom game covers now show on their profile page, matching their boards and ledger." },
    ],
  },
  {
    id: "2026-07-02-compilations-fold-up",
    date: "2026-07-02",
    title: "Compilations that fold up",
    items: [
      { tag: "feature", text: "Collapse any compilation into a single card that totals the bundle's money spent and hours played — it sits in the Bazaar until every game inside is finished, then moves to Finished on its own." },
      { tag: "feature", text: "Own a collection as one card (say, a trilogy remaster)? If it's linked in the catalog, expand it into its individual games — the cost splits evenly, your logged hours stay on the bundle, and any activation fee you paid comes back." },
      { tag: "feature", text: "Moderators can now link a compilation in the catalog to the game it's sold as, which is what lights up Expand on everyone's matching cards." },
      { tag: "improvement", text: "Adding a game the catalog knows is a compilation now mentions you'll be able to split it into its games afterwards." },
    ],
  },
  {
    id: "2026-07-02-smarter-adding",
    date: "2026-07-02",
    title: "Smarter adding & multi-platform wishlists",
    items: [
      { tag: "feature", text: "Adding a game you already own now attaches the new copy to your existing card — with a confirmation first — instead of doing nothing silently." },
      { tag: "feature", text: "Wishlist a game you own on another platform: the card highlights exactly which version you're hunting, and importing it with a Charter merges onto your existing card instead of duplicating it." },
      { tag: "feature", text: "Record hours played per platform right when you add a game — one field per copy, just like the editor on your cards." },
      { tag: "improvement", text: "Recognized games now lock their release date to the catalog, and when HowLongToBeat has times the playstyle picker sets the length for you." },
      { tag: "improvement", text: "Adding a game that's on your Wishlist warns you first — going ahead skips the Import Charter and clears the Wishlist entry." },
      { tag: "improvement", text: "You can't accidentally add a duplicate copy anywhere — the form blocks a platform you already own (in the same or an unspecified format) as you type, on every board." },
      { tag: "improvement", text: "Search results now say exactly where you already have a game — on your Wishlist, in your Bazaar, in Now Playing, or in your Finished." },
    ],
  },
  {
    id: "2026-07-02-stamped-ledger",
    date: "2026-07-02",
    title: "A fresh coat of ink: the Stamped Ledger redesign",
    items: [
      { tag: "feature", text: "Backlog Bazaar has a new look — paper, ink, and rubber-stamp details inspired by the trading ledger at the heart of the game, with new typography to match." },
      { tag: "feature", text: "Two new themes lead the collection: Ledger (paper & ink) and Midnight Ledger (the same identity after dark). If you've picked a theme it's untouched, and every classic theme is still there." },
      { tag: "improvement", text: "Game cards, buttons, badges, and menus got a tactile refresh — inked borders, stamped shadows, and ledger-style numbers — in every theme." },
      { tag: "improvement", text: "Importing a Wishlist game is now properly satisfying: the game's ticket gets slammed with a dated IMPORTED seal — confetti and all." },
      { tag: "improvement", text: "The sign-in page is now a proper storefront: it pitches the coin loop with real numbers and writes a live sample ledger, so new players see the game before they join." },
      { tag: "feature", text: "Forgot your password? Request a reset link from the sign-in page and set a new one when you follow it back." },
      { tag: "improvement", text: "The coin got a fresh minting: a new engraved slab-serif face with a reeded edge, now the default coin and browser-tab icon." },
    ],
  },
  {
    id: "2026-06-30-profile-hub",
    date: "2026-06-30",
    title: "Your Profile Hub",
    items: [
      { tag: "feature", text: "Every player now has a Profile Hub — a public identity page with your banner, avatar, bio and an at-a-glance dashboard of what you're playing, your backlog, and your finished games." },
      { tag: "feature", text: "Make it yours: upload a banner, write an “About Me”, and pick an accent color (a curated swatch or your own) that themes your profile." },
      { tag: "improvement", text: "Your privacy still applies everywhere: custom cover art you've uploaded stays hidden from non-friends on profiles too." },
    ],
  },
  {
    id: "2026-06-29-unified-compilation-cards",
    date: "2026-06-29",
    title: "One card when you own a game twice",
    items: [
      { tag: "improvement", text: "Own a game both on its own and inside a compilation? It now shows as a single card instead of two — with both ownership tags stacked (e.g. your platform plus “Part of …”) and one Buy & Start price." },
      { tag: "improvement", text: "Opening that game shows all your copies together: your standalone copy stays editable, and the compilation copy appears below it as a locked entry managed by the bundle." },
      { tag: "fix", text: "A game you own both standalone and in compilations now tracks time the same way as any other multi-platform game: one “Played by platform” breakdown covering every platform you own it on — no more separate boxes per copy." },
      { tag: "fix", text: "When such a game is Now Playing, the “Played on” picker now lists every platform you own it on (including ones you only own through a bundle), so logged time lands on the right platform." },
      { tag: "fix", text: "Owning the same compilation on more than one platform no longer shows duplicate “Part of …” tags on the card — the collection appears once, with each platform listed in its own tag." },
      { tag: "fix", text: "A game you own only through compilations — across multiple bundles or the same bundle on different platforms — now shows as a single card too, with each bundle and platform listed, instead of one card per copy." },
    ],
  },
  {
    id: "2026-06-29-missing-platform-on-copies",
    date: "2026-06-29",
    title: "Add a copy on any platform",
    items: [
      { tag: "feature", text: "The “Missing platform?” option is now in a game you already own too — open a game, add a copy, and tap “Missing platform?” to pick from every platform. Your copy is saved right away and we quietly send a request to add that platform to the game for everyone." },
    ],
  },
  {
    id: "2026-06-29-simpler-time-tracking",
    date: "2026-06-29",
    title: "Simpler time tracking",
    items: [
      { tag: "improvement", text: "Logging play time is simpler — by default you just pick the platform you played on, so a game you own both physically and digitally no longer clutters the picker with two near-identical entries." },
      { tag: "feature", text: "Power users can switch on “Enable edition-level time tracking” in Account settings to log time against each specific copy you own. Your total hours stay the same either way." },
      { tag: "fix", text: "Adding a game that shares its name with another now shows both, oldest first — so reboots and remakes are easy to tell apart." },
      { tag: "fix", text: "Time you’ve already played, entered while adding a game, now shows up correctly when you open the game — and editing it adjusts your total instead of stacking on top of it." },
    ],
  },
  {
    id: "2026-06-29-adding-quality-of-life",
    date: "2026-06-29",
    title: "Smoother adding — games & requests",
    items: [
      { tag: "feature", text: "Own a game on a platform that isn’t in its list? Tap “Missing platform?” when adding it to pick from every platform — the game is added to your library right away and we quietly send a request to add that platform to the game for everyone." },
      { tag: "feature", text: "Adding a game now always offers “Don’t see your specific game? Request a new addition.” at the bottom of the search results — so reboots, remakes and same-named games are never blocked just because the title matches something else." },
      { tag: "fix", text: "Creating a feature request or bug report no longer hides the Submit button or the list of existing requests on larger screens — the form scrolls neatly and you can browse other issues while you write." },
    ],
  },
  {
    id: "2026-06-29-safer-covers-reporting",
    date: "2026-06-29",
    title: "Safer covers & community reporting",
    items: [
      { tag: "feature", text: "Custom cover art you upload is now shown only to you and your friends — everyone else sees the standard catalog cover, so unmoderated images stay private." },
      { tag: "feature", text: "New privacy setting: “Always show default game covers” hides other players’ custom covers everywhere you browse." },
      { tag: "feature", text: "Report a player from their profile, or flag a custom cover, to send it straight to our moderators. Reports are anonymous." },
    ],
  },
  {
    id: "2026-06-29-undo-finish",
    date: "2026-06-29",
    title: "Undo an accidental finish",
    items: [
      { tag: "feature", text: "Marked a game finished by mistake? Tap Undo on the confirmation toast (about 15 seconds) to put it back exactly where it was — coins and all." },
      { tag: "feature", text: "The same Undo covers retiring a Rotation game and converting a finished game to Endless." },
      { tag: "improvement", text: "The Mark Finished button now shows the coin reward right on it, with the details in a tooltip — less clutter on each Now Playing card." },
    ],
  },
  {
    id: "2026-06-29-message-reactions-replies",
    date: "2026-06-29",
    title: "React, reply, and share images in messages",
    items: [
      { tag: "feature", text: "React to a message you received with 👍 ❤️ 🎉 😄 — hover (or tap) it and pick an emoji." },
      { tag: "feature", text: "Quote a message in your reply, so it's clear what you're responding to." },
      { tag: "feature", text: "Send images in messages — paste a screenshot or attach image files." },
    ],
  },
  {
    id: "2026-06-29-message-recommendations",
    date: "2026-06-29",
    title: "Friendlier messaging: recommend games & quicker replies",
    items: [
      { tag: "feature", text: "When a friend shares a game in a message, add it straight to your Wishlist with one tap — a recommendation lands where you'll find it later. (Games already in your library don't show the button.)" },
      { tag: "improvement", text: "Press Enter to send a message; Shift+Enter starts a new line." },
    ],
  },
  {
    id: "2026-06-29-unified-inbox",
    date: "2026-06-29",
    title: "One tabbed inbox for alerts, messages & friends",
    items: [
      { tag: "improvement", text: "Notifications, messages, and friends now open in one tabbed inbox (Alerts · Messages · Friends), so it's easy to jump between them." },
      { tag: "improvement", text: "Tidier phone header: those three become a single Inbox button so the title isn't crowded, and the toolbar icons are all the same size. On desktop they stay as three separate buttons." },
    ],
  },
  {
    id: "2026-06-29-friends-feed-messaging",
    date: "2026-06-29",
    title: "Friends, an activity feed & direct messages",
    items: [
      { tag: "feature", text: "Add friends: search players by name, send and manage requests, and see your friends with their coins and what they're currently playing." },
      { tag: "feature", text: "A new activity feed shows your friends' milestones — games imported from the Wishlist, new Game Families, and games finished — and you can Cheer them on." },
      { tag: "feature", text: "Message your friends: a chat-style inbox with conversations, replies, edit-your-last-message, and delete. Removing a chat just tucks it away — the history comes back if you talk again." },
      { tag: "feature", text: "Share a game in a message: type @ to attach one of your games as a card your friend can preview or add." },
      { tag: "feature", text: "New privacy controls: make your profile private, hide your coin milestones from the feed, or appear offline." },
    ],
  },
  {
    id: "2026-06-29-contributions-sorting-finish-tags",
    date: "2026-06-29",
    title: "Withdraw contributions, remembered sorting & finish tags on add",
    items: [
      { tag: "feature", text: "Made a mistake in a suggested edit? You can now withdraw a pending contribution from your My contributions page instead of waiting for it to be reviewed." },
      { tag: "feature", text: "Your Bazaar sort order (A–Z, newest, and the rest) is now remembered — refresh the page and it stays put." },
      { tag: "feature", text: "Adding a game straight to Finished now lets you tag how it ended — Beaten, Completed, or Endless — so your Finished board is organized from the start." },
      { tag: "fix", text: "Editing a game’s live-service status now actually takes effect, including on games already sitting in your Bazaar." },
    ],
  },
  {
    id: "2026-06-28-clean-catalog-data",
    date: "2026-06-28",
    title: "Cleaner platforms, genres & a tidy Master Ledger",
    items: [
      { tag: "improvement", text: "Platforms and genres are now picked from curated lists instead of free text, so your library and the catalog stay consistent (no more “PS5” vs “PlayStation 5” mismatches)." },
      { tag: "improvement", text: "Adding a game you own now asks which platform you own it on, so your collection always knows where each game lives. For a compilation, the platform you pick applies to every game in the bundle." },
      { tag: "improvement", text: "The Master Ledger now shows clean, uniform cards — developer, release, length, hours played, genre, platforms, ownership and spend at a glance. Tap any card to open its full hub." },
    ],
  },
  {
    id: "2026-06-28-overdraft-guard",
    date: "2026-06-28",
    title: "Soft-lock protection",
    items: [
      { tag: "improvement", text: "Buying an Import Charter is now blocked when it would leave you unable to afford the cheapest game in your Bazaar with nothing in play — so an optional purchase can't strand your progress. Finish or shelve a game to free things up." },
    ],
  },
  {
    id: "2026-06-28-compilation-template-sync",
    date: "2026-06-28",
    title: "Shared compilations stay up to date",
    items: [
      { tag: "fix", text: "When a game's details are corrected, every shared compilation that includes it now updates automatically — so anyone who adds that compilation gets the latest info, no need to delete and re-create it." },
    ],
  },
  {
    id: "2026-06-28-post-game-routing",
    date: "2026-06-28",
    title: "Post-game routing & Finished status tags",
    items: [
      { tag: "feature", text: "Finish a game and a quick prompt lets you choose its next life: leave it Finished, Grind to 100% (Completionist), or Convert to Endless (Rotation)." },
      { tag: "feature", text: "Every Finished game now shows a status tag — Beaten, Completed, or Endless — auto-set by how it concluded, and changeable anytime from the game's card." },
      { tag: "feature", text: "Abandon a 100% run to send a game back to Finished (kept as Beaten) with no penalty, and retire an ongoing game from Rotation straight to Finished." },
      { tag: "improvement", text: "All four Now Playing lanes are now the same size (2 slots each) for a clean, symmetric board." },
    ],
  },
  {
    id: "2026-06-28-now-playing-lanes",
    date: "2026-06-28",
    title: "Four Now Playing lanes",
    items: [
      { tag: "feature", text: "Now Playing is now four lanes — Focus, Replay, Completionist, and Rotation — each with its own slots, so a backlog grind, a replay, a 100% run, and your forever-games never crowd each other out." },
      { tag: "feature", text: "Going for 100%? Put a game in the new Completionist lane — start it there, flip a game you're already playing in, or pull a finished game back — and earn a Completion Bonus when you complete it." },
      { tag: "improvement", text: "Replaying a finished game now has its own lane with its own capacity, instead of needing a special slot." },
      { tag: "improvement", text: "The old length/genre 'targeted slots' are gone — every game you're playing simply lives in one of the four lanes." },
    ],
  },
  {
    id: "2026-06-27-rotation-lane",
    date: "2026-06-27",
    title: "Live-service games & the Rotation lane",
    items: [
      { tag: "feature", text: "Mark a game as live-service / ongoing (Fortnite, Destiny 2, League of Legends, Genshin Impact, …) when you add it. These are added free — no buy price, no estimated length, no finish bounty." },
      { tag: "feature", text: "Play ongoing games from the Rotation lane: add one for free, check in once a week for coins, and remove it anytime. They never take up a focus slot." },
      { tag: "feature", text: "Now Playing shows two lanes — Focus for the backlog you're finishing, and Rotation for your forever-games — with the weekly reset time shown right there." },
      { tag: "improvement", text: "You can suggest the live-service flag on any catalog game, so well-known ongoing games get recognized for everyone." },
      { tag: "improvement", text: "The Now Playing board now groups your games into Focus and Rotation sections — and you'll see the same split when visiting another player's Bazaar." },
      { tag: "improvement", text: "Click a game in the Now Playing slot summary to jump straight to its card, or a lane heading to jump to that section." },
    ],
  },
  {
    id: "2026-06-27-focused-cards",
    date: "2026-06-27",
    title: "Cleaner game cards",
    items: [
      { tag: "improvement", text: "Game cards now show just the cover, title, and the platforms you own each game on — clean and easy to scan." },
      { tag: "improvement", text: "Release date, length, genre, developer and Metacritic score moved into the game's detail view, a click away." },
      { tag: "improvement", text: "Own a game in physical and digital on the same platform? Its platform tag now shows once instead of twice." },
    ],
  },
  {
    id: "2026-06-27-slots-search-add",
    date: "2026-06-27",
    title: "Move games between slots, resume finished games, and more",
    items: [
      { tag: "feature", text: "Move a Now Playing game between slots anytime — including out of an Endless slot, so a game is never stuck where it landed." },
      { tag: "feature", text: "Keep playing a finished game by resuming it into an Endless slot — free, like a replay (finishing again pays the smaller Replay Bonus)." },
      { tag: "improvement", text: "The header search now works on the Master Ledger too." },
      { tag: "improvement", text: "Adding is simpler: one Add button with a quick choice of a game or a compilation." },
      { tag: "improvement", text: "Pick a shared compilation once, then choose your own platform — the same compilation no longer shows up once per platform." },
    ],
  },
  {
    id: "2026-06-27-detail-compilation-polish",
    date: "2026-06-27",
    title: "Cover art on visits, tidier copies, compilation lengths",
    items: [
      { tag: "improvement", text: "Opening a game while visiting another player now shows its full-size cover art." },
      { tag: "improvement", text: "The “Copies you own” list now starts collapsed — even with a single copy — so the game detail stays compact." },
      { tag: "feature", text: "Set each game’s length by completion level (Main / +Extras / 100%) when adding or editing a compilation — and the options now appear right away when you start from a shared compilation, no re-searching needed." },
    ],
  },
  {
    id: "2026-06-27-universal-search",
    date: "2026-06-27",
    title: "Search your whole library — and your friends'",
    items: [
      { tag: "feature", text: "A new search bar in the header finds any game instantly by title, platform, or franchise — no more scrolling boards." },
      { tag: "feature", text: "As you type, the current board filters to matching games; press Enter to see every match across Wishlist, Bazaar, Now Playing and Finished at once." },
      { tag: "feature", text: "Visiting a friend? The same search scopes to their library so you can see what they own or have finished." },
      { tag: "feature", text: "Mark any game private to hide it from visitors — it still counts toward your own boards, stats and coins." },
      { tag: "improvement", text: "Searched for something you don't own yet? Jump straight from the results to adding it." },
    ],
  },
  {
    id: "2026-06-26-compilation-blank-platform-crash",
    date: "2026-06-26",
    title: "Fixed a blank screen after saving a compilation",
    items: [
      { tag: "fix", text: "Saving a compilation without a platform no longer causes a blank screen — affected accounts load normally again." },
    ],
  },
  {
    id: "2026-06-26-compilation-search-fresh-data",
    date: "2026-06-26",
    title: "Compilation game search uses up-to-date details",
    items: [
      { tag: "fix", text: "Searching for a game while building a compilation now shows its latest approved cover, title and length — matching the regular Add a game search instead of stale data." },
    ],
  },
  {
    id: "2026-06-25-replay-slot-polish",
    date: "2026-06-25",
    title: "Replay slots: clearer rewards and an easy way out",
    items: [
      { tag: "fix", text: "A game replayed in a Replay slot now correctly shows the smaller Replay Bonus it will pay — not the full first-clear bounty." },
      { tag: "feature", text: "Added “Abort replay” to send a replayed game straight back to Finished without claiming a bounty." },
      { tag: "improvement", text: "Replayed games no longer show “Shelve it” (it never applied to an already-owned game)." },
      { tag: "improvement", text: "Buying a game now always lets you choose when an Endless slot is involved, so a purchase never silently lands in your Endless slot." },
    ],
  },
  {
    id: "2026-06-25-community-edit-fix",
    date: "2026-06-25",
    title: "Community game edits apply reliably",
    items: [
      { tag: "fix", text: "Approved edits to community-added games now update every copy of the game — and editing one no longer creates duplicate listings in search." },
      { tag: "fix", text: "Cleaned up the duplicate community entries that earlier edits had created." },
    ],
  },
  {
    id: "2026-06-25-slot-picker-criteria",
    date: "2026-06-25",
    title: "Choose where a game starts + smarter slot rules",
    items: [
      { tag: "feature", text: "When you start a game that fits more than one open slot, you now pick where it lands — a general slot, a matching slot like “Quick Play”, or an ongoing Endless slot — with a smart default already selected." },
      { tag: "improvement", text: "Now Playing slots can target games by era, genre, platform and Metacritic score (not just length), so a slot like “Classic RPG” or “Handheld” shows exactly what it accepts." },
    ],
  },
  {
    id: "2026-06-25-slot-categories",
    date: "2026-06-25",
    title: "New Now Playing slot types: Endless & Replay",
    items: [
      { tag: "feature", text: "Endless slots hold an ongoing or live-service game without tying up a general slot — park one there when you buy it, or move an in-progress game in from its card." },
      { tag: "feature", text: "Replay slots let you pull a Finished game back into Now Playing for free; finishing it again pays the smaller Replay Bonus." },
      { tag: "improvement", text: "The Now Playing board now shows each slot as its own card — what it accepts and which game is in it — and every playing card shows the slot it occupies." },
    ],
  },
  {
    id: "2026-06-25-screenshots-compilation-status",
    date: "2026-06-25",
    title: "Game screenshots & finer compilation control",
    items: [
      { tag: "feature", text: "Games can now show a flip-through gallery of screenshots, so you can preview a game before adding it — and see it again from the Edit Game window." },
      { tag: "feature", text: "Add screenshots to a game through Suggest Edit; like other catalog changes, a moderator reviews them before they go live for everyone." },
      { tag: "improvement", text: "Mark each game in a compilation as Bazaar or Finished individually — when adding it, while editing the compilation, or later from a game's menu — handy when you've already beaten some of them." },
      { tag: "improvement", text: "Editing a game shows the cover in a wider frame, so less of the artwork is cropped." },
    ],
  },
  {
    id: "2026-06-25-edit-game-polish",
    date: "2026-06-25",
    title: "A roomier game editor",
    items: [
      { tag: "improvement", text: "Your cover art now sits large at the top of the game window — easy to admire, and easy to see while you swap it." },
      { tag: "improvement", text: "Suggesting a game's platforms or genres? Paste a whole comma-separated list at once (e.g. “PS5, Xbox Series X/S, PC”) instead of adding them one at a time." },
      { tag: "improvement", text: "The “Copies you own” list now tucks away when you have several, keeping the editor compact." },
    ],
  },
  {
    id: "2026-06-25-game-compilations",
    date: "2026-06-25",
    title: "Add game compilations",
    items: [
      { tag: "feature", text: "“Add compilation” lets you log a bundle or collection — like Super Mario 3D All-Stars — as one purchase: set the title, total price, platform and format once." },
      { tag: "feature", text: "Every game inside gets its own card on your board, so you can buy, play and finish each one on its own." },
      { tag: "feature", text: "Search each game as you add it to pull in its length and cover art automatically." },
      { tag: "feature", text: "The total price is split across the games for you — evenly, by length, or however you choose." },
      { tag: "feature", text: "Each card opens a Compilation Hub showing the total spent, hours played, and a checklist of every game with its status — and you can edit the compilation any time from there." },
      { tag: "feature", text: "Share a compilation you built so others can add it in one tap — once it's approved it autocompletes for everyone, and your contributions earn coins." },
    ],
  },
  {
    id: "2026-06-24-onboarding-vouchers",
    date: "2026-06-24",
    title: "Free Game Vouchers for new players",
    items: [
      { tag: "feature", text: "New players get a quick guided tour of the core loop and the main sections, then receive two Free Game Vouchers in their wallet to finish." },
      { tag: "feature", text: "Each voucher starts a game from your Bazaar straight into Now Playing for free, so you can jump into games you're already playing without saving up coins." },
      { tag: "feature", text: "When you start a game, a new activation pop-up lets you pay with coins or tap “Use voucher”." },
      { tag: "feature", text: "Your voucher balance shows as a ticket in the header and on a game's details while you still have some." },
      { tag: "improvement", text: "Voucher redemptions appear in your transaction ledger (at zero coins), with their own filter." },
    ],
  },
  {
    id: "2026-06-24-issue-effort",
    date: "2026-06-24",
    title: "Size up requests by effort",
    items: [
      { tag: "feature", text: "Tag a feature or bug as Low, Medium or High effort — a quick size estimate alongside its priority." },
      { tag: "feature", text: "Sort the board by “Quick wins” to surface the lowest-effort items first." },
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
      "Each card shows a color-coded status badge so you can see where every game sits at a glance.",
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

/** Format a release's ISO date (YYYY-MM-DD) for display. A date-only string is
 *  parsed as a LOCAL calendar date: `new Date("2026-06-29")` is UTC midnight,
 *  which `toLocaleDateString` then renders as the day before in any time zone
 *  behind UTC — so we split it into local components instead. Other forms fall
 *  back to the platform parser; an unparseable value is returned unchanged. */
export function formatReleaseDate(iso: string, locale?: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
}

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
