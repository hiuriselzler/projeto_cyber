/**
 * ESLint for the mobile app. The boundary rules encode docs/responsibility-map.md and ADR-012, and are
 * proven against known-bad fixtures by `pnpm lint:fixtures` — task 001 § Boundary rules.
 *
 * - Folder rules: eslint-plugin-boundaries (`boundaries/dependencies`).
 * - Package, global and syntax fences: core ESLint rules, generated per folder from eslint/fences.js.
 */
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const boundaries = require('eslint-plugin-boundaries');

const { FOLDERS, SUBSCOPES, fences, folderRules, NO_CONSOLE_FOLDERS } = require('./eslint/fences');

const SOURCE_FILES = '**/*.{js,jsx,ts,tsx}';

function filesOf(folder) {
  // `**/` so that lint-fixtures/src/<folder>/ is classified exactly like src/<folder>/.
  return folder === 'app' ? [`**/app/${SOURCE_FILES}`] : [`**/src/${folder}/${SOURCE_FILES}`];
}

// A rule given only a severity keeps the options of an earlier config block, so an empty list must
// switch the rule off rather than leave the default block's list in force.
function listRule(entries) {
  return entries.length > 0 ? ['error', ...entries] : 'off';
}

/** Whether `scope` — a folder, or a sub-scope such as `ui/tokens.ts` — is named by `list` itself or by its folder. */
function names(list, scope) {
  return scope !== null && (list.includes(scope) || list.includes(scope.split('/')[0]));
}

/**
 * The combined restrictions for one folder or sub-scope (ADR-014), or for files outside every folder when `scope` is
 * null. A sub-scope gets its folder's rules minus only the one that exempts it by name.
 */
function restrictionsFor(scope) {
  const active = fences.filter((fence) => !names(fence.allowedIn, scope));
  const scoped = folderRules.filter((rule) => names(rule.appliesIn, scope) && !(rule.exemptIn ?? []).includes(scope));
  const restrictions = [...active, ...scoped];

  const paths = [];
  const patterns = [];
  const globals = [];
  const properties = [];
  const syntax = [];
  for (const restriction of restrictions) {
    const message = `[fence:${restriction.id}] ${restriction.reason}`;
    for (const entry of restriction.imports ?? []) paths.push({ ...entry, message });
    if (restriction.patterns) patterns.push({ group: restriction.patterns, message });
    for (const name of restriction.globals ?? []) globals.push({ name, message });
    for (const entry of restriction.properties ?? []) properties.push({ ...entry, message });
    for (const entry of restriction.syntax ?? []) {
      syntax.push({ selector: entry.selector, message: `${message}: ${entry.what}` });
    }
  }

  return {
    'no-restricted-imports': paths.length + patterns.length > 0 ? ['error', { paths, patterns }] : 'off',
    'no-restricted-globals': listRule(globals),
    'no-restricted-properties': listRule(properties),
    'no-restricted-syntax': listRule(syntax),
    'no-console': names(NO_CONSOLE_FOLDERS, scope) ? 'error' : 'off',
  };
}

// Folder elements, matched against the right-hand end of each path.
const ELEMENTS = [
  { type: 'routes', pattern: 'app' },
  { type: 'feature', pattern: 'src/features/*', capture: ['feature'] },
  ...['account', 'domain', 'db', 'sync', 'recording', 'crypto', 'ui', 'platform'].map((folder) => ({
    type: folder,
    pattern: `src/${folder}`,
  })),
  // A new folder under src/ may import nothing until it is given rules of its own.
  { type: 'unclassified', pattern: 'src/*', capture: ['folder'] },
];

// The root layout and the two entry points it may call (ADR-012 § Amendment), and the one file of
// src/crypto that src/db may call (ADR-012 § Amendment 2026-09-19).
const FILE_CATEGORIES = [
  { category: 'root-layout', pattern: '**/app/_layout.tsx' },
  { category: 'migration-entry', pattern: '**/src/db/migrate.ts' },
  { category: 'bootstrap-entry', pattern: '**/src/account/bootstrap.ts' },
  { category: 'identifier-entry', pattern: '**/src/crypto/identifiers.ts' },
];

function mayImport(from, to) {
  return { from: { element: { type: from } }, allow: { to: { element: { types: { anyOf: to } } } } };
}

// docs/tasks/001-project-bootstrap.md § Boundary rules, with ADR-012 and its amendment.
const POLICIES = [
  mayImport('routes', ['feature', 'ui']),
  {
    from: { element: { type: 'routes' }, file: { categories: 'root-layout' } },
    allow: {
      to: [
        { element: { type: 'db' }, file: { categories: 'migration-entry' } },
        { element: { type: 'account' }, file: { categories: 'bootstrap-entry' } },
      ],
    },
  },
  {
    from: { element: { type: 'feature' } },
    allow: {
      to: { element: { type: 'feature', captured: { feature: '{{from.element.captured.feature}}' } } },
    },
  },
  mayImport('feature', ['account', 'domain', 'db', 'recording', 'ui', 'platform']),
  mayImport('account', ['sync', 'crypto', 'db', 'domain', 'platform']),
  mayImport('db', ['domain']),
  // Row ids are minted where rows are made, and randomness still has one home (INV-16, ADR-012
  // § Amendment 2026-09-19). One file of crypto/, never its barrel and never the rest of the folder.
  {
    from: { element: { type: 'db' } },
    allow: { to: [{ element: { type: 'crypto' }, file: { categories: 'identifier-entry' } }] },
  },
  mayImport('sync', ['db', 'domain', 'crypto', 'platform']),
  mayImport('recording', ['db', 'domain', 'ui', 'platform']),
  mayImport('ui', ['platform']),
];

module.exports = defineConfig([
  expoConfig,
  {
    ignores: [
      'android/**',
      'ios/**',
      '.expo/**',
      'dist/**',
      'coverage/**',
      'src/db/migrations/**',
      // Known-bad on purpose; linted only by scripts/check-lint-fixtures.mjs.
      'lint-fixtures/**',
    ],
  },
  { files: [SOURCE_FILES], rules: restrictionsFor(null) },
  ...FOLDERS.map((folder) => ({ files: filesOf(folder), rules: restrictionsFor(folder) })),
  // After the folders, so a sub-scope's block replaces its folder's options for its own files (ADR-014).
  ...SUBSCOPES.map(({ name, files }) => ({ files, rules: restrictionsFor(name) })),
  {
    files: [SOURCE_FILES],
    plugins: { boundaries },
    settings: {
      'boundaries/elements': ELEMENTS,
      'boundaries/files': FILE_CATEGORIES,
      'import/resolver': { typescript: { alwaysTryTypes: true, project: './tsconfig.json' } },
    },
    rules: {
      'boundaries/dependencies': ['error', { default: 'disallow', policies: POLICIES }],
    },
  },
]);
