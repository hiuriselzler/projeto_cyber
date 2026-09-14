import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import { maxFontScale, radii, sizes, space, typography } from '../tokens';
import { AppText } from './AppText';

type PassedThrough = Pick<
  TextInputProps,
  'autoCapitalize' | 'autoComplete' | 'keyboardType' | 'onSubmitEditing' | 'returnKeyType' | 'secureTextEntry' | 'textContentType'
>;

export interface TextFieldProps extends PassedThrough {
  /** Already translated by the caller. */
  readonly label: string;
  readonly value: string;
  readonly onChangeText: (value: string) => void;
  /** Already translated; shown under the field while there is no error. */
  readonly hint?: string;
  /** Already translated. An error is words and a thicker edge — never a colour alone (INV-24). */
  readonly error?: string;
  readonly editable?: boolean;
}

/** A labelled text input, at the full target height, in the body type style (07 §4). */
export function TextField({ label, value, onChangeText, hint, error, editable = true, ...input }: TextFieldProps) {
  const { colors } = useTheme();
  const invalid = error !== undefined;
  return (
    <View style={styles.field}>
      <AppText variant="label" tone="textSecondary">
        {label}
      </AppText>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        accessibilityLabel={label}
        accessibilityHint={invalid ? error : hint}
        accessibilityState={{ disabled: !editable }}
        autoCorrect={false}
        maxFontSizeMultiplier={maxFontScale}
        selectionColor={colors.accent}
        style={[
          styles.input,
          {
            color: colors.textPrimary,
            backgroundColor: colors.bgSurface,
            borderColor: invalid ? colors.danger : colors.borderStrong,
            borderWidth: invalid ? sizes.edgeSelected : sizes.edgeHairline,
            fontFamily: typography.body.fontFamily,
            fontSize: typography.body.fontSize,
            lineHeight: typography.body.lineHeight,
          },
        ]}
        {...input}
      />
      {invalid ? (
        <AppText variant="caption" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : hint !== undefined ? (
        <AppText variant="caption" tone="textSecondary">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: space[1] },
  input: {
    minHeight: sizes.targetMin,
    borderRadius: radii.md,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
  },
});
