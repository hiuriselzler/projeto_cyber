import { StyleSheet, View } from 'react-native';

import type { FormattedQuantity } from '../format/quantities';
import { useT } from '../i18n/LocaleProvider';
import { spokenQuantity } from '../i18n/spoken';
import { space } from '../tokens';
import { AppText, unitVariantOf } from './AppText';

interface MetricTileProps {
  /** Already translated by the caller. */
  readonly label: string;
  /** A formatted quantity with its unit, or a unitless value such as a duration. */
  readonly quantity: FormattedQuantity | { readonly text: string; readonly unit?: undefined };
  readonly size?: 'display' | 'metricLg' | 'metric';
}

/**
 * One number with its unit (07 §4): the number in a tabular numeric style, the unit one step smaller in
 * `textSecondary`. A screen reader hears the label, then the quantity spoken in full.
 */
export function MetricTile({ label, quantity, size = 'metric' }: MetricTileProps) {
  const t = useT();
  const spoken = quantity.unit === undefined ? quantity.text : spokenQuantity(t, quantity);
  return (
    <View accessible accessibilityLabel={label} accessibilityValue={{ text: spoken }} style={styles.tile}>
      <AppText variant="label" tone="textSecondary">
        {label}
      </AppText>
      <View style={styles.value}>
        <AppText variant={size}>{quantity.text}</AppText>
        {quantity.unit === undefined ? null : (
          <AppText variant={unitVariantOf(size)} tone="textSecondary">
            {t(`unit.${quantity.unit}`)}
          </AppText>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { gap: space[1] },
  value: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: space[1] },
});
