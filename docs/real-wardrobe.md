# My Cosmetics: admin early access

Open **Manage → Shop → Open My Cosmetics**. This is the real wardrobe; the
existing cosmetics workshop remains a separate disposable simulation.

The entry and server action require `shop.manage` and `shop.wardrobe`. Super-admins
have both implicitly. Existing roles need the new permission assigned manually
through Roles; the migration does not change role assignments.

## Behavior

- All owned cosmetics are available, including retired/off-sale pieces and held
  earned titles. Revoked titles are excluded.
- Search and category/collection filters change the list, not the outfit.
- Try-on and defaults stay local until **Apply outfit**. One toolbar applies or
  undoes the whole look. Leaving/reloading prompts before discarding try-on.
- Apply saves the actual title, frame, stall, and coin together. These choices
  are real equipment and can be seen by others through existing surfaces; only
  the new wardrobe interface is restricted to admin early access.
- Profile previews preserve banners and colors; Community cards display stalls.
  Existing admin-view placement rules remain in effect. Public placement rollout
  is separate from this milestone.
- Failed saves keep the try-on intact. A stale outfit from another tab/device
  is rejected; reload and make a new selection instead of overwriting it.
- Defaults are null selections and need no purchase. The shop can stay closed.

## Database and history

The **Atomic wardrobe application** section of `supabase/schema.sql` adds
`outfit_events`, a profile update trigger, and `apply_wardrobe(jsonb,jsonb)`.
Apply the schema before deploying the UI. No backfill, catalog rewrite, ownership
change, balance change, or existing equipment change is performed by this addition.

The RPC locks the caller's profile, compares the expected four-slot outfit, then
validates active title grants and purchased cosmetics of the correct category.
Ownership rows are held with share locks during the operation. One profile update
saves all four slots, with no availability restriction on past purchases.

The trigger appends timestamped old/new outfits and item/title appearance snapshots.
It also captures future changes through existing single-slot controls. Unchanged
outfits create no duplicate event. Event rows survive source cosmetic changes,
and user deletion clears user/actor references rather than deleting history.
Clients may read their own events; shop managers may read all. Clients have no
insert/update/delete access. The event and outfit change share one transaction.

## Verification

Offline PostgreSQL tests run the actual migration twice and exercise successful
four-slot changes, wrong categories, missing ownership, revoked titles, conflicts,
defaults, permissions, and append-only history. Mocked API/UI tests verify
account-scoped loading, no optimistic equipment writes, one Apply request,
failure recovery, filters, and permission/account changes.

This admin milestone needs no public release note or economy documentation change.
[Saved outfit presets](outfit-presets.md) are a separate admin milestone. Public
wardrobe rollout remains future work.
