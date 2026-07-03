// Pure logic for the type-to-confirm safety gate (DangerConfirmModal): the
// typed phrase must match the required one exactly — no partial or fuzzy
// matches — but forgiving about case and surrounding whitespace, since the
// point is proving intent, not testing typing precision.
export function phraseMatches(input: string, phrase: string): boolean {
  return input.trim().toLowerCase() === phrase.trim().toLowerCase();
}
