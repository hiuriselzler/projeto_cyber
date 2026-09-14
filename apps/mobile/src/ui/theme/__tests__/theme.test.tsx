import { fireEvent, render, screen } from '@testing-library/react-native';
import { Pressable, View } from 'react-native';

import { colors } from '../../tokens';
import { resolveScheme, ThemeProvider, useTheme, type ThemePreference } from '../ThemeProvider';

describe('choosing the theme (07 §3)', () => {
  it.each<[ThemePreference, string | null, 'light' | 'dark']>([
    ['system', 'light', 'light'],
    ['system', 'dark', 'dark'],
    ['system', null, 'dark'],
    ['light', 'dark', 'light'],
    ['dark', 'light', 'dark'],
  ])('preference %s with the system on %s gives %s', (preference, system, expected) => {
    expect(resolveScheme(preference, system)).toBe(expected);
  });
});

function Probe() {
  const theme = useTheme();
  return (
    <View testID="probe" style={{ backgroundColor: theme.colors.bgAbyss }}>
      <Pressable testID="choose-light" onPress={() => theme.setPreference('light')} />
    </View>
  );
}

describe('the theme provider', () => {
  it('gives components the chosen theme’s tokens, whatever the system says', async () => {
    await render(
      <ThemeProvider preference="light">
        <Probe />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('probe')).toHaveStyle({ backgroundColor: colors.light.bgAbyss });
  });

  it('hands a new choice to its caller, which stores it on the device', async () => {
    const onPreferenceChange = jest.fn();
    await render(
      <ThemeProvider preference="dark" onPreferenceChange={onPreferenceChange}>
        <Probe />
      </ThemeProvider>,
    );

    await fireEvent.press(screen.getByTestId('choose-light'));
    expect(onPreferenceChange).toHaveBeenCalledWith('light');
  });
});
