import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useT } from '../i18n/LocaleProvider';
import { space } from '../tokens';
import { Chip } from './Chip';

/** `0 1 2 3 4` and then the `5+` disclosure. */
const COMMON = [0, 1, 2, 3, 4] as const;
/** What `5+` opens: INV-03's full range from there up, and nothing beyond 10. */
const MORE = [5, 6, 7, 8, 9, 10] as const;
const OPEN_ENDED_FROM = 5;

interface RirChipsProps {
  /** The recorded RIR, or null when none was recorded — never 0 in its place (INV-03). */
  readonly value: number | null;
  readonly onChange: (value: number | null) => void;
}

/**
 * RIR as one tap on a chip row, never a keyboard (FR-2.10). Tapping the selected chip clears it back to not recorded.
 *
 * **`5+` opens a second row, `5 6 7 8 9 10`** — open question 9, decided 2026-09-19. The chip **stores nothing by
 * itself**; what is stored is whichever chip the user then taps. So the common case, RIR 0–5, stays one tap; INV-03's
 * full `0..10` stays reachable in two; and no number the user did not choose is ever written — the same rule that
 * makes a blank chip store NULL rather than 0. Storing a flat 5 was rejected for discarding a distinction the schema
 * carries, and a keyboard is forbidden outright by FR-2.10.
 *
 * The range is not a prop. It is INV-03, and a component that let a caller widen it would be a way around an
 * invariant rather than a piece of configuration.
 */
export function RirChips({ value, onChange }: RirChipsProps) {
  const t = useT();
  const [disclosed, setDisclosed] = useState(false);
  // A stored 7 shows its own row without being asked, so that a set restored from the database reads back as the user
  // left it (INV-09) rather than as a `5+` they would have to press again to see.
  const showMore = disclosed || (value !== null && value >= OPEN_ENDED_FROM);

  const choose = (option: number) => {
    onChange(value === option ? null : option);
  };

  return (
    <View style={styles.rows}>
      <View accessibilityRole="radiogroup" accessibilityLabel={t('a11y.rir_chips')} style={styles.row}>
        {COMMON.map((option) => (
          <Chip
            key={option}
            size="workout"
            role="radio"
            selected={value === option}
            label={String(option)}
            accessibilityLabel={t('a11y.rir', { rir: option })}
            onPress={() => choose(option)}
          />
        ))}
        <Chip
          key="more"
          size="workout"
          role="button"
          // Selected, because 7 came from here and a sighted user must be able to see where. Not *checked*: it is a
          // button, and it holds no value of its own.
          selected={value !== null && value >= OPEN_ENDED_FROM}
          expanded={showMore}
          label={`${OPEN_ENDED_FROM}+`}
          accessibilityLabel={t('a11y.rir_open_ended', { rir: OPEN_ENDED_FROM })}
          onPress={() => setDisclosed(!showMore)}
        />
      </View>

      {showMore ? (
        <View accessibilityRole="radiogroup" accessibilityLabel={t('a11y.rir_chips_more')} style={styles.row}>
          {MORE.map((option) => (
            <Chip
              key={option}
              size="workout"
              role="radio"
              selected={value === option}
              label={String(option)}
              accessibilityLabel={t('a11y.rir', { rir: option })}
              onPress={() => choose(option)}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  rows: { gap: space[2] },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
});
