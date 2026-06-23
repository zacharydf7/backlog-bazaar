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
  Palette,
  Lightbulb,
  HelpCircle,
  type LucideIcon,
} from "lucide-react";
import { useStore } from "../store";
import { CoinIcon } from "./CoinIcon";
import { STARTING_COINS } from "../lib/pricing";

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
  const { shelveRefundPct, replayBonusPct, submissionReward, economy } = useStore();
  const priceBase = economy.price.base;
  const bountyBase = economy.bounty.base;

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
              Browse trending and recommended games and <strong className="text-ink">Send to
              Bazaar</strong> the ones you want to play — or tuck one into your Wishlist for later.
            </Section>
            <Section icon={Store} title="2 · Your Bazaar">
              Everything you plan to play, each with a coin price. The cheapest games are the older,
              shorter ones — easy wins to clear first.
            </Section>
            <Section icon={Gamepad2} title="3 · Buy a game to start it">
              Spend coins to move a game into <strong className="text-ink">Now Playing</strong>. You
              begin with <Coin n={STARTING_COINS} /> and only have a few Now Playing slots, so pick
              deliberately.
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

          <Section icon={Lock} title="Now Playing slots & Shelve It">
            You can only have a handful of games in Now Playing at once — finish or shelve before
            starting another. <strong className="text-ink">Shelve It</strong> drops a game back to
            your Bazaar and refunds {shelveRefundPct}% of what you paid (the rest is forfeit).
          </Section>

          <Section icon={Heart} title="Wishlist">
            Games you can&apos;t play yet — no console for them, or you still need to buy them in
            real life. They wait here, out of your priced Bazaar.
          </Section>

          <Section icon={Library} title="Copies you own">
            Track which platforms you own a game on and what each one cost. It&apos;s just for your
            records — it never affects the coin economy.
          </Section>

          <Section icon={Link2} title="Game Families">
            Link different editions of one game (a remaster, a port, a re-release) and they collapse
            into a single card on your boards — tagged with every platform and opened into per-edition
            tabs. The family sits on one board by its highest-priority edition (Now Playing &gt;
            Bazaar &gt; Wishlist &gt; Finished), shares a single Now Playing slot, and re-clearing
            another edition pays a smaller {replayBonusPct}% Replay Bonus instead of the full finish
            bonus.
          </Section>

          <Section icon={Trophy} title="Leaderboard">
            See how your coin balance stacks up against other players, and who&apos;s online right
            now and what they&apos;re up to. Tap anyone — on the leaderboard or the
            Requests board — to visit their Bazaar and browse their boards (read-only, in their own
            theme). Prefer to lurk? Turn on &ldquo;Appear offline&rdquo; in Account settings.
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
            from visitors in Account settings.
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
