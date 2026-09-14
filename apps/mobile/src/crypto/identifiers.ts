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
  const bytes = randombytes_buf(16);
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
