#!/usr/bin/env node
/**
 * CI gate (04 §5): a release build permits no cleartext traffic.
 *
 * Run after `pnpm prebuild`. It checks what Gradle packages into a release build — the main source set,
 * and a release source set if one exists — and never the debug source set, where localhost is allowed.
 * When the merged release manifest exists (after `./gradlew :app:processReleaseMainManifest`), it checks
 * that too, which also covers anything a library contributes.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MOBILE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(MOBILE_ROOT, 'android', 'app');
const SOURCE_SETS = path.join(APP, 'src');
const RESOURCE = 'network_security_config';

const failures = [];
const read = (file) => readFileSync(file, 'utf8');
const permitsCleartext = (xml) =>
  /cleartextTrafficPermitted\s*=\s*"true"/.test(xml) || /usesCleartextTraffic\s*=\s*"true"/.test(xml);

const mainManifest = path.join(SOURCE_SETS, 'main', 'AndroidManifest.xml');
const mainNetworkConfig = path.join(SOURCE_SETS, 'main', 'res', 'xml', `${RESOURCE}.xml`);

if (!existsSync(mainManifest)) {
  failures.push('android/app/src/main/AndroidManifest.xml is missing — run `pnpm prebuild` first');
} else {
  const manifest = read(mainManifest);
  if (!manifest.includes(`android:networkSecurityConfig="@xml/${RESOURCE}"`)) {
    failures.push('the main manifest does not reference @xml/network_security_config');
  }
  if (permitsCleartext(manifest)) failures.push('the main manifest permits cleartext traffic');
}

if (!existsSync(mainNetworkConfig)) {
  failures.push('android/app/src/main/res/xml/network_security_config.xml is missing');
} else {
  const config = read(mainNetworkConfig);
  if (!/<base-config[^>]*cleartextTrafficPermitted\s*=\s*"false"/.test(config)) {
    failures.push('the release network security config does not forbid cleartext in <base-config>');
  }
  if (permitsCleartext(config)) failures.push('the release network security config permits cleartext somewhere');
}

const releaseSourceSet = path.join(SOURCE_SETS, 'release');
if (existsSync(releaseSourceSet)) {
  const walk = (directory) =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)],
    );
  for (const file of walk(releaseSourceSet).filter((candidate) => candidate.endsWith('.xml'))) {
    if (permitsCleartext(read(file))) failures.push(`${path.relative(MOBILE_ROOT, file)} permits cleartext`);
  }
}

const mergedManifests = path.join(APP, 'build', 'intermediates', 'merged_manifests', 'release');
if (existsSync(mergedManifests)) {
  const walk = (directory) =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)],
    );
  for (const file of walk(mergedManifests).filter((candidate) => candidate.endsWith('AndroidManifest.xml'))) {
    if (permitsCleartext(read(file))) {
      failures.push(`the merged release manifest ${path.relative(MOBILE_ROOT, file)} permits cleartext`);
    }
  }
}

if (failures.length > 0) {
  console.error('The release build could send cleartext traffic (04 §5):');
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}
console.log('The release build permits no cleartext traffic.');
