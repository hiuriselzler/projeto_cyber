/**
 * Package, global and syntax fences for the mobile app — task 001 § Boundary rules.
 *
 * Each sensitive capability has exactly one home and is banned everywhere else. Flat config replaces a
 * rule's options rather than merging them, so eslint.config.js builds one combined option list per
 * folder from this table. Every message carries its [fence:id], and scripts/check-lint-fixtures.mjs
 * proves each fence against a known-bad fixture by that tag.
 */

/** The folders of apps/mobile with rules of their own. `app` is the expo-router routes folder. */
const FOLDERS = ['app', 'features', 'account', 'domain', 'db', 'sync', 'recording', 'crypto', 'ui', 'platform'];

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
];

/** Rules that apply inside one folder only, on top of the fences. */
const folderRules = {
  domain: {
    id: 'domain-purity',
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
  db: {
    id: 'db-no-react',
    reason: 'src/db holds no React',
    imports: [{ name: 'react' }, { name: 'react-native' }],
    patterns: ['react/*', 'react-native/*'],
  },
};

/** Folders where keys, passwords and tokens pass through (04 §9). */
const NO_CONSOLE_FOLDERS = ['crypto', 'sync', 'account'];

module.exports = { FOLDERS, fences, folderRules, NO_CONSOLE_FOLDERS };
