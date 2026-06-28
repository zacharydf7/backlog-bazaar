// The emoji reaction palette, in display order. Shared by feature/bug comments and
// direct messages. Mirrored by the DB check constraints on `comment_reactions.emoji`
// and `message_reactions.emoji` (and the toggle_message_reaction guard) — keep all
// of them in sync if this list changes.
export const REACTIONS = ["👍", "❤️", "🎉", "😄"] as const;

export type Reaction = (typeof REACTIONS)[number];
