// expect: no-restricted-imports [fence:platform-api]
// A namespace import would reach Platform without naming it.
import * as ReactNative from 'react-native';

export const os = ReactNative.Platform.OS;
