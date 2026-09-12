#!/usr/bin/env node
/**
 * INV-28: files selected by the operating system — *.android.* and *.ios.* — exist only in
 * src/platform. ESLint sees imports, not file names, so this is a separate CI check.
 *
 *   node scripts/check-platform-files.mjs [directory]
 *
 * Exits 1 and lists each offending file.
 */
import { readdirSync } from 'node:fs';
import path from 'node:path';

const PLATFORM_FILE = /\.(android|ios)\.[cm]?[jt]sx?$/;
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'android', 'ios', '.expo', 'dist', 'coverage', 'lint-fixtures']);

export function findMisplacedPlatformFiles(root) {
  const misplaced = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) walk(fullPath);
      } else if (PLATFORM_FILE.test(entry.name)) {
        const relative = path.relative(root, fullPath).split(path.sep).join('/');
        if (!relative.startsWith('src/platform/')) misplaced.push(relative);
      }
    }
  };
  walk(root);
  return misplaced.sort();
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

if (invokedDirectly) {
  const root = path.resolve(process.argv[2] ?? '.');
  const misplaced = findMisplacedPlatformFiles(root);
  if (misplaced.length > 0) {
    console.error('Platform-specific files outside src/platform (INV-28):');
    for (const file of misplaced) console.error(`  ${file}`);
    process.exit(1);
  }
  console.log('No platform-specific files outside src/platform.');
}
