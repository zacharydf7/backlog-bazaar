# Persistent collection drafts

Open **Manage → Shop → Open collection drafts**. This admin workspace saves
collection names, stories, reward titles, and member selections as immutable
revisions. It uses existing catalog items and existing shop reward titles; it
does not bundle unpublished item drafts or change prices and schedules.

1. Start from a live collection or a new collection.
2. Edit its metadata and members, then save a revision. Reopening restores the
   saved selection, not the current live membership.
3. Review metadata changes, additions/removals/moves, and active-piece counts for
   every affected collection. Retired members remain selectable but do not count
   toward the current reward requirement.
4. Acknowledge the effect on requirements and confirm publication. The collection
   and all membership changes publish in one transaction.

Saving never changes the live catalog. Publishing keeps purchases, equipment,
balances, and existing reward grants intact. It neither opens the shop nor grants
rewards retroactively. The existing rule still checks every active member on a
future purchase in the collection. An empty or already-completed collection may
therefore have no new purchase to trigger a reward; this milestone does not change
that rule. Stable reward requirements are a separate shop-reopening decision.

## Permissions

All access requires `shop.manage`, plus `shop.collections.drafts` to start/save
or `shop.collections.publish` to publish. Either extra key permits reading draft
revisions. Super-admins have both; existing custom roles need the new keys assigned
manually through Roles. No role assignments are changed by this migration.

## Data preservation and conflicts

`shop_collection_draft_revisions` records every start/save/publication with a
timestamp, actor, original catalog snapshot, and payload. Clients cannot insert,
update, or delete these rows directly. Publication also appends an admin audit
event containing before/after details and affected collection keys.

The server checks the latest draft revision and compares affected items,
collections, and the selected reward with their original snapshots. This includes
new members added to affected source collections. Unrelated collections do not
invalidate a draft. Existing collection keys cannot change. New keys cannot take
over an existing collection. Rewards must refer to an unchanged shop badge.

Purchases hold catalog read locks until completion; collection publication takes
conflicting write locks. A purchase cannot combine membership from before a
publication with reward definitions from after it. Failed audit writes roll back
the entire publication.

## Schema reapplication

The migration adds a revision table and four RPCs; it performs no backfill or
membership rewrite. Future explicit publication updates only the target collection
row, removed target members, and selected members whose collection changes.

Seasonal seed enrollment now tracks only items inserted during that seed run.
Existing memberships, including intentional removals, are preserved on later
schema applications. Collection stories are also left to the editor rather than
rewritten by the old spelling migration. New databases retain seeded collections.

Apply the schema before deploying. Tests execute the real SQL twice offline,
exercise publication/conflicts/access/audit rollback, check purchase locks, and
reapply seasonal seeds after manual collection edits. UI/API tests cover revision
saves, review acknowledgment, permission checks, and failed-save recovery.

This is admin-only, so there is no public release note or economy wording change.
