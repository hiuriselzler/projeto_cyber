// expect: no-restricted-syntax [fence:design-tokens]
import { withTiming } from 'react-native-reanimated';

export const fadeIn = () => withTiming(1, { duration: 300 });
