import { type ReactNode } from "react";
import {
  ShieldCheck,
  Database,
  Cookie,
  Share2,
  Clock,
  UserCheck,
  Flag,
  Baby,
  Lock,
  Globe,
  RefreshCw,
  Mail,
  type LucideIcon,
} from "lucide-react";

// A plain-language privacy policy covering the common GDPR (EU/UK) and
// California (CCPA/CPRA) disclosures, tailored to what Backlog Bazaar actually
// collects: an email-based account, the profile + game library you enter, and
// the technical data any web app needs to run. Update LAST_UPDATED whenever the
// substance changes. This is informational, not a substitute for legal advice.

const LAST_UPDATED = "June 23, 2026";

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

/** A privacy-policy page (reached via "Privacy" in the sidebar). Covers what we
 *  collect, how it's used, who it's shared with, and your rights under GDPR and
 *  California law. */
export function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-3xl overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="border-b border-line p-4">
        <h2 className="inline-flex items-center gap-2 font-display text-xl text-ink">
          <ShieldCheck size={18} className="text-accent" /> Privacy Policy
        </h2>
        <p className="mt-1 text-xs text-subtle">Last updated {LAST_UPDATED}</p>
      </div>

      <div className="flex flex-col gap-7 p-5">
        <p className="text-sm leading-relaxed text-muted">
          Backlog Bazaar (&ldquo;we,&rdquo; &ldquo;us&rdquo;) is a personal game-backlog tracker.
          This policy explains what information we collect when you use the app, why we collect it,
          how it&apos;s protected, and the choices and rights you have over it. We aim to collect as
          little as possible — there are no ads, and we never sell your data.
        </p>

        <Section icon={Database} title="Information we collect">
          <ul className="ml-4 list-disc space-y-1">
            <li>
              <span className="text-ink">Account data.</span> When you sign in we store the email
              address tied to your account so we can authenticate you.
            </li>
            <li>
              <span className="text-ink">Profile data.</span> A display name, an optional avatar
              image, your chosen theme, and any privacy preferences you set.
            </li>
            <li>
              <span className="text-ink">Your library &amp; activity.</span> The games you add,
              their status and playtime, copies and costs you record, in-app coins and charters,
              notes, catalog suggestions, and any feature requests, bug reports, comments, or
              reactions you post.
            </li>
            <li>
              <span className="text-ink">Uploaded images.</span> Cover art or screenshots you upload
              for your games or contributions.
            </li>
            <li>
              <span className="text-ink">Technical data.</span> Basic information your browser sends
              (such as approximate request metadata) and data we keep in your browser&apos;s local
              storage to remember your session and preferences.
            </li>
          </ul>
        </Section>

        <Section icon={UserCheck} title="How we use your information">
          <ul className="ml-4 list-disc space-y-1">
            <li>To create your account, sign you in, and keep your session active.</li>
            <li>To store and display your game library, profile, and progress.</li>
            <li>
              To run features you ask for — leaderboards, visiting other players&apos; public
              shelves, catalog moderation, and notifications.
            </li>
            <li>To keep the service secure, prevent abuse, and fix problems.</li>
          </ul>
          <p>
            We do not use your information for advertising, and we do not sell or rent it to anyone.
          </p>
        </Section>

        <Section icon={Flag} title="Legal bases (EU/UK users)">
          <p>
            Where the GDPR applies, we process your data on these bases: to{" "}
            <span className="text-ink">perform our agreement</span> with you (providing the app you
            signed up for), our <span className="text-ink">legitimate interests</span> (keeping the
            service secure and working), your <span className="text-ink">consent</span> where we ask
            for it, and to meet any <span className="text-ink">legal obligations</span>.
          </p>
        </Section>

        <Section icon={Cookie} title="Cookies &amp; local storage">
          <p>
            We don&apos;t use advertising or tracking cookies. We do use your browser&apos;s local
            storage and similar essential mechanisms to keep you signed in and remember preferences
            like your theme. Clearing your browser storage will sign you out and reset those
            preferences.
          </p>
        </Section>

        <Section icon={Share2} title="How information is shared">
          <ul className="ml-4 list-disc space-y-1">
            <li>
              <span className="text-ink">Service providers.</span> We use a cloud database and
              hosting provider (Supabase) to store data and run the app on our behalf. They process
              data only to provide that service.
            </li>
            <li>
              <span className="text-ink">Other players.</span> Some details are public by design —
              your display name, avatar, finished-game stats, leaderboard standing, and posts you
              make to the requests board. You can hide certain data (like real-world spend) in your
              privacy settings.
            </li>
            <li>
              <span className="text-ink">Legal reasons.</span> We may disclose information if
              required by law or to protect the safety and rights of our users.
            </li>
          </ul>
        </Section>

        <Section icon={Clock} title="Data retention">
          <p>
            We keep your information for as long as your account is active. Some actions are recorded
            in an append-only history (for example, coin transactions and game status changes) so the
            app can show accurate totals and timelines. If you delete your account, we remove your
            personal data, except where we must keep limited records to comply with the law or
            resolve disputes.
          </p>
        </Section>

        <Section icon={ShieldCheck} title="Your privacy rights">
          <p>
            Depending on where you live, you may have the right to access, correct, export, or delete
            your personal data, and to object to or restrict certain processing. To exercise any of
            these, contact us (below) and we&apos;ll respond as required by law. You won&apos;t be
            treated differently for exercising your rights.
          </p>
        </Section>

        <Section icon={Flag} title="California privacy rights (CCPA/CPRA)">
          <p>
            California residents have the right to know what personal information we collect and how
            it&apos;s used, to request deletion or correction, and to opt out of the sale or sharing
            of personal information. <span className="text-ink">We do not sell or share your
            personal information</span> as those terms are defined under California law, and we
            don&apos;t use it for cross-context behavioral advertising. We won&apos;t discriminate
            against you for exercising these rights.
          </p>
        </Section>

        <Section icon={Baby} title="Children's privacy">
          <p>
            Backlog Bazaar isn&apos;t directed to children under 13 (or the minimum age in your
            region), and we don&apos;t knowingly collect their data. If you believe a child has
            given us personal information, contact us and we&apos;ll delete it.
          </p>
        </Section>

        <Section icon={Lock} title="Security">
          <p>
            We rely on industry-standard measures — encrypted connections, authenticated access, and
            database-level access controls — to protect your data. No method of transmission or
            storage is perfectly secure, but we work to keep your information safe.
          </p>
        </Section>

        <Section icon={Globe} title="International data transfers">
          <p>
            Our hosting provider may process and store data in countries other than your own. Where
            required, we rely on appropriate safeguards for those transfers.
          </p>
        </Section>

        <Section icon={RefreshCw} title="Changes to this policy">
          <p>
            We may update this policy as the app evolves. When we make a material change, we&apos;ll
            revise the &ldquo;Last updated&rdquo; date above and, where appropriate, note it in the
            app&apos;s What&apos;s New panel.
          </p>
        </Section>

        <Section icon={Mail} title="Contact us">
          <p>
            Questions or requests about your privacy? Use the{" "}
            <span className="text-ink">Requests &amp; bugs</span> page in the app to reach the site
            operator, and we&apos;ll get back to you.
          </p>
        </Section>

        <p className="text-xs leading-relaxed text-subtle">
          This page is provided for general informational purposes and isn&apos;t legal advice.
        </p>
      </div>
    </div>
  );
}
