/**
 * Package, global and syntax fences for the mobile app — task 001 § Boundary rules, ADR-014.
 *
 * Each sensitive capability has exactly one home and is banned everywhere else. Flat config replaces a
 * rule's options rather than merging them, so eslint.config.js builds one combined option list per
 * folder from this table. Every message carries its [fence:id], and scripts/check-lint-fixtures.mjs
 * proves each fence against a known-bad fixture by that tag.
 */

/** The folders of apps/mobile with rules of their own. `app` is the expo-router routes folder. */
const FOLDERS = ['app', 'features', 'account', 'domain', 'db', 'sync', 'recording', 'crypto', 'ui', 'platform'];

/**
 * Parts of a folder exempt from exactly one rule, by name (ADR-014). A sub-scope inherits every other rule of its
 * folder: its lint block is built from the same tables, never copied, so an exemption cannot switch off a neighbour.
 */
const SUBSCOPES = [
  // The one token file: the only place a colour, type size or duration may be written (INV-23).
  { name: 'ui/tokens.ts', files: ['**/src/ui/tokens.ts'] },
  // Debug-only and developer-facing, never in a release bundle: not user-facing text (INV-27).
  { name: 'features/diagnostics', files: ['**/src/features/diagnostics/**/*.{js,jsx,ts,tsx}'] },
];

// Props whose string is read by the user, or read aloud to them.
const USER_FACING_PROPS = '/^(?:accessibilityLabel|accessibilityHint|placeholder|title|label|aria-label)$/';
const HAS_A_LETTER = '/[A-Za-z]/';
// Where a string is shown or spoken exactly as written. A string passed to a call — the key in `t('a11y.rir')` — is
// not, so only a value sitting directly in these places, or directly in a ternary or `&&` there, counts.
const SHOWN = [
  'JSXElement > JSXExpressionContainer',
  'JSXFragment > JSXExpressionContainer',
  `JSXAttribute[name.name=${USER_FACING_PROPS}] > JSXExpressionContainer`,
];

const fences = [
  {
    id: 'platform-api',
    allowedIn: ['platform'],
    reason: 'only src/platform knows the operating system (INV-28)',
    // Banning the import, not only Platform.OS, also catches Platform.select and Platform.Version —
    // and a namespace import of react-native, which no-restricted-imports rejects once Platform is named.
    imports: [{ name: 'react-native', importNames: ['Platform'] }, { name: 'expo-device' }],
  },
  {
    id: 'network',
    allowedIn: ['sync'],
    reason: 'src/sync is the only folder that talks to the network',
    globals: ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource'],
    properties: [
      { object: 'globalThis', property: 'fetch' },
      { object: 'window', property: 'fetch' },
    ],
    imports: [
      { name: 'axios' },
      { name: 'cross-fetch' },
      { name: 'expo/fetch' },
      { name: 'ky' },
      { name: 'node-fetch' },
      { name: 'superagent' },
      { name: 'undici' },
    ],
  },
  {
    id: 'sql',
    allowedIn: ['db'],
    reason: 'no SQL outside src/db',
    imports: [{ name: 'expo-sqlite' }, { name: 'drizzle-orm' }],
    patterns: ['expo-sqlite/*', 'drizzle-orm/*'],
  },
  {
    id: 'crypto',
    allowedIn: ['crypto'],
    reason: 'cryptography has one home, src/crypto (ADR-007)',
    imports: [
      { name: 'crypto-js' },
      { name: 'expo-crypto' },
      { name: 'libsodium-wrappers' },
      { name: 'libsodium-wrappers-sumo' },
      { name: 'react-native-libsodium' },
      { name: 'tweetnacl' },
    ],
    patterns: ['@noble/*'],
  },
  {
    id: 'secure-storage',
    allowedIn: ['crypto', 'sync'],
    reason: 'secure storage holds the privacy key and the session tokens, and nothing else',
    imports: [{ name: 'expo-secure-store' }],
  },
  {
    // src/sync may use secure storage for session tokens, so the import fence alone would let it read the key too.
    id: 'privacy-key-storage',
    allowedIn: ['crypto'],
    reason: 'only src/crypto reads or writes the privacy key in secure storage (ADR-007)',
    syntax: [{ selector: 'Literal[value=/cyberathlete\\.privacy-key/]', what: "the privacy key's storage name" }],
  },
  {
    id: 'location',
    allowedIn: ['recording', 'platform'],
    reason: 'location is the most sensitive asset; no feature requests it on its own (04 §1)',
    imports: [{ name: 'expo-location' }, { name: 'expo-task-manager' }],
  },
  {
    id: 'core-binding',
    allowedIn: ['domain'],
    reason: 'only src/domain imports the core-rs binding (ADR-012)',
    imports: [{ name: '@cyberathlete/core' }],
    patterns: ['@cyberathlete/core/*'],
  },
  {
    id: 'design-tokens',
    allowedIn: ['ui/tokens.ts'],
    reason: 'colours, type sizes and durations are written only in src/ui/tokens.ts (INV-23, ADR-014)',
    syntax: [
      { selector: 'Literal[value=/^#[0-9a-fA-F]+$/]', what: 'a hex colour' },
      { selector: 'Literal[value=/^(?:rgba?|hsla?)\\(/i]', what: 'an rgb() or hsl() colour' },
      {
        selector: 'Property[key.name=/[cC]olor$/] > Literal[value=/^(?!transparent$)/]',
        what: 'a colour property set to a string',
      },
      {
        selector: 'JSXAttribute[name.name=/[cC]olor$/] > Literal[value=/^(?!transparent$)/]',
        what: 'a colour prop set to a string',
      },
      {
        selector: 'Property[key.name=/^(?:fontSize|lineHeight|letterSpacing)$/] > :matches(Literal, UnaryExpression)',
        what: 'a literal type size',
      },
      // Zero is allowed: it is no animation at all, not a design value.
      {
        selector: 'Property[key.name=/^(?:duration|delay)$/] > :matches(Literal[value!=0], UnaryExpression)',
        what: 'a literal animation duration',
      },
      {
        selector: 'CallExpression[callee.property.name=/^(?:duration|delay)$/] > Literal[value!=0]',
        what: 'a literal animation duration',
      },
    ],
  },
  {
    id: 'no-bounce',
    allowedIn: [],
    reason: 'no spring anywhere: motion is a timing on the house curve (07 §7, ADR-014)',
    imports: [{ name: 'react-native-reanimated', importNames: ['withSpring'] }],
    properties: [
      { object: 'Animated', property: 'spring' },
      { object: 'LayoutAnimation', property: 'spring' },
    ],
    syntax: [{ selector: "CallExpression[callee.property.name='springify']", what: 'springify()' }],
  },
];

/** Rules that apply inside the named folders only, on top of the fences. */
const folderRules = [
  {
    id: 'domain-purity',
    appliesIn: ['domain'],
    reason: 'src/domain is pure: no React, no Expo, no clock, no randomness (INV-10)',
    imports: [{ name: 'react' }, { name: 'react-native' }, { name: 'expo' }],
    patterns: ['react/*', 'react-native/*', 'expo-*', '@expo/*'],
    properties: [
      { object: 'Date', property: 'now' },
      { object: 'Math', property: 'random' },
      { object: 'performance', property: 'now' },
    ],
    syntax: [
      {
        selector: "NewExpression[callee.name='Date'][arguments.length=0]",
        what: 'new Date() with no argument reads the clock; pass `now` in',
      },
    ],
  },
  {
    id: 'db-no-react',
    appliesIn: ['db'],
    reason: 'src/db holds no React',
    imports: [{ name: 'react' }, { name: 'react-native' }],
    patterns: ['react/*', 'react-native/*'],
  },
  {
    id: 'literal-strings',
    appliesIn: ['ui', 'features'],
    exemptIn: ['features/diagnostics'],
    reason: 'no user-facing string is hardcoded; render a catalog key (INV-27)',
    syntax: [
      { selector: `JSXText[value=${HAS_A_LETTER}]`, what: 'literal text in JSX' },
      { selector: `JSXAttribute[name.name=${USER_FACING_PROPS}] > Literal[value=${HAS_A_LETTER}]`, what: 'a literal user-facing prop' },
      ...SHOWN.flatMap((place) => [
        { selector: `${place} > Literal[value=${HAS_A_LETTER}]`, what: 'a literal string shown to the user' },
        { selector: `${place} > :matches(ConditionalExpression, LogicalExpression) > Literal[value=${HAS_A_LETTER}]`, what: 'a literal string shown to the user' },
        { selector: `${place} > TemplateLiteral > TemplateElement[value.raw=${HAS_A_LETTER}]`, what: 'a template string shown to the user' },
      ]),
    ],
  },
];

/** Folders where keys, passwords and tokens pass through (04 §9). */
const NO_CONSOLE_FOLDERS = ['crypto', 'sync', 'account'];

module.exports = { FOLDERS, SUBSCOPES, fences, folderRules, NO_CONSOLE_FOLDERS };
