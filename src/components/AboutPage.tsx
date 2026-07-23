import { type ReactNode } from "react";
import {
  Compass,
  Store,
  Gamepad2,
  Trophy,
  Heart,
  Clock,
  Coins,
  Lock,
  Link2,
  Library,
  Package,
  Palette,
  Lightbulb,
  HelpCircle,
  Scroll,
  Ticket,
  Search,
  Users,
  Handshake,
  CalendarClock,
  Infinity as InfinityIcon,
  ShoppingBag,
  Tent,
  type LucideIcon,
} from "lucide-react";
import { useStore } from "../store";
import { CoinIcon } from "./CoinIcon";
import { STARTING_COINS } from "../lib/pricing";
import { charterResale } from "../lib/charters";
import { resetDayLabel } from "../lib/rotation";

// NOTE: This page explains the core flow and economy to new players. When you
// change a core mechanic (the loop, slots, families, etc.), update the prose
// here too. The coin *numbers* pull from pricing.ts and live admin settings, so
// those stay in sync automatically — it's the wording that needs a human.

/** An inline coin amount, styled like the rest of the app. */
function Coin({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 font-semibold text-accent">
      <CoinIcon size={13} /> {n}
    </span>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="flex gap-3">
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand/10 text-accent">
        <Icon size={16} />
      </span>
      <div className="min-w-0">
        <h3 className="font-display text-lg text-ink">{title}</h3>
        <div className="mt-1 space-y-1.5 text-sm leading-relaxed text-muted">{children}</div>
      </div>
    </section>
  );
}

export function AboutPage() {
  const {
    shelveRefundPct,
    replayBonusPct,
    completionBonusPct,
    submissionReward,
    charterCost,
    charterResalePct,
    economy,
    rotationCheckinReward,
    rotationReset,
    coOpBonusPct,
    sponsorMaxStake,
    sponsorExpiryDays,
  } = useStore();
  const priceBase = economy.price.base;
  const bountyBase = economy.bounty.base;
  const charterResaleCoins = charterResale(charterCost, charterResalePct);

  return (
    <div className="mx-auto w-full max-w-3xl overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="border-b border-line p-4">
        <h2 className="inline-flex items-center gap-2 font-display text-xl text-ink">
          <HelpCircle size={18} className="text-accent" /> How Backlog Bazaar works
        </h2>
      </div>

      <div className="flex flex-col gap-7 p-5">
        <p className="text-sm leading-relaxed text-muted">
          Backlog Bazaar turns your pile of unplayed games into a little economy. The golden rule:{" "}
          <span className="font-medium text-ink">
            you finish games to earn coins, and spend coins to start new ones
          </span>
          . Because you have to play to earn to buy, you can&apos;t binge-start a dozen games at
          once — you actually clear your backlog.
        </p>

        <div>
          <h3 className="mb-4 font-display text-sm uppercase tracking-wide text-subtle">The loop</h3>
          <div className="flex flex-col gap-5">
            <Section icon={Compass} title="1 · Discover in The Caravan">
              Browse trending and recommended games. Already own one? <strong className="text-ink">Send
              it to your Bazaar</strong> for free. Just eyeing it? Tuck it into your{" "}
              <strong className="text-ink">Wishlist</strong> for later.
            </Section>
            <Section icon={Store} title="2 · Your Bazaar">
              Everything you plan to play, each with a coin price. The cheapest games are the
              shorter ones that have waited in your Bazaar the longest — easy wins to clear first.
            </Section>
            <Section icon={Gamepad2} title="3 · Buy a game to start it">
              Spend coins to move a game into <strong className="text-ink">Now Playing</strong>. You
              begin with <Coin n={STARTING_COINS} /> and a couple of{" "}
              <strong className="text-ink">Free Game Vouchers</strong> — each starts a Bazaar game
              for free, so you can jump straight into something you&apos;re already playing. You only
              have a few Now Playing slots, so pick deliberately. Can&apos;t decide? Hit{" "}
              <strong className="text-ink">Mystery Pull</strong> on the Bazaar and let it draw a
              game you can afford right now — take it at its normal price, re-roll, or walk away.
              The same dice on your Finished shelf draw a beaten game to pull back for a free 100%
              run.
            </Section>
            <Section icon={Clock} title="4 · Play and log your time">
              Log the hours you play to keep track of your progress. Logging time doesn&apos;t pay
              coins on its own — the whole payout comes as a bounty when you finish.
            </Section>
            <Section icon={Trophy} title="5 · Finish for the bounty">
              Mark a game finished to collect its <strong className="text-ink">bounty</strong> (at
              least <Coin n={bountyBase} />) and move it to your trophy shelf. Spend those coins on
              your next game, and repeat. Hit it by mistake? For about 15 seconds an{" "}
              <strong className="text-ink">Undo</strong> button on the confirmation puts the game
              back exactly where it was and refunds the coins.
            </Section>
          </div>
        </div>

        <div className="flex flex-col gap-5">
          <Section icon={Coins} title="The coin economy">
            <p>
              A game&apos;s <strong className="text-ink">price</strong> starts at{" "}
              <Coin n={priceBase} /> and rises with the factors the team has dialed in — typically
              how long the game is and how recently <em>you</em> picked it up. A fresh acquisition
              carries a premium that fades the longer it waits, so the cheapest buys are the short
              games that have lingered in your Bazaar the longest. The date that drives this is
              the <strong className="text-ink">Added</strong> milestone on the game&apos;s page —
              backdate it to when you really bought the game (an old purchase you only just
              imported, say) and the price settles to match.
            </p>
            <p>
              Finishing a game pays a <strong className="text-ink">bounty</strong> starting at{" "}
              <Coin n={bountyBase} />. You finish games to earn and spend coins to start new ones —
              roughly enough to afford one new game per game you complete.
            </p>
            <p>
              A game&apos;s length comes from a shared estimate, but you can set{" "}
              <strong className="text-ink">your own length</strong> on its Overview — mainlining it,
              or going for 100% — and it drives your price and bounty instead, without changing the
              catalog anyone else sees. Lengthen a game you&apos;re already playing and it tops up the
              activation fee for the extra hours; if you can&apos;t cover it all right now, the rest
              just comes off that game&apos;s finish bounty rather than blocking the change.
            </p>
          </Section>

          <Section icon={ShoppingBag} title="The Curio Shop">
            <p>
              What&apos;s a fortune for if you can&apos;t spend it? The{" "}
              <strong className="text-ink">Curio Shop</strong> (in the sidebar) sells permanent
              cosmetics for your coin surplus: <strong className="text-ink">titles</strong> that sit
              beside your name, <strong className="text-ink">avatar frames</strong> that ring your
              picture, and <strong className="text-ink">stall decorations</strong> that dress up
              your Market Square stall and profile header. Everything is cosmetic only — never
              gameplay power — and once bought it&apos;s yours forever. Keep an eye on the shelf:{" "}
              <strong className="text-ink">seasonal stock</strong> comes and goes, but anything you
              grabbed during its window stays yours.
            </p>
            <p>
              Most items are standard fare, but the <strong className="text-ink">Signature</strong>{" "}
              class (marked with a gilded chip) brings animation and flair — glints, glows, and
              little inhabitants — at signature prices. And some seasonal treasures are{" "}
              <strong className="text-ink">surprise drops</strong>: they don&apos;t appear on the
              shelf at all until their season arrives, so it pays to wander in now and then.
            </p>
            <p>
              Two more things worth knowing: <strong className="text-ink">coin skins</strong>{" "}
              re-mint every coin and price you see (and visitors see your mint on your profile),
              and seasonal items form <strong className="text-ink">collections</strong> — own every
              piece of one and an exclusive animated title is granted on the spot, the kind you
              can&apos;t buy directly at any price.
            </p>
          </Section>

          <Section icon={Gamepad2} title="Prefer just tracking?">
            <p>
              The whole coin game is optional. Flip{" "}
              <strong className="text-ink">&ldquo;Play with the coin economy&rdquo;</strong> off in
              Account settings and Backlog Bazaar becomes a plain backlog tracker: starting a game
              is free, finishing pays no bounty, and prices, coins, charters and vouchers disappear
              from the app — the boards, lanes, stats, lists and community all keep working exactly
              the same. Your balance is <strong className="text-ink">kept safe and frozen</strong>,
              and flipping the switch back on resumes it exactly where it left off. Two honest
              rules: turning it off returns any active game backings (yours and your friends&apos;),
              and games you started or finished while it was off never pay out retroactively.
            </p>
          </Section>

          <Section icon={Lock} title="Now Playing lanes & Shelve It">
            <p>
              Now Playing is split into five lanes. Focus, Replay and Completionist each have their
              own limited number of slots — so pick deliberately; Rotation (live-service games) and
              Co-op Pacts have no limit. <strong className="text-ink">Focus</strong> is for the games
              you&apos;re working to finish (buying a game starts it here).{" "}
              <strong className="text-ink">Shelve It</strong> drops a Focus game back to your Bazaar
              and refunds {shelveRefundPct}% of what you paid (the rest is forfeit).
            </p>
            <p>
              <strong className="text-ink">Replay</strong> holds a{" "}
              <strong className="text-ink">Finished</strong> game you&apos;ve pulled back into play
              for free; finishing it again pays the smaller {replayBonusPct}% Replay Bonus (or send
              it straight back to Finished without claiming anything).{" "}
              <strong className="text-ink">Completionist</strong> is for games you&apos;re going for
              100% on — start one there from the Bazaar, flip a game you&apos;re already playing into
              it, or pull a finished game back. Completing it pays a{" "}
              <strong className="text-ink">Completion Bonus</strong> of {completionBonusPct}% of the
              bounty on top of the base reward. Both lanes have the same small number of slots.
            </p>
            <p>
              When you finish a Focus game and collect its bounty, a quick prompt lets you decide
              what&apos;s next: leave it <strong className="text-ink">Finished</strong>,{" "}
              <strong className="text-ink">Grind to 100%</strong> (into Completionist), or{" "}
              <strong className="text-ink">Convert to Endless</strong> (into Rotation). Every
              finished game shows a status tag — <strong className="text-ink">Beaten</strong> (credits
              rolled), <strong className="text-ink">Completed</strong> (100%),{" "}
              <strong className="text-ink">Endless</strong> (an ongoing game you retired), or{" "}
              <strong className="text-ink">Retired</strong> (dropped without finishing) — which you
              can change anytime from its card. Changed your mind on a 100% run? Abandon it back to
              Finished (kept as Beaten) — no penalty, no coins.
            </p>
            <p>
              And when a game just isn&apos;t clicking,{" "}
              <strong className="text-ink">Retire It</strong>: it moves to your Finished shelf under
              the <strong className="text-ink">Retired</strong> tag — out of your backlog for good,
              honestly marked as a drop instead of a fake clear. Retiring straight from a lane
              salvages the same {shelveRefundPct}% of what you paid that Shelve It refunds
              (&quot;Dropped Game Salvage&quot; in your ledger); retiring an unstarted Bazaar game
              moves no coins. Retired games never count toward your finished stats, pay no bounty,
              and have no free way back into play — returning one to the Bazaar and buying it again
              at full price is the only road back.
            </p>
          </Section>

          <Section icon={InfinityIcon} title="Live-service games & the Rotation lane">
            <p>
              Some games never really “finish” — live-service games, dailies, weeklies, and
              forever-games. When you add one, mark it{" "}
              <strong className="text-ink">live-service / ongoing</strong> (well-known ones are
              flagged for you). These sit outside the coin economy entirely:{" "}
              <strong className="text-ink">free to add</strong>, with no buy price, no length, and no
              finish bounty.
            </p>
            <p>
              Play an ongoing game from the <strong className="text-ink">Rotation lane</strong> — a
              separate, <strong className="text-ink">unlimited</strong> lane that never uses up
              your focus slots (past two games it scrolls sideways). Add it to Rotation for free,
              and check in <strong className="text-ink">once a week</strong> to collect{" "}
              <Coin n={rotationCheckinReward} />. The week resets every{" "}
              <strong className="text-ink">{resetDayLabel(rotationReset.resetDow)}</strong> (the lane
              shows the countdown).
            </p>
            <p>
              Not every ongoing game starts life flagged live-service: any{" "}
              <strong className="text-ink">Finished</strong> game with a big post-game loop can be{" "}
              <strong className="text-ink">converted to Endless</strong> from its card, which moves
              it into Rotation and unlocks the weekly check-in — just for you, the shared catalog
              isn&apos;t touched. It&apos;s fully reversible:{" "}
              <strong className="text-ink">Remove from Rotation</strong> sends a game back where it
              came from. A converted game returns to Finished with the{" "}
              <strong className="text-ink">Beaten</strong> or{" "}
              <strong className="text-ink">Completed</strong> badge it already earned (and stops
              being live-service); a game added from the Bazaar chooses between parking back there
              and concluding to Finished. No penalty either way.
            </p>
          </Section>

          <Section icon={Ticket} title="Free Game Vouchers">
            New accounts get a couple of <strong className="text-ink">Free Game Vouchers</strong> to
            get rolling. Spend one in place of coins to move a game from your{" "}
            <strong className="text-ink">Bazaar</strong> into{" "}
            <strong className="text-ink">Now Playing</strong> — perfect for the games you&apos;re
            already playing in real life. Vouchers only work for that one step (never from the
            Wishlist) and can&apos;t be sold or turned into coins.
          </Section>

          <Section icon={Heart} title="Wishlist">
            Games you don&apos;t own yet but have your eye on. They wait here, out of your priced
            Bazaar, until you spend an Import Charter to bring one in.
          </Section>

          <Section icon={CalendarClock} title="Pre-orders">
            <p>
              A game you&apos;ve <strong className="text-ink">already bought</strong> that
              isn&apos;t out yet belongs in your Bazaar, not the Wishlist — mark it as
              pre-ordered while adding it (or from a Bazaar card&apos;s ⋮ menu) with its release
              date and what you paid. It pins to the top of the Bazaar with a countdown,{" "}
              <strong className="text-ink">locked from starting</strong> until the day comes.
            </p>
            <p>
              On release day it <strong className="text-ink">unlocks by itself</strong> — you get
              an arrival alert and it&apos;s ready to buy into Now Playing like any other Bazaar
              game. Arrival becomes the game&apos;s{" "}
              <strong className="text-ink">Added date</strong>, not the day you placed the order —
              so it joins your collection (and prices) as a fresh, day-one pickup. If the order
              falls through, cancel it and choose: remove the game, or keep it on your Wishlist as
              a plain want.
            </p>
            <p>
              Importing a Wishlist game that isn&apos;t out yet? The import asks whether you
              pre-ordered it — confirm and it lands in your Bazaar as a pre-order, and if that
              order is ever cancelled the{" "}
              <strong className="text-ink">Import Charter comes back</strong>.
            </p>
          </Section>

          <Section icon={Scroll} title="Import Charters">
            <p>
              Games you <span className="font-medium text-ink">already own</span> go straight into
              your Bazaar for free — cataloging what you have should never cost anything.
            </p>
            <p>
              Moving a <span className="font-medium text-ink">Wishlist</span> game into your Bazaar
              is the one exception: it costs an <strong className="text-ink">Import Charter</strong>.
              Buy charters for <Coin n={charterCost} /> each from the wallet and spend one to import a
              want — a gentle nudge to clear (and earn from) the games you have before committing to
              new ones. Changed your mind? Sell a charter back for <Coin n={charterResaleCoins} /> (
              {charterResalePct}% of the cost). Marking an already-bought game as a pre-order
              while adding it never needs a charter — and when a charter-imported pre-order is
              cancelled, that charter is refunded.
            </p>
          </Section>

          <Section icon={Library} title="Copies you own">
            <strong className="text-ink">Each platform you own a game on is its own card</strong>,
            with its own status, play time, and coin economy — finishing on PC and later buying
            (and beating) the Switch version are two real playthroughs, each with its own
            activation fee and bounty. On one platform&apos;s card you can track multiple copies:
            each is <strong className="text-ink">Physical, Digital or DLC</strong> — a DLC row
            records an expansion or season pass: its cost counts in your spend totals and it shows
            with a small DLC tag, but it never counts as owning another copy of the base game.
            Copy costs are just for your records — they never affect the coin economy. A copy
            you&apos;ve already beaten elsewhere wears a{" "}
            <strong className="text-ink">Cleared Elsewhere</strong> badge for context (never
            syncing anything), profile stats and achievements count distinct <em>games</em> so
            extra copies never inflate your totals, and the boards&apos;{" "}
            <strong className="text-ink">Stack</strong> toggle folds copies of one game into a
            single fan-out deck whenever you want a tidier shelf.
          </Section>

          <Section icon={Package} title="Compilations">
            Bought a collection or bundle that packs several games into one purchase? Use{" "}
            <strong className="text-ink">Add compilation</strong> to record it — title and every
            copy you own (platform, format and price each, just like a standalone game&apos;s
            copies). Its games price like everything else: from the moment the bundle joined your
            Bazaar — a recent pickup of decades-old classics prices as the fresh acquisition it
            is, not the originals. Each game
            gets its own card to buy, play and finish; every copy&apos;s platform shows on every game,
            and each copy&apos;s price is split across them (evenly, by length, or however you
            choose). The split is just for your records — like other costs, it never affects the
            coin economy. Open any card&apos;s &ldquo;Part of …&rdquo;
            badge to see the whole compilation, what you spent, and your total time. Built one worth
            sharing? Suggest it for everyone — once approved, it autocompletes for other players (and
            you earn coins), and they set their own price. Only the title and games are shared, never
            your cost or platform.
            <br />
            <br />
            Any compilation can also be <strong className="text-ink">collapsed</strong> into one
            rollup card that totals the bundle&apos;s spend and hours — it sits in the Bazaar until
            every game inside is finished, then moves to Finished by itself. Expand it whenever you
            want the individual cards back (all playing and time-logging happens on those). And when
            a collection you own as a <em>single</em> card is linked in the catalog, its ⋮ menu
            offers &ldquo;Expand compilation&rdquo; — the card becomes the bundle&apos;s games with
            the cost split evenly, your logged hours kept on the bundle total, and any activation
            fee you paid refunded.
          </Section>

          <Section icon={Link2} title="Game Families">
            Own the same game twice — a remaster, a port, a second platform — but only plan to play
            it once? Link the copies into a family and pick a{" "}
            <strong className="text-ink">primary edition</strong>: the family becomes{" "}
            <strong className="text-ink">one ordinary-looking card</strong> — the primary&apos;s
            board, box art and buttons, with a small badge on the cover and every linked
            platform&apos;s tag side by side (the primary&apos;s first). The other editions wait
            hidden — off your boards and Master Ledger — while the card shows the{" "}
            <strong className="text-ink">combined playtime</strong> of the whole family and its
            Journey merges every edition&apos;s milestones into one timeline. New hours, notes and
            milestones you log on the card save to the primary; everything each edition earned
            before stays <strong className="text-ink">permanently on its own record</strong> —
            nothing ever migrates. Tap the cover badge, &ldquo;View linked editions&rdquo; in
            the ⋮ menu, or the game page&apos;s Library tab for the{" "}
            <strong className="text-ink">Family Breakdown</strong>: every copy
            with its own platform, logged time and status, where you can crown a different primary
            (the card follows its status — an unplayed primary puts the family back in the Bazaar)
            or remove a single copy. A mid-run primary must be shelved, finished or retired before
            it hands over the crown, and &ldquo;Sever family link&rdquo; dissolves the whole group
            back into standalone cards. Economy-wise a family is one game: one activation fee, one
            Now Playing slot, one full completion bounty — re-clearing another edition pays the
            smaller {replayBonusPct}% Replay Bonus, and once any edition is active or finished its
            Bazaar siblings activate at the matching{" "}
            <strong className="text-ink">Family Discount</strong> ({replayBonusPct}% of the normal
            fee, shown crossed-out).
          </Section>

          <Section icon={Handshake} title="Co-op Pacts">
            <p>
              Playing through the same game as a friend? Open the game card&apos;s ⋮ menu and{" "}
              <strong className="text-ink">Invite to Co-op Pact</strong> — any friend can be
              invited, on any platform, <strong className="text-ink">even if they don&apos;t own
              the game</strong>. A friend who owns it accepts with their own copy (standard
              activation fee if it isn&apos;t already active); a friend who doesn&apos;t accepts as{" "}
              <strong className="text-ink">Player 2</strong> — the game is added to their library
              automatically with a Player 2 copy on your platform (they play on your copy, so no
              Import Charter is needed; only the activation fee applies). You can also offer to{" "}
              <strong className="text-ink">cover their activation fee</strong> — when sending the
              invite, or any time while it&apos;s still pending — and it&apos;s charged to you the
              moment they accept, so coins never stand between you. If your balance comes up short
              at that moment, your friend is told honestly and can pay their own way or wait for
              you to top up.
            </p>
            <p>
              Pact games live in the <strong className="text-ink">Co-op Pacts lane</strong> of Now
              Playing — no limit, and never a Focus slot: sending an invite from a Focus game moves
              it there right away (wearing a &ldquo;waiting&rdquo; chip until your friend decides),
              and accepting starts the game there too, even when your Focus lane is full. A slow
              partner can never block the rest of your play. A pacted game that detours into the
              Completionist lane comes back to its Co-op seat when you stop the 100% run, and if a
              pact ends while you&apos;re still playing, the game simply keeps its Co-op seat until
              you finish or shelve it.
            </p>
            <p>
              While a pact is active, play time is <strong className="text-ink">logged once,
              shared by both</strong>: Player 1 (whoever sent the invite) logs your sessions, and
              the same hours land on both players&apos; cards automatically — the partner&apos;s
              log box shows a note instead, so a shared session is never entered twice. Hours
              either of you had logged before the pact stay untouched; the shared time simply adds
              on top. Once Player 1 finishes their half, the partner&apos;s log box unlocks so they
              can record the rest of their own run.
            </p>
            <p>
              Once linked, each card wears a chip with the partner&apos;s avatar, and the
              game&apos;s page gains a pact banner showing how far your partner has played. Finish
              the game and your half of the pact is stamped; once{" "}
              <strong className="text-ink">both</strong> of you have finished, each player earns an
              extra {coOpBonusPct}% on top of their own bounty. Shelving, retiring or deleting a
              pacted game dissolves the pact — dissolving it yourself sends your active copy back
              to the Bazaar with the usual shelve refund. No bonus is paid on a dissolved pact, but
              there&apos;s no penalty either.
            </p>
          </Section>

          <Section icon={Lock} title="Story order (prerequisites)">
            Playing a series in order? Open a game&apos;s details and set{" "}
            <strong className="text-ink">&ldquo;Requires prior completion of&rdquo;</strong> to lock
            it behind another game in your library. A story-locked game shows a badge in the Bazaar
            and can&apos;t be started — buying, vouchers and the Rotation lane all wait — until its
            prerequisite is marked Finished, at which point it unlocks by itself. Chains work too
            (each sequel locked behind the one before it); loops are politely refused.
          </Section>

          <Section icon={Search} title="Find any game">
            <p>
              Once your collection grows, the <strong className="text-ink">search bar</strong> in the
              header finds any game instantly by title, platform, or franchise. As you type, the
              current board narrows to matching games; press Enter to see every match across your
              Wishlist, Bazaar, Now Playing and Finished at once — each tagged with where it lives.
            </p>
            <p>
              Searching for something you don&apos;t own yet? Jump straight from the results to{" "}
              <strong className="text-ink">adding it</strong>. The same search works when you visit
              another player, scoped to their library.
            </p>
          </Section>

          <Section icon={Tent} title="Market Square">
            <p>
              The community&apos;s town square. <strong className="text-ink">Fresh Clears</strong>{" "}
              streams finished games from across the whole community — and anyone can{" "}
              <strong className="text-ink">Cheer</strong> one, friend or stranger.{" "}
              <strong className="text-ink">Talk of the Bazaar</strong> collects the newest written
              reviews, <strong className="text-ink">Hot This Week</strong> shows the titles the
              community is adding, finishing, liking and reviewing right now,{" "}
              <strong className="text-ink">Curated Stalls</strong> browses players&apos; public
              game lists, and the <strong className="text-ink">Stall of the Week</strong>{" "}
              celebrates whoever cleared the most games in the last seven days.
            </p>
            <p>
              Only <em>fresh</em> clears show. Your{" "}
              <strong className="text-ink">Beat</strong> and{" "}
              <strong className="text-ink">Completed</strong> milestones decide when a clear
              happened, so logging a game you finished years ago — or backdating its milestone
              afterwards — keeps it out of the community feed and counts it in the year it really
              belongs to. Change the date again and everything follows.
            </p>
            <p>
              Beside the feed, the stalls directory shows players with their stall open right now
              (online, with what they&apos;re up to) pinned on top, and every other stall below,
              sorted by recent activity, most clears, or name. Tap any player — in the Square or on
              the Requests board — to visit their Bazaar, browse their boards, and search their
              library (read-only, in their own theme). Prefer to lurk? &ldquo;Appear offline&rdquo;
              hides your presence, and &ldquo;Keep my clears out of the Market Square&rdquo; (both
              in Account settings) keeps your finishes off the community feed — your friends&apos;
              own activity feed still sees them.
            </p>
          </Section>

          <Section icon={Users} title="Friends, feed & messages">
            Find players by name and add them as friends to see their coins and what they&apos;re
            playing. The <strong className="text-ink">Friends</strong> panel (top bar) also carries an{" "}
            <strong className="text-ink">activity feed</strong> of your friends&apos; milestones —
            games imported, new Game Families, and finishes — which you can{" "}
            <strong className="text-ink">Cheer</strong>. The{" "}
            <strong className="text-ink">Messages</strong> inbox is a chat with each friend: reply,
            edit your last message, or type <strong className="text-ink">@</strong> to share a game
            card they can preview or add. Removing a chat just hides it — the history returns if you
            talk again. While visiting a friend&apos;s Bazaar you can also{" "}
            <strong className="text-ink">Back a Game</strong>: stake up to <Coin n={sponsorMaxStake} />{" "}
            of your own coins on one of their backlog games — they claim the stake as a bonus on top
            of the bounty by finishing it, and if it goes unclaimed for {sponsorExpiryDays} days the
            coins simply return to you. Control what others see with the privacy toggles in Account
            settings.
          </Section>

          <Section icon={Lightbulb} title="Help build the catalog">
            Game details are shared by everyone. Spot something wrong or missing? Use{" "}
            <strong className="text-ink">Suggest edit</strong> on any game, or suggest a game that
            isn&apos;t listed yet. A moderator reviews each suggestion; once approved it updates the
            game for all players and you earn up to <Coin n={submissionReward} /> (less if only some
            of your changes are accepted).
          </Section>

          <Section icon={Palette} title="Make it yours">
            Pick a theme and upload a profile picture from your Account page — your theme follows
            you across devices and is what visitors see. You can also hide your real-money spend
            from visitors in Account settings, and <strong className="text-ink">mark any individual
            game private</strong> (from its card menu) so it stays off your public boards and out of
            a visitor&apos;s search — it still counts toward your own boards, stats and coins. Want
            out entirely? <strong className="text-ink">Make my profile private</strong> in Account
            settings takes you out of the Market Square and blocks all visits — even from friends —
            while friendships and messages keep working.
          </Section>

          <Section icon={Lightbulb} title="Requests & bugs">
            Have an idea or hit a snag? Post it on the board and upvote others. Check{" "}
            <strong className="text-ink">What&apos;s new</strong> for the latest updates.
          </Section>
        </div>
      </div>
    </div>
  );
}
