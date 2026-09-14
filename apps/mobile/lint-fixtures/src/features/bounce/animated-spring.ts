// expect: no-restricted-properties [fence:no-bounce]
import { Animated } from 'react-native';

export const settle = (value: Animated.Value) => Animated.spring(value, { toValue: 1, useNativeDriver: true });
