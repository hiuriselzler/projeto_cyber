import floor from '@cyberathlete/shared/security/password-kdf.json';

import { formatKdf, parseKdf, WRAPPING_KDF } from '../kdf';

describe('the privacy-key wrapping KDF (ADR-007)', () => {
  it('is never cheaper than the API login hash, in memory or in iterations', () => {
    expect(floor.login_hash.algorithm).toBe('argon2id');
    expect(WRAPPING_KDF.memoryKib).toBeGreaterThanOrEqual(floor.login_hash.memory_kib);
    expect(WRAPPING_KDF.iterations).toBeGreaterThanOrEqual(floor.login_hash.iterations);
  });

  it('is written the way the API reads and stores it', () => {
    expect(formatKdf(WRAPPING_KDF)).toBe('argon2id$m=65536,t=3,p=1');
  });

  it('reads back older parameters, and refuses what libsodium cannot reproduce', () => {
    expect(parseKdf('argon2id$m=131072,t=4,p=1')).toEqual({ memoryKib: 131_072, iterations: 4, parallelism: 1 });
    expect(parseKdf('argon2id$m=65536,t=3,p=4')).toBeNull();
    expect(parseKdf('argon2i$m=65536,t=3,p=1')).toBeNull();
    expect(parseKdf('')).toBeNull();
  });
});
