# Saved cosmetic drafts

Open **Manage → Shop → Open saved drafts**. This is separate from the disposable
cosmetics preview. It saves individual cosmetics; collection editing remains in
the simulation and legacy editor.

1. Start from a live cosmetic or a new item. Starting creates revision 1.
2. Edit and save a revision. Close and reopen the workspace to continue later.
3. Review field changes and the cosmetic thumbnail.
4. Publish the saved revision with the final confirmation. Existing items also
   require acknowledgement that changes can affect their current owners.

Starting and saving never change the catalog. Publishing makes real catalog
changes, but does not open the shop or alter purchases, equipment, or balances.
Unsaved form edits are not persisted; a failed save leaves the form intact.
Reload the list after publication to refresh available source items.

## Permissions

All access requires `shop.manage`, plus:

- `shop.drafts`: start and save revisions.
- `shop.publish`: review and publish saved revisions.

Either additional key permits reading drafts. Super-admins implicitly have all
keys. Existing custom roles are not changed by the migration; assign the new
keys through the Roles editor. These keys gate the new workflow only. The legacy
stock editor retains its existing `shop.manage` authorization.

## Database and safeguards

The appended **Persistent cosmetic authoring** section of `supabase/schema.sql`
adds `shop_draft_revisions` and four RPCs. Apply the schema before deploying this
UI. The addition performs no backfill or changes to existing catalog or user rows.
No role assignments are updated. The canonical permission list adds two keys.

Every start/save/publication appends a timestamped revision with its actor and
payload. Clients cannot insert, update, or delete these records directly. Read
access uses the same role checks as the RPCs. Publication also writes the existing
admin audit log. Revisions retain the source item and badge snapshots.

Saving and publishing require the expected latest revision. Publishing checks
the original catalog snapshots and refuses to overwrite intervening edits.
Brief catalog/badge table locks serialize publication against legacy writes.
An existing item's slug and category cannot change. New titles cannot take over
an existing badge. Publication and its audit record are transactional.

Ownership warnings apply to every existing item, including one purchased while
a draft is open. Collection membership and shelf changes warn that current
reward requirements depend on active pieces; existing grants are retained.

## Verification and rollout

Offline PGlite tests execute the actual draft SQL and existing catalog-save RPC:
idempotent migration, immutable revisions, permission/RLS checks, stale revision
and catalog conflicts, rollback, owner acknowledgement, and title effect removal.
Mocked API/UI tests cover response shapes, saving, review, and publication gates.
No shared database is used by these tests.

This is an admin-only milestone, so there is no public release note. Applying
the shared schema and deploying still require approval for this direct request.
