// expect: no-restricted-syntax [fence:privacy-key-storage]
// src/sync may use secure storage, but never for the privacy key (ADR-007).
import * as SecureStore from 'expo-secure-store';

export const readTheKey = () => SecureStore.getItemAsync('cyberathlete.privacy-key');
