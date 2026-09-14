// expect: no-restricted-syntax [fence:literal-strings]
import { Text } from 'react-native';

export const SetNumber = ({ number }: { number: number }) => <Text>{`Set ${number}`}</Text>;
