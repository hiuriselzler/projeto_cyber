/**
 * Client-side cryptography and the privacy key (ADR-007). The only folder that may import a crypto library, and one
 * of two that may use expo-secure-store. Callers receive wraps and identifiers — never the key itself.
 */
export { readDiagnosticsProbe, writeDiagnosticsProbe } from './diagnostics';
export { randomDeviceId, uuidV7 } from './identifiers';
export { formatKdf, parseKdf, WRAPPING_KDF, type WrappingKdf } from './kdf';
export {
  forgetPrivacyKey,
  hasPrivacyKey,
  prepareNewPrivacyKey,
  PrivacyKeyError,
  rewrapPrivacyKey,
  unwrapPrivacyKey,
  WRAPPED_KEY_BYTES,
  type PreparedPrivacyKey,
  type WrappedPrivacyKey,
} from './privacy-key';
