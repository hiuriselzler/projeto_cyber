/**
 * Matching what someone typed against what a thing is called — in either language.
 *
 * [ADR-008](../../../../../docs/decisions/ADR-008.md): **search matches the translated name and the English one.**
 * Brazilian gym vocabulary mixes the two freely — *supino* and *leg press* in the same sentence — so a pt-BR user
 * must find the bench press by typing either, and that is one of task 004's acceptance criteria.
 *
 * Lives in `src/ui/i18n/` because it is about text in a locale, and carries no feature knowledge: it matches
 * strings, and the caller decides which strings a given row is known by. For a **global** exercise those are its
 * translated names in every catalog; for a **user** exercise it is the one name they typed, never translated
 * (INV-27).
 */

/**
 * Accents are a typing convenience, not a distinction the searcher meant.
 *
 * Someone hunting for *tríceps* on a phone keyboard will type `triceps`, and *supino* and *supinó* should not be
 * different searches. Decomposing to NFD and dropping the combining marks folds every accented Latin letter onto
 * its base, which covers Portuguese completely.
 *
 * The combining range is written out rather than matched with `\p{Diacritic}`: Unicode property escapes are not
 * something to assume of Hermes, and `[̀-ͯ]` needs nothing beyond ordinary regex. Whether
 * `String.prototype.normalize` itself is present under Hermes is a device check — hence the guard, which degrades
 * to case folding alone rather than throwing inside a keystroke handler.
 */
export function foldForSearch(value: string): string {
  const lowered = value.toLowerCase().trim();
  // The doubt is Hermes, not the type system: TypeScript is certain `normalize` exists because the lib says so.
  if (typeof lowered.normalize !== 'function') return lowered;
  return lowered.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Whether any of the names a row is known by contains the query.
 *
 * Substring rather than prefix, because *bench* should find "Incline Barbell Bench Press" — the word someone
 * remembers is rarely the first one. An empty query matches everything, so clearing the box restores the catalog
 * rather than emptying it.
 *
 * Multi-word queries match on **every** word, in any order and any field: "bench incline" and "incline bench" both
 * find the same exercise, which is what someone typing quickly expects.
 */
export function matchesSearch(names: readonly string[], query: string): boolean {
  const words = foldForSearch(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;

  const haystack = names.map(foldForSearch);
  return words.every((word) => haystack.some((name) => name.includes(word)));
}
