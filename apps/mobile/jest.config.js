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
  // The first test of each `MATRIX` suite pays the one-time cost of the providers, i18next, the `@formatjs`
  // polyfills and a cold transform, which passes Jest's 5 s default on a slower machine — on Windows in task 017,
  // 1 to 3 suites failed depending on load, always on `MATRIX[0]` and never on an assertion. The behaviour under
  // test is unchanged; only the harness needed the room.
  testTimeout: 15000,
};
