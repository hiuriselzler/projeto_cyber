import en from '@cyberathlete/shared/i18n/en.json';
import ptBR from '@cyberathlete/shared/i18n/pt-BR.json';

import { foldForSearch, matchesSearch } from '../search';

/** What a global exercise is known by: its name in every catalog (ADR-008, INV-27). */
function namesOf(key: string): string[] {
  const suffix = key.replace(/^exercise\./, '');
  const english = (en.exercise as Record<string, string>)[suffix];
  const portuguese = (ptBR.exercise as Record<string, string>)[suffix];
  return [english, portuguese];
}

describe('folding a search term', () => {
  it('ignores case and surrounding space', () => {
    expect(foldForSearch('  Supino  ')).toBe('supino');
  });

  it('ignores accents, which are a typing convenience rather than a distinction', () => {
    expect(foldForSearch('Tríceps')).toBe(foldForSearch('triceps'));
    expect(foldForSearch('Elevação')).toBe('elevacao');
    expect(foldForSearch('pêso')).toBe('peso');
  });
});

describe('finding an exercise by either language (task 004, ADR-008)', () => {
  const benchPress = namesOf('exercise.barbell_bench_press');

  it('has a catalog entry in both languages to search', () => {
    // If either catalog ever lost the key, the criterion below would pass vacuously.
    expect(benchPress.filter(Boolean)).toHaveLength(2);
  });

  it.each(['supino', 'bench', 'Supino', 'BENCH', 'supíno'])(
    'a pt-BR user finds the bench press by typing %p',
    (query) => {
      expect(matchesSearch(benchPress, query)).toBe(true);
    },
  );

  it('does not match an unrelated word', () => {
    expect(matchesSearch(benchPress, 'agachamento')).toBe(false);
  });

  it('matches a word from the middle of a name, not only the first', () => {
    // "bench" is the third word of "Incline Barbell Bench Press"; prefix matching would miss it.
    expect(matchesSearch(namesOf('exercise.incline_barbell_bench_press'), 'bench')).toBe(true);
  });

  it('matches every word of a multi-word query, in any order', () => {
    const incline = namesOf('exercise.incline_barbell_bench_press');

    expect(matchesSearch(incline, 'incline bench')).toBe(true);
    expect(matchesSearch(incline, 'bench incline')).toBe(true);
    expect(matchesSearch(incline, 'bench decline')).toBe(false);
  });

  it('may match one word in each language, since the two are mixed in one sentence', () => {
    // "supino inclinado" / "Incline Barbell Bench Press" — a user typing half of each is typing what they say.
    expect(matchesSearch(namesOf('exercise.incline_barbell_bench_press'), 'supino incline')).toBe(true);
  });

  it('restores the whole catalog when the box is cleared', () => {
    expect(matchesSearch(benchPress, '')).toBe(true);
    expect(matchesSearch(benchPress, '   ')).toBe(true);
  });
});

describe('a user exercise, which is never translated (INV-27)', () => {
  it('is found by what its owner typed', () => {
    // A custom name is stored and shown exactly as written, so it is known by exactly one name.
    expect(matchesSearch(['Treino A — Puxada do João'], 'joao')).toBe(true);
    expect(matchesSearch(['Treino A — Puxada do João'], 'puxada')).toBe(true);
  });

  it('is not found by an English word nobody put in it', () => {
    expect(matchesSearch(['Puxada do João'], 'pulldown')).toBe(false);
  });
});
