# Cosmetics admin preview

Open **Manage → Shop → Open cosmetics preview** with `shop.manage` permission.
The shop can remain closed. Other users retain the existing storefront.

This is the first review milestone for the cosmetics redesign: an interactive,
disposable design preview, not a release of persistent wardrobe or catalog edits.

## What to review

- **My Cosmetics:** all held titles and purchased cosmetics, including retired
  pieces; search/category/collection filters; four outfit slots; combined profile
  preview; try-on, defaults, undo, and apply within the preview. A compact preview
  follows pending outfit changes while browsing.
- **Shop preview:** a simulation of the open storefront, including availability
  rules, collection browsing, try-on and purchases using a separate preview wallet.
- **Catalog drafts:** visual cards, search and filters, creation, duplication,
  visual style selection, title effects (including clearing one), prices, scheduling,
  and retirement. Saves update only the current preview session.
- **Collections:** names, descriptions, existing reward titles, and membership
  editing. Membership and reward checks simulate the current active-member rule.
- **Preview tools:** load a full simulated inventory, add preview coins, or reset
  the session. Actual holdings are the default.

Leaving the preview or refreshing discards the session. No localStorage or backend
draft persistence is introduced. The screen labels this explicitly.

## Access and data boundaries

- The entry and the preview itself require the existing `shop.manage` permission.
  This is a new presentation of the catalog already readable by that permission;
  it adds no new server privilege or write capability.
- Lazy loading keeps the preview code out of the initial application bundle.
- Catalog, sets, and badges are read under existing RLS. Receipt and held-badge
  reads are explicitly scoped to the current account, including for managers who
  may read other users' receipts. Revoked titles are excluded from the wardrobe.
- Loading failures show a retry state rather than a misleading partial inventory.
- Account changes reset the session; permission removal unmounts the preview.
- There are no calls to live purchase, equip, title-selection, item-save, or
  shop-open actions. The simulation never updates the Zustand store.
- No migrations, real data changes, new real-world events, or backfills occur.
  No audit rows are needed for disposable local interactions. The existing stock
  manager remains available separately and keeps its normal server audit behavior.
- No public changelog entry or How it works change: this milestone is admin-only.

## Before a public/persistent release

Feedback on this preview should settle the wardrobe and catalog interactions first.
The next implementation milestone must add atomic, ownership-validated outfit
application with append-only history, separately assignable permissions for new
server capabilities, and persistent draft/publish rules that protect owned items.
It must also settle stable collection membership/rewards rather than silently
changing the current rule. Saved outfits, milestone-earned non-title cosmetics,
bulk scheduling, and a custom visual authoring system are outside this preview.

The preview intentionally does not claim collection rewards based on a filtered
customer shelf. Simulated purchase completion includes every active member,
including hidden stock. The original storefront and server are unchanged.

## Profile and Community placement (admin review)

Stall decoration belongs on Community cards, not the large profile header.
The workshop now shows separate profile and Community previews. The profile
uses the reviewer's existing banner and profile colors; its frame, title, and
coin remain visible. Changing a stall does not change the profile preview.

For viewers with `shop.manage`, the actual Profile page also omits stall styling
and ornaments, on both own and visited profiles (with or without a banner).
Their own Market Square directory and Stall of the Week cards now display
equipped stall decorations while retaining the 'you' label and disabled
self-navigation. Other viewers retain the previous rendering until rollout.

These changes only control rendering. Banner images, profile colors, equipment,
and ownership records are untouched; no new events or backfills occur. On public
rollout, update the shop description and How it works copy to describe Community
placement and add a public release note.

Automated coverage covers pure availability/ownership/purchase rules, UI session
isolation, draft editing, collection membership, permission/account changes, and
mocked cloud loading. Browser checks use disposable fixture data at desktop and
360px phone widths, without a real account or database writes.
