import { defaultsFromDevice } from '../device';

describe('defaults from the device (ADR-008)', () => {
  it.each([
    [{ languageCode: 'pt', regionCode: 'BR' }, { locale: 'pt-BR', unitSystem: 'metric' }],
    [{ languageCode: 'pt', regionCode: 'PT' }, { locale: 'pt-BR', unitSystem: 'metric' }],
    [{ languageCode: 'en', regionCode: 'US' }, { locale: 'en', unitSystem: 'imperial' }],
    [{ languageCode: 'en', regionCode: 'BR' }, { locale: 'en', unitSystem: 'metric' }],
    [{ languageCode: 'pt', regionCode: 'US' }, { locale: 'pt-BR', unitSystem: 'imperial' }],
    [{ languageCode: 'es', regionCode: 'MX' }, { locale: 'en', unitSystem: 'metric' }],
    [{ languageCode: null, regionCode: null }, { locale: 'en', unitSystem: 'metric' }],
  ])('%o gives %o, language and units independently', (device, expected) => {
    expect(defaultsFromDevice([device])).toEqual(expected);
  });

  it('reads the most preferred locale only', () => {
    expect(
      defaultsFromDevice([
        { languageCode: 'en', regionCode: 'GB' },
        { languageCode: 'pt', regionCode: 'BR' },
      ]),
    ).toEqual({ locale: 'en', unitSystem: 'metric' });
  });

  it('falls back to English and metric when the device reports nothing', () => {
    expect(defaultsFromDevice([])).toEqual({ locale: 'en', unitSystem: 'metric' });
  });
});
