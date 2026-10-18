// Backlog Bazaar release notes: the "What's new" page.
//
// HOW TO WRITE A RELEASE (owner rules, 2026-10-17; changelog.test.ts checks
// the mechanical ones):
// - One release per FEATURE or theme, not per date or commit. Follow-up fixes
//   to a feature fold into its release. A busy day can have several releases.
// - High bar: big user-facing features and changes most players would want to
//   know about. Skip edge-case fixes, internal mechanics, tiny polish, admin
//   tools and anything only moderators see. When unsure, leave it out.
// - Title: names the thing, 8 words or fewer.
// - Summary: one plain sentence on why a player cares, 24 words or fewer.
// - Items: 0 to 4 bullets, 15 words or fewer each. Plain words, no em dashes,
//   no jargon, American spelling.
// - Tag: exactly one per release (feature, improvement or fix).
// - Link: optional "Try it" button to the page where the feature lives. Only
//   pages every player can open, and only for features that still exist.
// - Newest first. `id` is `${date}-short-slug`, unique; a new top entry
//   re-lights the "What's new" dot for everyone.

import type { View } from "../components/Sidebar";

/** One tag per release. Add a kind here and in ReleaseNotes' TAG_META. */
export type ReleaseTag = "feature" | "improvement" | "fix";

export interface Release {
  /** Stable, unique `${date}-slug`. Also the "seen" marker. */
  id: string;
  /** ISO date the release went out, e.g. "2026-06-21". */
  date: string;
  title: string;
  /** One sentence: why a player cares. */
  summary: string;
  tag: ReleaseTag;
  /** Up to four short bullets. */
  items?: string[];
  /** A "Try it" button to where the feature lives. */
  link?: { label: string; view: View };
}

/** Newest first. RELEASES[0] is the current/latest release. */
export const RELEASES: Release[] = [
  // ── October 2026 ──────────────────────────────────────────────────────────
  {
    id: "2026-10-18-dlc",
    date: "2026-10-18",
    title: "Track your DLC and expansions",
    summary: "Record DLC on any game, and play story expansions for coins of their own.",
    tag: "feature",
    items: [
      "Add DLC from a game's Library tab: expansions, updates or items.",
      "Each story expansion gets its own Bazaar card, then plays in a DLC lane.",
      "DLC spending counts toward the game's total, and old DLC copies move over.",
      "Search finds a game by the names of its DLC.",
    ],
  },
  {
    id: "2026-10-18-demos",
    date: "2026-10-18",
    title: "Track the demos you play",
    summary: "Trying a demo? Log your time on it, then keep those hours when you get the full game.",
    tag: "feature",
    items: [
      "Tick I'm playing the demo when you add a game to your Wishlist.",
      "Demos sit in their own row on Now Playing.",
      "Demo time earns no coins and doesn't count toward goals.",
      "Get the full game and your demo hours come along.",
    ],
    link: { label: "Open Now Playing", view: "playing" },
  },
  {
    id: "2026-10-18-drop-in-sessions",
    date: "2026-10-18",
    title: "Log time on finished games",
    summary: "Went back to a game you already finished? Log the session without moving the game.",
    tag: "feature",
    items: [
      "Tap Log a session on any Finished or Retired card.",
      "Add an optional note, like the event you played.",
      "Drop-in time counts toward your goals and the Daily Session bonus.",
      "Friends see when you drop back into a game.",
    ],
  },
  {
    id: "2026-10-18-board-questions",
    date: "2026-10-18",
    title: "Ask questions on the board",
    summary: "Not sure it's a feature yet? Ask a question or start a brainstorm and talk it through first.",
    tag: "feature",
    items: [
      "Pick Question when you add something to Requests & bugs.",
      "Questions get their own filter, separate from features and bugs.",
      "Once an idea is settled, it can become a feature to build.",
    ],
  },
  {
    id: "2026-10-17-preorder-rewards",
    date: "2026-10-17",
    title: "Pre-orders pay off",
    summary: "Track your pre-orders and earn 50 coins plus new medals when they arrive.",
    tag: "feature",
    items: [
      "Mark a pre-order at least 7 days before it arrives to earn the bonus.",
      "Each game pays once, up to 5 a month.",
      "New Pre-order medals for 1, 5 and 15 arrivals, plus a secret one.",
    ],
  },
  {
    id: "2026-10-17-rotation-players",
    date: "2026-10-17",
    title: "Rotation play pays off",
    summary: "Live-service games like Hearthstone now earn coins, goals and recaps, and never cost you a streak.",
    tag: "feature",
    items: [
      "Rotation games pay 25 coins every 5 hours you play, and coin events boost them.",
      "A Regular streak pays more each week you keep playing Rotation games.",
      "Log time or use the stopwatch on Rotation cards, which checks you in too.",
      "New Rotation goals, and live-service adds never break your Clear Streak.",
    ],
    link: { label: "Open Now Playing", view: "playing" },
  },
  {
    id: "2026-10-17-event-calendar",
    date: "2026-10-17",
    title: "An event calendar and a monthly rhythm",
    summary: "Coin events now follow a set monthly pattern, and a new Calendar shows what's coming.",
    tag: "feature",
    items: [
      "Fresh Start Week: 25% off your first two starts, the 1st to 7th.",
      "Bounty Weekend: bigger finish bounties on the 3rd weekend.",
      "Collector's Week: boosted goal and medal rewards in the month's last 7 days.",
      "The Calendar adds goal resets, holidays, your pre-orders and renewals.",
    ],
    link: { label: "Open the Calendar", view: "calendar" },
  },
  {
    id: "2026-10-17-coin-events",
    date: "2026-10-17",
    title: "Coin events",
    summary: "Limited-time events boost what you earn, like double bounty weekends and half-price starts.",
    tag: "feature",
    items: [
      "A banner and a header chip show what's on and how long it lasts.",
      "Cards mark discounted starts and boosted bounties while an event runs.",
      "Claim buttons show boosted goal and medal rewards.",
      "You'll get a notification when an event that fits your games is coming.",
    ],
    link: { label: "See what's on", view: "backlog" },
  },
  {
    id: "2026-10-17-challenges",
    date: "2026-10-17",
    title: "Challenges: daily, weekly and monthly goals",
    summary: "Fresh goals every day, week and month give you bonus coins for playing your way.",
    tag: "feature",
    items: [
      "Pick three monthly goals: 25 coins each, plus 50 for all three.",
      "A daily goal pays 10 coins, and three weekly goals pay 25 each.",
      "Don't like a daily or weekly goal? Swap it once.",
      "Seasonal challenges run for a limited time and can award a badge.",
    ],
    link: { label: "Open Challenges", view: "challenges" },
  },
  {
    id: "2026-10-17-wax-seal-medals",
    date: "2026-10-17",
    title: "Medals become wax seals, and pay coins",
    summary: "Every medal is now a wax seal with its own crest, and every medal pays coins.",
    tag: "feature",
    items: [
      "11 new medal families, plus a few secret medals to find.",
      "Claim 10, 25 or 50 coins per medal on the Achievements page.",
      "Your achievement score shows on your profile.",
    ],
    link: { label: "Open Achievements", view: "achievements" },
  },
  {
    id: "2026-10-17-weekly-recap",
    date: "2026-10-17",
    title: "Your week in review",
    summary: "Once a week, a recap shows what you played, finished and earned.",
    tag: "feature",
    items: [
      "See your hours, clears, coins and the medals you're close to.",
      "Reopen it any time from its notification.",
      "Weekly resets now happen Monday at midnight Eastern.",
    ],
  },
  {
    id: "2026-10-17-help-me-choose",
    date: "2026-10-17",
    title: "Help me choose what to play",
    summary: "Answer four quick questions in Mystery Pull and get three games you can start now.",
    tag: "feature",
    items: [
      "Pick a length, a platform, a mood and what you're after.",
      "Each suggestion says why it fits.",
    ],
    link: { label: "Open your Bazaar", view: "backlog" },
  },
  {
    id: "2026-10-17-dressing-room",
    date: "2026-10-17",
    title: "My Cosmetics is a dressing room",
    summary: "Tap anything you own to wear it, with your whole look always in view.",
    tag: "improvement",
    items: ["Undo puts your last outfit back.", "Saved looks switch your whole outfit in one tap."],
    link: { label: "Open My Cosmetics", view: "cosmetics" },
  },
  {
    id: "2026-10-17-bounties-follow-time",
    date: "2026-10-17",
    title: "Bounties follow the time you log",
    summary: "Finish with little time logged and you get your start coins back now, the rest as you log.",
    tag: "improvement",
    items: [
      "The full bounty unlocks once you've logged a quarter of the game's length.",
      "Mark Finished offers to log your time first.",
      "Clears with enough time logged are marked Verified.",
      "Filter Finished by Verified clears, or hide retired games.",
    ],
  },
  {
    id: "2026-10-16-compilations",
    date: "2026-10-16",
    title: "Compilations stay together",
    summary: "A compilation is now one card and one page, just like any other game.",
    tag: "feature",
    items: [
      "Tap Play a Game to pick which game in it to start.",
      "Its page has its own cover, review, likes and community stats.",
      "Library search shows each compilation once and names the matching game.",
      "Add your own cover and screenshots for the games inside.",
    ],
  },
  {
    id: "2026-10-15-bonus-coins",
    date: "2026-10-15",
    title: "Bonus coins for going the extra mile",
    summary: "Earn extra coins for playing in story order, keeping records, reviewing and playing daily.",
    tag: "feature",
    items: [
      "Story Order: finish a story-locked sequel after its prequel.",
      "Collector's Record: note what you paid, or how you play it.",
      "Reviewer: review a game you cleared in 100 or more characters.",
      "Daily Session: 5 coins for each play log, up to 3 a day.",
    ],
  },
  // ── September 2026 ────────────────────────────────────────────────────────
  {
    id: "2026-09-16-gentler-economy",
    date: "2026-09-16",
    title: "A gentler economy",
    summary: "Import Charters are gone, and changing your mind about a game costs nothing.",
    tag: "improvement",
    items: [
      "Moving a game from your Wishlist to your Bazaar is free.",
      "Shelve It and Retire It refund everything you paid.",
      "Set your own Focus, Replay and Completionist lane sizes.",
    ],
    link: { label: "Lane sizes in Account", view: "account" },
  },
  {
    id: "2026-09-08-curio-shop-grand-opening",
    date: "2026-09-08",
    title: "The Curio Shop's grand opening",
    summary: "A fresh shop of titles, frames, stalls and coin skins to spend your coins on.",
    tag: "feature",
    items: [
      "Collect a full set to unlock an exclusive title.",
      "New Cloudbound collection and six new coin skins.",
      "Preview a look before you buy, then wear it from My Cosmetics.",
      "Seasonal events can reward a cosmetic just for visiting.",
    ],
    link: { label: "Visit the shop", view: "shop" },
  },
  {
    id: "2026-09-05-subscriptions",
    date: "2026-09-05",
    title: "Track your subscriptions",
    summary: "See whether PS Plus, Game Pass and other memberships are paying off in hours played.",
    tag: "feature",
    items: [
      "Log each membership's cost, billing cycle and start date.",
      "Games you play through a service count toward its value.",
      "A membership earns Well spent once its hours pay it off.",
      "Member discounts on games you buy count as value too.",
    ],
    link: { label: "Open Subscriptions", view: "subscriptions" },
  },
  {
    id: "2026-09-01-trying-isnt-buying",
    date: "2026-09-01",
    title: "Trying a game isn't buying one",
    summary: "Subscription, borrowed and Player 2 games no longer break your Clear Streak.",
    tag: "improvement",
    items: [
      "Tap I lost access when a game leaves a service. Its history stays.",
      "Filter your boards to games you might lose access to.",
      "Service names autocomplete as you type.",
    ],
  },
  // ── August 2026 ───────────────────────────────────────────────────────────
  {
    id: "2026-08-29-recommendations",
    date: "2026-08-29",
    title: "Recommend games to friends",
    summary: "Send a friend a game with a pitch: they start it for less, and you earn a Tastemaker Bounty.",
    tag: "feature",
    items: [
      "Recommend from any game's ⋮ menu.",
      "Recommendations arrive in your Community inbox.",
      "Up to three waiting per friend, and declining is free.",
    ],
    link: { label: "Open Recommendations", view: "community-recs" },
  },
  {
    id: "2026-08-29-collaborative-lists",
    date: "2026-08-29",
    title: "Build lists with friends",
    summary: "Invite friends to add games and notes to your custom lists.",
    tag: "feature",
    items: [
      "A contributor's removals need your approval.",
      "See who added each game, plus a full activity log.",
    ],
    link: { label: "Open My Lists", view: "lists" },
  },
  {
    id: "2026-08-29-big-libraries",
    date: "2026-08-29",
    title: "Big libraries load in full",
    summary: "Collections over 1,000 games no longer lose their oldest entries, yours or a friend's.",
    tag: "fix",
  },
  {
    id: "2026-08-10-priorities",
    date: "2026-08-10",
    title: "Rank games by priority",
    summary: "Mark games Essential, High, Medium or Low, then sort and filter by it.",
    tag: "feature",
    items: [
      "Set a priority when you add a game, or from its page.",
      "Only you see your rankings.",
    ],
  },
  {
    id: "2026-08-10-stealth-add",
    date: "2026-08-10",
    title: "Stealth Add",
    summary: "Add a game quietly: it's private, skips the friends feed and leaves your Clear Streak alone.",
    tag: "feature",
  },
  {
    id: "2026-08-10-better-search",
    date: "2026-08-10",
    title: "Better game search",
    summary: "Search now uses a bigger game database, so covers, genres and platforms are back.",
    tag: "improvement",
    items: [
      "The Caravan is restocked with trending games and new releases.",
      "If one source is down, search switches to another.",
      "A game added from either source counts as one game.",
    ],
    link: { label: "Browse the Caravan", view: "market" },
  },
  {
    id: "2026-08-08-online-while-playing",
    date: "2026-08-08",
    title: "Stay online while you play",
    summary: "With your stopwatch running, friends see what you're playing even after you put your phone down.",
    tag: "improvement",
  },
  // ── July 2026 ─────────────────────────────────────────────────────────────
  {
    id: "2026-07-27-community-page",
    date: "2026-07-27",
    title: "The Community page",
    summary: "Friends, activity, messages and the Market Square now share one page.",
    tag: "feature",
    items: [
      "Sort and filter your friends, and see what each is playing.",
      "Messages gets a two-pane inbox on bigger screens.",
      "The bell now counts alerts only.",
    ],
    link: { label: "Open Community", view: "community" },
  },
  {
    id: "2026-07-26-clear-streak",
    date: "2026-07-26",
    title: "Clear Streaks",
    summary: "Finish games back to back without adding new ones to earn a growing bonus.",
    tag: "feature",
    items: [
      "Your third finish in a row starts paying bonus coins.",
      "Adding a new game to play resets it, and we warn you first.",
      "Your best streak is kept on your Master Ledger.",
    ],
  },
  {
    id: "2026-07-24-stopwatch",
    date: "2026-07-24",
    title: "A live stopwatch",
    summary: "Start a timer on any game you're playing and log the time when you stop.",
    tag: "feature",
    items: [
      "It keeps running across refreshes and devices.",
      "Trim the time if you stepped away.",
      "Friends see what you're playing while it runs.",
    ],
    link: { label: "Open Now Playing", view: "playing" },
  },
  {
    id: "2026-07-23-your-length",
    date: "2026-07-23",
    title: "Set your own length",
    summary: "Tell us how long a game will take you, and its price and bounty follow.",
    tag: "feature",
    items: [
      "Pick main story, main plus extras, or 100%.",
      "It never changes the length anyone else sees.",
    ],
  },
  {
    id: "2026-07-23-friend-loans",
    date: "2026-07-23",
    title: "Ask a friend for a loan",
    summary: "Short on coins? A friend can front the difference, repaid from your finish bounty.",
    tag: "feature",
  },
  {
    id: "2026-07-19-curio-shop",
    date: "2026-07-19",
    title: "The Curio Shop",
    summary: "Spend your coins on titles, avatar frames, stall decorations and coin skins.",
    tag: "feature",
    items: [
      "Signature pieces add animation, from twinkling lights to roaming pets.",
      "Collect a whole set to earn an exclusive title.",
      "Some seasonal pieces appear only for a limited time.",
    ],
  },
  {
    id: "2026-07-19-economy-off",
    date: "2026-07-19",
    title: "Turn off the coin economy",
    summary: "Prefer a plain backlog tracker? Switch coins off in Account settings any time.",
    tag: "feature",
    items: ["Your balance is saved and comes back when you switch it on."],
    link: { label: "Open Account", view: "account" },
  },
  {
    id: "2026-07-18-market-square",
    date: "2026-07-18",
    title: "The Market Square",
    summary: "The leaderboard became a community hub for clears, reviews and trending games.",
    tag: "feature",
    items: [
      "Fresh Clears shows games the community just finished.",
      "Hot This Week shows what players are adding and finishing.",
      "Browse players' public lists in Curated Stalls.",
      "A privacy toggle keeps your clears out of it.",
    ],
    link: { label: "Visit the Market Square", view: "community-discover" },
  },
  {
    id: "2026-07-18-player-2-pacts",
    date: "2026-07-18",
    title: "Co-op Pacts with any friend",
    summary: "Invite friends who don't own the game: accepting adds a Player 2 copy and starts it.",
    tag: "feature",
    items: [
      "Offer to cover your friend's start cost.",
      "Pact games get their own Co-op lane with no limit.",
      "Player 1 logs time once, and it counts for both players.",
    ],
  },
  {
    id: "2026-07-18-back-a-game",
    date: "2026-07-18",
    title: "Back a Game",
    summary: "Stake coins on a friend's backlog game, and they claim them by finishing it.",
    tag: "feature",
    items: ["Unclaimed stakes come back to you after 60 days."],
  },
  {
    id: "2026-07-18-preorders",
    date: "2026-07-18",
    title: "Pre-orders",
    summary: "Pre-ordered games wait in your Bazaar with a countdown, then unlock on release day.",
    tag: "feature",
    items: [
      "Cards show roughly what it will cost to start.",
      "The Coming up strip lists arrivals in the next 30 days.",
      "Cancel an order to remove the game or keep it wishlisted.",
    ],
  },
  {
    id: "2026-07-13-fast-scroll",
    date: "2026-07-13",
    title: "Fly through long boards",
    summary: "On phones, a fast-scroll rail jumps through long lists, with a letter index for A to Z.",
    tag: "improvement",
  },
  {
    id: "2026-07-11-co-op-pacts",
    date: "2026-07-11",
    title: "Co-op Pacts",
    summary: "Pledge to finish a game with a friend, and you both earn a bonus when you do.",
    tag: "feature",
    items: [
      "Invite a friend from a game's ⋮ menu.",
      "Pact cards show your partner and their progress.",
    ],
  },
  {
    id: "2026-07-10-money-well-spent",
    date: "2026-07-10",
    title: "Money Well Spent",
    summary: "Set a target cost per hour and see which games have paid for themselves.",
    tag: "feature",
    items: [
      "Games that hit it earn a Well spent badge.",
      "The Master Ledger shows your real cost per hour.",
    ],
  },
  {
    id: "2026-07-08-game-browsing",
    date: "2026-07-08",
    title: "Step through your games",
    summary: "Previous and Next on a game's page move through your board without going back.",
    tag: "improvement",
    items: ["Back returns you to the card you opened."],
  },
  {
    id: "2026-07-06-csv-import",
    date: "2026-07-06",
    title: "Import from a spreadsheet",
    summary: "Bring your collection in from a CSV file, with cover art found for you.",
    tag: "feature",
    items: ["You see exactly what will be added before anything changes."],
  },
  {
    id: "2026-07-06-private-profiles",
    date: "2026-07-06",
    title: "Truly private profiles",
    summary: "A private profile now hides you completely, even from friends.",
    tag: "improvement",
    items: ["Friendships and messages keep working."],
  },
  {
    id: "2026-07-05-game-hub",
    date: "2026-07-05",
    title: "One page for every copy",
    summary: "Every copy of a game opens the same page, with each version in its Library tab.",
    tag: "feature",
    items: [
      "Add another platform right from the Library tab.",
      "Journey and Review switch between editions.",
    ],
  },
  {
    id: "2026-07-05-unified-families",
    date: "2026-07-05",
    title: "Game Families as one card",
    summary: "Linked editions show as one card, led by the edition you choose.",
    tag: "improvement",
    items: [
      "Each edition keeps its own playtime and milestones.",
      "The Family Breakdown lists every copy.",
    ],
  },
  {
    id: "2026-07-05-unlimited-rotation",
    date: "2026-07-05",
    title: "Unlimited Rotation",
    summary: "Keep as many live-service games in Rotation as you play.",
    tag: "improvement",
    items: ["They show as In Rotation instead of Now Playing."],
  },
  {
    id: "2026-07-04-custom-lists",
    date: "2026-07-04",
    title: "Custom lists",
    summary: "Make ranked lists, like a Top 10, with a note on every pick.",
    tag: "feature",
    items: [
      "Keep each list public, unlisted or private.",
      "Organize lists into folders.",
      "Your profile shows your public lists.",
    ],
    link: { label: "Open My Lists", view: "lists" },
  },
  {
    id: "2026-07-04-per-platform-cards",
    date: "2026-07-04",
    title: "One card per platform",
    summary: "Each platform you own a game on gets its own card and its own progress.",
    tag: "feature",
    items: [
      "Stack copies of the same game into one deck.",
      "A game you beat elsewhere shows a Cleared Elsewhere badge.",
    ],
  },
  {
    id: "2026-07-04-achievements",
    date: "2026-07-04",
    title: "Achievements",
    summary: "Earn bronze, silver and gold medals for how you play.",
    tag: "feature",
    items: [
      "Your past play counted, so earned medals arrived right away.",
      "See how rare each medal is.",
    ],
  },
  {
    id: "2026-07-04-likes",
    date: "2026-07-04",
    title: "Like your favorites",
    summary: "Give games a thumbs up and show them off on your profile.",
    tag: "feature",
    items: ["See how many players liked a game, and who."],
  },
  {
    id: "2026-07-04-retire-it",
    date: "2026-07-04",
    title: "Retire It",
    summary: "Move a game you'll never finish to Finished as Retired, no fake clear needed.",
    tag: "feature",
    items: [
      "Retiring a game you're playing gives coins back.",
      "Return it to your Bazaar any time.",
    ],
  },
  {
    id: "2026-07-04-mystery-pull",
    date: "2026-07-04",
    title: "Mystery Pull",
    summary: "Can't decide? Roll the dice for a random game you can start right now.",
    tag: "feature",
  },
  {
    id: "2026-07-04-community-stats",
    date: "2026-07-04",
    title: "Community stats on every game",
    summary: "See every game's ratings, total hours and how many players own it.",
    tag: "feature",
    items: ["Mark each copy as owned, on a subscription or borrowed."],
  },
  {
    id: "2026-07-03-reviews",
    date: "2026-07-03",
    title: "Reviews",
    summary: "Rate and review any game, and read what other players thought.",
    tag: "feature",
  },
  {
    id: "2026-07-03-profiles",
    date: "2026-07-03",
    title: "Profiles get personal",
    summary: "Pick your profile's colors, show your platforms and recent clears, and frame a bigger banner.",
    tag: "feature",
    items: [
      "Match your colors to your banner in one tap.",
      "Crop and zoom your banner.",
    ],
    link: { label: "Open your profile", view: "profile" },
  },
  {
    id: "2026-07-03-fresh-pickups",
    date: "2026-07-03",
    title: "Prices follow your timeline",
    summary: "Newly added games cost more, and games that wait on your shelf get cheaper.",
    tag: "improvement",
    items: ["Backdate a game's Added date to set its true price."],
  },
  {
    id: "2026-07-03-game-pages",
    date: "2026-07-03",
    title: "Every game gets a page",
    summary: "Games open on their own page with Overview, Journey and Library tabs.",
    tag: "feature",
    items: [
      "Pages have links you can bookmark and share.",
      "Changes save as you make them.",
    ],
  },
  {
    id: "2026-07-03-milestones",
    date: "2026-07-03",
    title: "Game milestones",
    summary: "Each game keeps a dated timeline of when you added, started and finished it.",
    tag: "feature",
    items: ["Backdate any milestone to when it really happened."],
  },
  {
    id: "2026-07-03-story-order",
    date: "2026-07-03",
    title: "Story order",
    summary: "Lock a sequel until you finish its prequel, and it unlocks by itself.",
    tag: "feature",
  },
  {
    id: "2026-07-02-getting-started",
    date: "2026-07-02",
    title: "A hands-on welcome",
    summary: "New players learn by doing with a Getting Started checklist and free starter vouchers.",
    tag: "feature",
  },
  {
    id: "2026-07-02-account-controls",
    date: "2026-07-02",
    title: "Fresh Start and account deletion",
    summary: "Reset your collection and coins to begin again, or delete your account entirely.",
    tag: "feature",
    items: ["Both sit in Account settings behind a typed confirmation."],
  },
  {
    id: "2026-07-02-family-discount",
    date: "2026-07-02",
    title: "Family Discount",
    summary: "Once one edition of a game is playing or finished, its other editions start for less.",
    tag: "feature",
  },
  {
    id: "2026-07-02-new-look",
    date: "2026-07-02",
    title: "A new look",
    summary: "Backlog Bazaar has a paper, ink and rubber stamp redesign.",
    tag: "improvement",
    items: [
      "New Ledger and Midnight Ledger themes.",
      "Reset a forgotten password from the sign-in page.",
    ],
  },
  // ── June 2026 ─────────────────────────────────────────────────────────────
  {
    id: "2026-06-30-profile-hub",
    date: "2026-06-30",
    title: "Profile pages",
    summary: "Every player has a profile with a banner, a bio and what they're playing.",
    tag: "feature",
  },
  {
    id: "2026-06-29-friends-and-messages",
    date: "2026-06-29",
    title: "Friends, a feed and messages",
    summary: "Add friends, cheer on their clears and message them.",
    tag: "feature",
    items: [
      "React, reply and send images in messages.",
      "Type @ to share one of your games in a message.",
      "Make your profile private or appear offline.",
    ],
  },
  {
    id: "2026-06-29-undo-finish",
    date: "2026-06-29",
    title: "Undo an accidental finish",
    summary: "Tap Undo on the finish message to put a game back, coins and all.",
    tag: "feature",
  },
  {
    id: "2026-06-29-safer-covers",
    date: "2026-06-29",
    title: "Safer covers and reporting",
    summary: "Custom covers show only to you and your friends, and you can report a player.",
    tag: "feature",
  },
  {
    id: "2026-06-28-now-playing-lanes",
    date: "2026-06-28",
    title: "Four Now Playing lanes",
    summary: "Focus, Replay, Completionist and Rotation lanes keep different kinds of play apart.",
    tag: "feature",
    items: [
      "Earn a Completion Bonus for a 100% run.",
      "Choose what's next for a game when you finish it.",
    ],
  },
  {
    id: "2026-06-27-rotation",
    date: "2026-06-27",
    title: "Live-service games and Rotation",
    summary: "Add ongoing games like Fortnite for free, and check in weekly for coins.",
    tag: "feature",
  },
  {
    id: "2026-06-27-search",
    date: "2026-06-27",
    title: "Search your library",
    summary: "Find any game in your library, or a friend's, from the search bar.",
    tag: "feature",
    items: ["Mark a game private to hide it from visitors."],
  },
  {
    id: "2026-06-25-compilations",
    date: "2026-06-25",
    title: "Add compilations",
    summary: "Log a bundle like Super Mario 3D All-Stars once, with every game inside it.",
    tag: "feature",
    items: [
      "Split the price across its games.",
      "Share a compilation so others can add it in one tap.",
    ],
  },
  {
    id: "2026-06-24-vouchers",
    date: "2026-06-24",
    title: "Free Game Vouchers",
    summary: "New players get two vouchers that start games for free.",
    tag: "feature",
  },
  {
    id: "2026-06-23-import-charters",
    date: "2026-06-23",
    title: "Import Charters",
    summary: "Your Wishlist became games you don't own yet, moved into your Bazaar with a charter.",
    tag: "feature",
  },
  {
    id: "2026-06-22-transaction-ledger",
    date: "2026-06-22",
    title: "Transaction Ledger",
    summary: "Tap your coin balance to see every coin you've earned and spent.",
    tag: "feature",
    link: { label: "Open your ledger", view: "transaction-ledger" },
  },
  {
    id: "2026-06-22-master-ledger",
    date: "2026-06-22",
    title: "The Master Ledger",
    summary: "See every game you own in one place, grouped and filtered your way.",
    tag: "feature",
    link: { label: "Open the Master Ledger", view: "master-ledger" },
  },
  {
    id: "2026-06-22-community-catalog",
    date: "2026-06-22",
    title: "Help build the game catalog",
    summary: "Suggest fixes or new games, and earn coins when they're approved.",
    tag: "feature",
    items: ["Track your suggestions on My contributions."],
  },
  {
    id: "2026-06-22-visit-players",
    date: "2026-06-22",
    title: "Visit other players",
    summary: "Browse anyone's Bazaar, Now Playing, Finished and Wishlist, and see who's online.",
    tag: "feature",
  },
  {
    id: "2026-06-22-sort-and-filter",
    date: "2026-06-22",
    title: "Sort and filter your boards",
    summary: "Sort by cost, bounty, length or date, and filter by platform, genre and format.",
    tag: "feature",
  },
  {
    id: "2026-06-22-finish-bounty",
    date: "2026-06-22",
    title: "Finishing pays a bounty",
    summary: "Coins now arrive as one bounty when you finish a game.",
    tag: "improvement",
  },
  {
    id: "2026-06-22-badges",
    date: "2026-06-22",
    title: "Badges and titles",
    summary: "Earn badges and show one beside your name as your title.",
    tag: "feature",
    items: ["Every beta player got a Beta Tester badge. Thank you!"],
  },
  {
    id: "2026-06-21-requests-and-bugs",
    date: "2026-06-21",
    title: "Requests and bugs",
    summary: "Suggest features and report bugs, with comments, reactions and screenshots.",
    tag: "feature",
  },
  {
    id: "2026-06-21-game-families",
    date: "2026-06-21",
    title: "Game Families",
    summary: "Link editions of the same game, like a remaster and a port.",
    tag: "feature",
    items: ["Clearing another edition pays the smaller Replay Bonus."],
  },
  {
    id: "2026-06-21-now-playing-slots",
    date: "2026-06-21",
    title: "Now Playing slots",
    summary: "You play a few games at a time, so finish or shelve one before starting more.",
    tag: "feature",
  },
  {
    id: "2026-06-21-platforms-and-copies",
    date: "2026-06-21",
    title: "Your platforms and copies",
    summary: "Track which platforms you own each game on, physical or digital, and what you paid.",
    tag: "feature",
  },
  {
    id: "2026-06-21-play-time",
    date: "2026-06-21",
    title: "Track your play time",
    summary: "Log hours on the games you're playing, down to the minute.",
    tag: "feature",
    items: ["Jot a progress note on any game you're playing."],
  },
  {
    id: "2026-06-21-caravan-and-wishlist",
    date: "2026-06-21",
    title: "The Caravan and your Wishlist",
    summary: "Discover games for your platforms and wishlist the ones you want.",
    tag: "feature",
    link: { label: "Browse the Caravan", view: "market" },
  },
  {
    id: "2026-06-21-themes",
    date: "2026-06-21",
    title: "Themes",
    summary: "Pick from light, dark and gaming-inspired color themes, including Bloodmoon, Phoenix and Crimson.",
    tag: "feature",
  },
  {
    id: "2026-06-20-launch",
    date: "2026-06-20",
    title: "Welcome to Backlog Bazaar",
    summary: "Build your backlog, finish games to earn coins, and spend them to start new ones.",
    tag: "feature",
  },
];

/** The id of the latest release (the one users are compared against). */
export const LATEST_RELEASE_ID = RELEASES[0]?.id ?? "";

/** How many of the newest releases the page shows open, before the months. */
export const EXPANDED_RELEASES = 5;

export interface ReleaseMonth {
  /** "2026-09" */
  key: string;
  /** "September 2026" */
  label: string;
  releases: Release[];
}

/** The page's layout: the newest few releases open, then the rest grouped by
 *  month (newest month first, release order kept). */
export function groupReleases(
  releases: Release[],
  expanded = EXPANDED_RELEASES,
  locale?: string,
): { recent: Release[]; months: ReleaseMonth[] } {
  const recent = releases.slice(0, expanded);
  const months: ReleaseMonth[] = [];
  for (const r of releases.slice(expanded)) {
    const key = r.date.slice(0, 7);
    let month = months[months.length - 1];
    if (!month || month.key !== key) {
      const [y, m] = key.split("-").map(Number);
      const label = new Date(y, m - 1, 1).toLocaleDateString(locale, { month: "long", year: "numeric" });
      month = { key, label, releases: [] };
      months.push(month);
    }
    month.releases.push(r);
  }
  return { recent, months };
}

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
