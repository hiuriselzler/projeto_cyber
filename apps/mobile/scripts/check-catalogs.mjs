#!/usr/bin/env node
/**
 * The two message catalogs cannot drift apart (INV-27, ADR-008).
 *
 * - The same keys in `en.json` and `pt-BR.json`. The API's pytest checks this as well.
 * - Every message taking the same arguments, of the same kind, in both languages: `{count}` in one and `{n}` in the
 *   other breaks a screen at runtime, and only in one language.
 * - Every catalog key the app names literally, as `t('…')`, present.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { IntlMessageFormat } from 'intl-messageformat';

const MOBILE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CATALOGS = path.join(MOBILE_ROOT, '..', '..', 'packages', 'shared', 'i18n');
const SOURCES = path.join(MOBILE_ROOT, 'src');

// In the parser's AST, type 0 is literal text and type 7 the `#` of a plural; every other node names an argument.
const LITERAL = 0;
const POUND = 7;

function leaves(catalog, prefix = '') {
  return Object.entries(catalog).flatMap(([key, value]) => {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    return typeof value === 'string' ? [[fullKey, value]] : leaves(value, fullKey);
  });
}

function argumentsOf(message, locale) {
  const found = new Set();
  const walk = (nodes) => {
    for (const node of nodes) {
      if (node.type !== LITERAL && node.type !== POUND) found.add(`${node.value}:${node.type}`);
      for (const option of Object.values(node.options ?? {})) walk(option.value);
      if (node.children) walk(node.children);
    }
  };
  walk(new IntlMessageFormat(message, locale).getAst());
  return [...found].sort().join(', ');
}

const failures = [];
const read = (name) => new Map(leaves(JSON.parse(readFileSync(path.join(CATALOGS, name), 'utf8'))));
const english = read('en.json');
const portuguese = read('pt-BR.json');

for (const key of english.keys()) if (!portuguese.has(key)) failures.push(`${key}: missing from pt-BR.json`);
for (const key of portuguese.keys()) if (!english.has(key)) failures.push(`${key}: missing from en.json`);

for (const [key, message] of english) {
  if (!portuguese.has(key)) continue;
  try {
    const expected = argumentsOf(message, 'en');
    const actual = argumentsOf(portuguese.get(key), 'pt-BR');
    if (expected !== actual) failures.push(`${key}: en takes [${expected}], pt-BR takes [${actual}]`);
  } catch (error) {
    failures.push(`${key}: not a valid ICU message (${error.message})`);
  }
}

const sourceFiles = readdirSync(SOURCES, { recursive: true, withFileTypes: true }).filter(
  (entry) => entry.isFile() && /\.tsx?$/.test(entry.name) && !entry.parentPath.includes('__tests__'),
);
for (const entry of sourceFiles) {
  const source = readFileSync(path.join(entry.parentPath, entry.name), 'utf8');
  for (const [, key] of source.matchAll(/\bt\(\s*['"]([a-z0-9_.]+)['"]/g)) {
    if (!english.has(key)) failures.push(`${path.relative(MOBILE_ROOT, path.join(entry.parentPath, entry.name))}: names ${key}, which no catalog has`);
  }
}

if (failures.length > 0) {
  console.error('The message catalogs disagree:');
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}
console.log(`Both catalogs hold the same ${english.size} messages with the same arguments, and every key the app names exists.`);
