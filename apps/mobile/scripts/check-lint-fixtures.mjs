#!/usr/bin/env node
/**
 * Boundary rules are tested, not trusted (task 001).
 *
 * A mistyped glob switches a rule off while CI stays green. So every file in lint-fixtures/ is linted
 * with the real configuration, and this check fails unless each one is reported exactly as its
 * `// expect:` lines say — the named rule, carrying the named [fence:id] where one is given — and by no
 * other rule. It also fails if any fence, or any folder of the boundaries matrix, has no fixture.
 *
 * import/no-unresolved is the one rule ignored: fixtures import packages the app deliberately never
 * installs, such as expo-location in a feature.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';

import { findMisplacedPlatformFiles } from './check-platform-files.mjs';

const require = createRequire(import.meta.url);
const { fences, folderRules, NO_CONSOLE_FOLDERS } = require('../eslint/fences.js');

const MOBILE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = path.join(MOBILE_ROOT, 'lint-fixtures');
const PLATFORM_FILE_FIXTURES = path.join(FIXTURES, 'platform-files');
const EXPECT_LINE = /^\/\/ expect: (\S+)(?: (\[[^\]]+\]))?\s*$/gm;
const IGNORED_RULES = new Set(['import/no-unresolved']);

// Every boundaries element type must be proven by a fixture that breaks its row of the matrix.
const BOUNDARY_FIXTURE_DIRECTORIES = [
  'app/',
  'app/_layout.tsx',
  'src/features/',
  'src/account/',
  'src/domain/',
  'src/db/',
  'src/sync/',
  'src/recording/',
  'src/crypto/',
  'src/ui/',
  'src/platform/',
  'src/unclassified/',
];

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return fullPath === PLATFORM_FILE_FIXTURES ? [] : sourceFiles(fullPath);
    return /\.[jt]sx?$/.test(entry.name) ? [fullPath] : [];
  });
}

const failures = [];
const coveredTags = new Set();
const coveredBoundaryFixtures = [];
const coveredNoConsoleFolders = new Set();

const eslint = new ESLint({ cwd: MOBILE_ROOT, ignore: false });
const results = await eslint.lintFiles(sourceFiles(FIXTURES));

for (const result of results) {
  const relative = path.relative(FIXTURES, result.filePath).split(path.sep).join('/');
  const expectations = [...readFileSync(result.filePath, 'utf8').matchAll(EXPECT_LINE)].map(
    ([, ruleId, tag]) => ({ ruleId, tag }),
  );
  if (expectations.length === 0) {
    failures.push(`${relative}: no // expect: line`);
    continue;
  }

  const messages = result.messages.filter((message) => !IGNORED_RULES.has(message.ruleId));
  for (const { ruleId, tag } of expectations) {
    const reported = messages.some(
      (message) => message.ruleId === ruleId && (tag === undefined || message.message.includes(tag)),
    );
    if (!reported) {
      failures.push(`${relative}: expected ${ruleId}${tag ? ` ${tag}` : ''}, which was not reported`);
      continue;
    }
    if (tag) coveredTags.add(tag);
    if (ruleId === 'boundaries/dependencies') coveredBoundaryFixtures.push(relative);
    if (ruleId === 'no-console') coveredNoConsoleFolders.add(relative.split('/')[1]);
  }

  const expectedRules = new Set(expectations.map((expectation) => expectation.ruleId));
  for (const message of messages) {
    if (!expectedRules.has(message.ruleId)) {
      failures.push(`${relative}:${message.line} unexpected ${message.ruleId ?? 'error'}: ${message.message}`);
    }
  }
}

for (const restriction of [...fences, ...folderRules]) {
  if (!coveredTags.has(`[fence:${restriction.id}]`)) {
    failures.push(`fence ${restriction.id} has no fixture proving it`);
  }
}

// A sub-scope lifts exactly the rule that names it (ADR-014): the same code is caught one folder over, and a
// neighbouring fence still fires inside the sub-scope. Built without literals this file's own lint would reject.
const HEX = ['#', '4A9FD4'].join('');
const SUBSCOPE_PROOFS = [
  {
    code: `export const accent = '${HEX}';\n`,
    exempt: 'src/ui/tokens.ts',
    caughtAt: 'src/ui/not-the-token-file.ts',
    tag: '[fence:design-tokens]',
  },
  {
    code: "import { Text } from 'react-native';\nexport const Title = () => <Text>Diagnostics</Text>;\n",
    exempt: 'src/features/diagnostics/Title.tsx',
    caughtAt: 'src/features/another-feature/Title.tsx',
    tag: '[fence:literal-strings]',
  },
];
const NEIGHBOUR = { code: "export const ping = () => fetch('/health');\n", tag: '[fence:network]' };

async function tagsAt(code, relativePath) {
  const [result] = await eslint.lintText(code, { filePath: path.join(FIXTURES, relativePath) });
  return result.messages.map((message) => message.message);
}

for (const { code, exempt, caughtAt, tag } of SUBSCOPE_PROOFS) {
  if ((await tagsAt(code, exempt)).some((message) => message.includes(tag))) {
    failures.push(`sub-scope ${exempt} is not exempt from ${tag}`);
  }
  if (!(await tagsAt(code, caughtAt)).some((message) => message.includes(tag))) {
    failures.push(`${tag} is not reported at ${caughtAt}`);
  }
  const extension = path.extname(exempt);
  if (!(await tagsAt(NEIGHBOUR.code, exempt.replace(extension, `-neighbour${extension}`))).some((m) => m.includes(NEIGHBOUR.tag))) {
    failures.push(`sub-scope ${exempt} switched off its neighbour ${NEIGHBOUR.tag}`);
  }
}
for (const folder of NO_CONSOLE_FOLDERS) {
  if (!coveredNoConsoleFolders.has(folder)) failures.push(`no-console in src/${folder} has no fixture`);
}
for (const prefix of BOUNDARY_FIXTURE_DIRECTORIES) {
  if (!coveredBoundaryFixtures.some((file) => file.startsWith(prefix))) {
    failures.push(`boundaries matrix row ${prefix} has no fixture proving it`);
  }
}

const misplaced = findMisplacedPlatformFiles(PLATFORM_FILE_FIXTURES);
if (JSON.stringify(misplaced) !== JSON.stringify(['src/features/example.android.ts', 'src/ui/example.ios.tsx'])) {
  failures.push(`platform-file check reported ${JSON.stringify(misplaced)} for its fixture`);
}

if (failures.length > 0) {
  console.error('Lint fixtures not reported as expected:');
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}
console.log(`All ${results.length} lint fixtures are reported by exactly the rules they target.`);
