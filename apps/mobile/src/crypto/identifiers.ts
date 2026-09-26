/**
 * Random identifiers, from the OS CSPRNG through libsodium: the device id the API keys sessions by, and UUIDv7 row ids
 * minted on the device (INV-16). Randomness lives here, never in `src/domain` (INV-10).
 */
import { randombytes_buf, ready, to_hex } from 'react-native-libsodium';

/** 32 hex characters, generated once per install and kept by `src/sync`. */
export async function randomDeviceId(): Promise<string> {
  await ready;
  return to_hex(randombytes_buf(16));
}

/** RFC 9562 UUIDv7: 48 bits of Unix milliseconds, then random bits, with the version and variant set. */
export async function uuidV7(nowMs: number): Promise<string> {
  await ready;
  return formatV7(randombytes_buf(16), nowMs);
}

/**
 * `count` UUIDv7s from one draw of the CSPRNG — for a planner block, where one id per row is some three thousand
 * (task 005 stage 4a). One call across the native boundary rather than one per row; each id is exactly what
 * {@link uuidV7} would mint.
 */
export async function uuidV7Batch(nowMs: number, count: number): Promise<string[]> {
  await ready;
  if (count <= 0) return [];
  const pool = randombytes_buf(16 * count);
  return Array.from({ length: count }, (_, at) => formatV7(pool.slice(at * 16, at * 16 + 16), nowMs));
}

function formatV7(bytes: Uint8Array, nowMs: number): string {
  let milliseconds = Math.floor(nowMs);
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = milliseconds % 256;
    milliseconds = Math.floor(milliseconds / 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = to_hex(bytes);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
