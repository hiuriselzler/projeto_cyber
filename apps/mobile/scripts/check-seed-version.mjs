#!/usr/bin/env node
/**
 * The seed's fingerprint still matches the data it fingerprints.
 *
 * `src/db/seed.ts` seeds the local catalog only when `REFERENCE_SEED_VERSION` differs from what the database was
 * last seeded with (task 004). So changing `packages/shared/seeds/reference.json` without bumping that constant
 * ships a corrected catalog that **no existing install ever receives** — a bug with no symptom on a fresh device
 * and no symptom in any test, which is exactly the kind that survives to production.
 *
 * This is the gate. It hashes the file and compares, and prints the value to paste when they differ.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MOBILE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REFERENCE = path.join(MOBILE_ROOT, '..', '..', 'packages', 'shared', 'seeds', 'reference.json');
const SEED_MODULE = path.join(MOBILE_ROOT, 'src', 'db', 'seed.ts');

const actual = createHash('sha256').update(readFileSync(REFERENCE)).digest('hex');

const source = readFileSync(SEED_MODULE, 'utf8');
const declared = /REFERENCE_SEED_VERSION = '([0-9a-f]{64})'/.exec(source)?.[1];

if (declared === undefined) {
  console.error(`No REFERENCE_SEED_VERSION found in ${path.relative(MOBILE_ROOT, SEED_MODULE)}.`);
  process.exit(1);
}

if (declared !== actual) {
  console.error(
    [
      'The seeded reference data changed but REFERENCE_SEED_VERSION did not, so no existing install would',
      'receive the new catalog.',
      '',
      `  declared: ${declared}`,
      `  actual:   ${actual}`,
      '',
      `Paste the actual value into ${path.relative(MOBILE_ROOT, SEED_MODULE)}.`,
    ].join('\n'),
  );
  process.exit(1);
}

console.log(`The reference seed's fingerprint matches its data (${actual.slice(0, 12)}…).`);
