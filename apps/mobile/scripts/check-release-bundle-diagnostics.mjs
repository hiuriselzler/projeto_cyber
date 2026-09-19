#!/usr/bin/env node
/**
 * Task 017 (from task 001, INV-28's release/debug split): the debug-only diagnostics screen must
 * not ship in a release bundle. app/index.tsx picks it only `if (__DEV__)`; a release export has
 * `__DEV__` inlined to `false`, so the minifier's dead-code elimination should drop the `require`
 * behind it — and with it, every string the diagnostics screen carries.
 *
 * Run after `pnpm export` (`expo export --platform android`, no --dev). Scans every JS/Hermes-bytecode
 * bundle it produced, as raw bytes — Hermes keeps source string literals in its string table even
 * though identifiers are otherwise unreadable, so a plain substring search still catches a
 * `DiagnosticsScreen` that dead-code elimination failed to remove.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MOBILE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE_DIR = path.join(MOBILE_ROOT, 'dist', '_expo', 'static', 'js', 'android');
const FORBIDDEN = 'DiagnosticsScreen';

function findBundles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return findBundles(fullPath);
    return entry.name.endsWith('.hbc') || entry.name.endsWith('.js') ? [fullPath] : [];
  });
}

if (!statSync(BUNDLE_DIR, { throwIfNoEntry: false })) {
  console.error(
    `${path.relative(MOBILE_ROOT, BUNDLE_DIR)} is missing — run `
      + '`npx expo export --platform android` first',
  );
  process.exit(1);
}

const bundles = findBundles(BUNDLE_DIR);
if (bundles.length === 0) {
  console.error(`No bundle files found under ${path.relative(MOBILE_ROOT, BUNDLE_DIR)}`);
  process.exit(1);
}

const failures = [];
for (const bundle of bundles) {
  const bytes = readFileSync(bundle, 'binary');
  if (bytes.includes(FORBIDDEN)) {
    failures.push(path.relative(MOBILE_ROOT, bundle));
  }
}

if (failures.length > 0) {
  console.error(`The release bundle carries diagnostics-screen code (${FORBIDDEN} found):`);
  for (const file of failures) console.error(`  ${file}`);
  process.exit(1);
}
console.log(`The release bundle carries no diagnostics-screen code (${bundles.length} bundle(s) checked).`);
