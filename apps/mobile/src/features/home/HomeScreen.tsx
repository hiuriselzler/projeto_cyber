import { StyleSheet, View } from 'react-native';

/**
 * What a release build shows until the Today screen exists (task 010). It carries no text, so there is
 * nothing to translate yet (INV-27).
 */
export function HomeScreen() {
  return <View style={styles.screen} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
});
