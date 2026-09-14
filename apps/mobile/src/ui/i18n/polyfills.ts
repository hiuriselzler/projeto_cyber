/**
 * ICU plurals need `Intl.PluralRules`, which Hermes does not ship, and its polyfill needs `Intl.Locale` and
 * `Intl.getCanonicalLocales`. Each import installs itself only where the engine lacks the API, so Node — and so the
 * Jest run — keeps its own. Whether they load on a phone is a task 017 check.
 */
import '@formatjs/intl-getcanonicallocales/polyfill.js';
import '@formatjs/intl-locale/polyfill.js';
import '@formatjs/intl-pluralrules/polyfill.js';
import '@formatjs/intl-pluralrules/locale-data/en.js';
import '@formatjs/intl-pluralrules/locale-data/pt.js';
