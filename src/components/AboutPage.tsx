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
  Infinity as InfinityIcon,
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
              Everything you plan to play, each with a coin price. The cheapest games are the older,
              shorter ones — easy wins to clear first.
            </Section>
            <Section icon={Gamepad2} title="3 · Buy a game to start it">
              Spend coins to move a game into <strong className="text-ink">Now Playing</strong>. You
              begin with <Coin n={STARTING_COINS} /> and a couple of{" "}
              <strong className="text-ink">Free Game Vouchers</strong> — each starts a Bazaar game
              for free, so you can jump straight into something you&apos;re already playing. You only
              have a few Now Playing slots, so pick deliberately.
            </Section>
            <Section icon={Clock} title="4 · Play and log your time">
              Log the hours you play to keep track of your progress. Logging time doesn&apos;t pay
              coins on its own — the whole payout comes as a bounty when you finish.
            </Section>
            <Section icon={Trophy} title="5 · Finish for the bounty">
              Mark a game finished to collect its <strong className="text-ink">bounty</strong> (at
              least <Coin n={bountyBase} />) and move it to your trophy shelf. Spend those coins on
              your next game, and repeat.
            </Section>
          </div>
        </div>

        <div className="flex flex-col gap-5">
          <Section icon={Coins} title="The coin economy">
            <p>
              A game&apos;s <strong className="text-ink">price</strong> starts at{" "}
              <Coin n={priceBase} /> and rises with the factors the team has dialed in — typically
              how long the game is and how recently it came out, so the cheapest buys are the older,
              shorter games you can clear quickly.
            </p>
            <p>
              Finishing a game pays a <strong className="text-ink">bounty</strong> starting at{" "}
              <Coin n={bountyBase} />. You finish games to earn and spend coins to start new ones —
              roughly enough to afford one new game per game you complete.
            </p>
          </Section>

          <Section icon={Lock} title="Now Playing lanes & Shelve It">
            <p>
              Now Playing is split into four lanes, each with its own limited number of slots — so
              pick deliberately. <strong className="text-ink">Focus</strong> is for the games
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
              bounty on top of the base reward. Each lane has the same small number of slots.
            </p>
            <p>
              When you finish a Focus game and collect its bounty, a quick prompt lets you decide
              what&apos;s next: leave it <strong className="text-ink">Finished</strong>,{" "}
              <strong className="text-ink">Grind to 100%</strong> (into Completionist), or{" "}
              <strong className="text-ink">Convert to Endless</strong> (into Rotation). Every
              finished game shows a status tag — <strong className="text-ink">Beaten</strong> (credits
              rolled), <strong className="text-ink">Completed</strong> (100%), or{" "}
              <strong className="text-ink">Endless</strong> (an ongoing game you retired) — which you
              can change anytime from its card. Changed your mind on a 100% run? Abandon it back to
              Finished (kept as Beaten) — no penalty, no coins.
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
              separate lane that never uses up your focus slots. Add it to Rotation for free, and
              check in <strong className="text-ink">once a week</strong> to collect{" "}
              <Coin n={rotationCheckinReward} />. The week resets every{" "}
              <strong className="text-ink">{resetDayLabel(rotationReset.resetDow)}</strong> (the lane
              shows the countdown), and you can drop a game out of Rotation anytime — no penalty.
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
              {charterResalePct}% of the cost).
            </p>
          </Section>

          <Section icon={Library} title="Copies you own">
            Track which platforms you own a game on and what each one cost. It&apos;s just for your
            records — it never affects the coin economy.
          </Section>

          <Section icon={Package} title="Compilations">
            Bought a collection or bundle that packs several games into one purchase? Use{" "}
            <strong className="text-ink">Add compilation</strong> to record the whole buy once —
            title, total price, platform and format — then list the games inside it. Each game gets
            its own card to buy, play and finish, and the total price is split across them (evenly,
            by length, or however you choose). The split is just for your records — like other
            costs, it never affects the coin economy. Open any card&apos;s &ldquo;Part of …&rdquo;
            badge to see the whole compilation, what you spent, and your total time. Built one worth
            sharing? Suggest it for everyone — once approved, it autocompletes for other players (and
            you earn coins), and they set their own price. Only the title and games are shared, never
            your cost or platform.
          </Section>

          <Section icon={Link2} title="Game Families">
            Link different editions of one game (a remaster, a port, a re-release). Each edition keeps
            its own card and lives on the board matching its own status — a finished older version
            stays on Finished while the port you&apos;re tackling sits in Now Playing — marked with a
            small &ldquo;Family&rdquo; tag. Open any edition to see the family&apos;s combined hours
            and spend and to manage the roster. The family still shares a single Now Playing slot, and
            re-clearing another edition pays a smaller {replayBonusPct}% Replay Bonus instead of the
            full finish bonus.
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

          <Section icon={Trophy} title="Leaderboard">
            See how your coin balance stacks up against other players, and who&apos;s online right
            now and what they&apos;re up to. Tap anyone — on the leaderboard or the
            Requests board — to visit their Bazaar, browse their boards, and search their library
            (read-only, in their own theme). Prefer to lurk? Turn on &ldquo;Appear offline&rdquo; in
            Account settings.
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
            a visitor&apos;s search — it still counts toward your own boards, stats and coins.
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
