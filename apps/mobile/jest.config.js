/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  // pnpm's isolated node_modules, as the Expo unit-testing guide gives it.
  transformIgnorePatterns: [
    'node_modules/(?!(.pnpm|(jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg))',
  ],
  // Known-bad lint fixtures are code on purpose; they are never tests.
  testPathIgnorePatterns: ['/node_modules/', '/lint-fixtures/'],
};
