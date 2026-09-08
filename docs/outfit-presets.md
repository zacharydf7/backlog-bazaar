# Saved outfit presets: admin early access

Open **Manage → Shop → Open My Cosmetics → Saved looks**. This milestone adds
private named presets to the real wardrobe; it does not change public access or
open the shop.

- **Save this look** captures the current try-on when the name form opens. Saving
  does not equip anything. The name can be up to 60 characters.
- **Preview look** loads its four slots into the existing wardrobe preview. Use
  the single **Apply outfit** action to wear it, with the same server ownership
  and concurrent-edit checks as a manually assembled outfit.
- **Rename** changes only the name. **Replace with try-on** asks for confirmation
  before replacing the saved pieces. Previous versions remain in event history.
- **Archive** hides the preset from active looks; **Show archived looks → Restore**
  brings it back. There is no hard-delete action.
- A revoked title or missing piece does not erase or silently alter a preset.
  The card flags the affected slots. Preview it, choose replacements or defaults,
  then apply or replace the preset. Renaming and archive/restore remain available.
- Failed saves retain the name form. Concurrent edits require reloading; new
  presets use stable client-generated IDs to prevent duplicate creation on retry.

## Permission and migration

The UI, table reads, and RPCs require `shop.manage`, `shop.wardrobe`, and the new
`shop.presets` permission. Super-admins have all implicitly. Existing custom roles
must receive the new key through Roles; no role assignments are backfilled.

The **Saved outfit presets** schema section adds `outfit_presets`, append-only
`outfit_preset_events`, two write RPCs, and a private ownership validator shared
with Apply outfit. It makes no changes to existing equipment, user balances,
catalog items, purchases, or titles, and performs no backfill.

Only the owner's authenticated RPC can change a preset. Table writes are revoked
from clients. Reads are scoped to the owner's account and early-access gates.
Create, rename, replacement, archive, and restore record timestamped before/after
snapshots through a server trigger. Event writes are append-only and share the
preset transaction. History is readable by its owner or shop managers.

Expected version numbers prevent stale tabs from overwriting newer edits.
Saving new or replaced pieces checks actual ownership, including retired stock;
an unchanged stale preset may still be renamed without losing its original look.

Apply this schema before deploying the UI. This admin milestone has no public
release note. Persistent collection drafts are the next planned milestone.
