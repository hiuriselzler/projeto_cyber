/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  // pnpm's isolated node_modules, as the Expo unit-testing guide gives it.
  transformIgnorePatterns: [
    'node_modules/(?!(.pnpm|(jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|intl-messageformat|@formatjs/.*|i18next-icu))',
  ],
  // Known-bad lint fixtures are code on purpose; they are never tests.
  testPathIgnorePatterns: ['/node_modules/', '/lint-fixtures/'],
  // The native libsodium binding cannot load under Node. Its functions come from libsodium's JavaScript build
  // instead, so the privacy-key tests run the real algorithms (task 003).
  moduleNameMapper: {
    '^react-native-libsodium$': '<rootDir>/src/crypto/testing/libsodium-node.ts',
  },
};
