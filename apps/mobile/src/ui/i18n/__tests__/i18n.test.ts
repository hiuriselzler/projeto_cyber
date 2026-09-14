import { createI18n } from '../i18n';

describe('the i18n runtime (ADR-008)', () => {
  it('chooses plurals by each language’s own rules', () => {
    const english = createI18n('en');
    const portuguese = createI18n('pt-BR');

    expect(english.t('a11y.reps', { count: 1 })).toBe('1 rep');
    expect(english.t('a11y.reps', { count: 6 })).toBe('6 reps');
    expect(portuguese.t('a11y.reps', { count: 1 })).toBe('1 repetição');
    expect(portuguese.t('a11y.reps', { count: 6 })).toBe('6 repetições');
  });

  it('resolves nested ICU selects with preformatted numbers', () => {
    const values = { weight: '62,5', reps: '6', rir: '2' };

    expect(createI18n('pt-BR').t('ui.set_row.previous', { ...values, rir_recorded: 'yes' })).toBe(
      'Última vez: 62,5 × 6 @2',
    );
    expect(createI18n('en').t('ui.set_row.previous', { ...values, weight: '62.5', rir_recorded: 'no' })).toBe(
      '62.5 × 6 last time',
    );
  });

  it('translates reference content by key', () => {
    expect(createI18n('pt-BR').t('set_type.working')).not.toBe('set_type.working');
  });

  it('gives Portuguese its plural categories through the polyfill Hermes loads', () => {
    const native = Intl.PluralRules;
    try {
      // Hermes ships no Intl.PluralRules; take it away, as a phone would have it.
      Reflect.deleteProperty(Intl, 'PluralRules');
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('@formatjs/intl-pluralrules/polyfill-force.js');
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('@formatjs/intl-pluralrules/locale-data/pt.js');
      });

      expect(Intl.PluralRules).not.toBe(native);
      expect(new Intl.PluralRules('pt').select(1)).toBe('one');
      expect(new Intl.PluralRules('pt').select(6)).toBe('other');
    } finally {
      Object.defineProperty(Intl, 'PluralRules', { value: native, configurable: true, writable: true });
    }
  });
});
