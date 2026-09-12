// expect: no-restricted-imports [fence:platform-api]
import { Platform } from 'react-native';

export const isAndroid = Platform.OS === 'android';
