/**
 * Finding an exercise among 201 of them — task 004 stage 4.
 *
 * Two of the task's acceptance criteria are settled here, against the **real** message catalogs rather than stubs,
 * because both are claims about the translations themselves:
 *
 * - *a pt-BR user finds the bench press by typing either* **supino** *or* **bench**;
 * - *a custom exercise named in Portuguese appears exactly as typed in an English UI.*
 */
import en from '@cyberathlete/shared/i18n/en.json';
import ptBR from '@cyberathlete/shared/i18n/pt-BR.json';

import type { CatalogExercise } from '@/db/catalog';

import { filterCatalog, isFiltered, NO_FILTER, sortForDisplay } from '../catalogFilter';
import { exerciseLabel, exerciseSearchNames, isOwnExercise, spokenName, type Translate } from '../exerciseName';

// `unknown` leaves, not `string`: some namespaces this file never reads (`achievement`, with its
// `{name, description}` rows) hold objects, and the real catalogs must still fit the type.
const CATALOGS: Record<string, Record<string, Record<string, unknown>>> = { en, 'pt-BR': ptBR };

/** `t`, as the screen supplies it: a dotted key, resolved in a named language (i18next's `lng`). */
function translateIn(uiLocale: string): Translate {
  return (key, options) => {
    const [namespace, name] = key.split('.');
    const value = CATALOGS[options?.lng ?? uiLocale]?.[namespace]?.[name];
    return typeof value === 'string' ? value : key;
  };
}

function exercise(overrides: Partial<CatalogExercise>): CatalogExercise {
  return {
    id: 'e',
    nameKey: null,
    name: null,
    ownerUserId: null,
    forkedFromId: null,
    modality: 'barbell',
    primaryMuscleId: 1,
    tracking: 'weight_reps',
    isUnilateral: false,
    usesBodyweight: false,
    loadIncrementKg: null,
    notes: null,
    archivedAt: null,
    ...overrides,
  };
}

const BENCH = exercise({ id: 'bench', nameKey: 'exercise.barbell_bench_press' });
const INCLINE = exercise({ id: 'incline', nameKey: 'exercise.incline_barbell_bench_press' });
const SQUAT = exercise({ id: 'squat', nameKey: 'exercise.barbell_back_squat', modality: 'barbell', primaryMuscleId: 14 });
const CABLE_FLY = exercise({ id: 'fly', nameKey: 'exercise.cable_crossover', modality: 'cable' });
/** What the user wrote, in Portuguese. Never translated, in any UI language (INV-27). */
const MINE = exercise({ id: 'mine', name: 'Supino do João', ownerUserId: 'u1', modality: 'dumbbell' });

const ALL = [BENCH, INCLINE, SQUAT, CABLE_FLY, MINE];

function idsFor(query: string, uiLocale: string): string[] {
  return filterCatalog(ALL, { ...NO_FILTER, query }, translateIn(uiLocale), uiLocale).map((row) => row.id);
}

describe('the bilingual search criterion (ADR-008)', () => {
  it('finds the bench press for a pt-BR user typing supino', () => {
    expect(idsFor('supino', 'pt-BR')).toContain('bench');
  });

  it('finds the bench press for a pt-BR user typing bench', () => {
    expect(idsFor('bench', 'pt-BR')).toContain('bench');
  });

  it('finds it for an English user typing either, for the same reason', () => {
    expect(idsFor('bench', 'en')).toContain('bench');
    expect(idsFor('supino', 'en')).toContain('bench');
  });

  /** Accents are a typing convenience, not a distinction the searcher meant — `foldForSearch`, stage 2. */
  it('ignores accents, so exercicio finds exercício', () => {
    expect(idsFor('supino reto', 'pt-BR')).toContain('bench');
  });

  it('matches every word in any order, so "bench incline" finds the incline press', () => {
    expect(idsFor('bench incline', 'en')).toContain('incline');
  });

  /**
   * A user's own exercise is known by the one name they typed and by no translation of it. "Supino do João" must not
   * become findable by typing "bench" — nobody promised that, and translating somebody's own words is INV-27's
   * explicit prohibition.
   */
  it('never translates a user’s own exercise into the other language', () => {
    expect(exerciseSearchNames(MINE, translateIn('en'))).toEqual(['Supino do João']);
    expect(idsFor('bench', 'en')).not.toContain('mine');
    expect(idsFor('João', 'en')).toContain('mine');
  });
});

describe('a custom exercise in an English UI (INV-27)', () => {
  it('appears exactly as typed, untranslated', () => {
    expect(exerciseLabel(MINE, translateIn('en'))).toBe('Supino do João');
    expect(exerciseLabel(MINE, translateIn('pt-BR'))).toBe('Supino do João');
  });

  it('while a global reads in whichever language the user is in', () => {
    expect(exerciseLabel(BENCH, translateIn('en'))).toBe('Barbell Bench Press');
    expect(exerciseLabel(BENCH, translateIn('pt-BR'))).toBe('Supino reto com barra');
  });
});

describe('the filters', () => {
  const apply = (filter: Partial<typeof NO_FILTER>, locale = 'pt-BR') =>
    filterCatalog(ALL, { ...NO_FILTER, ...filter }, translateIn(locale), locale).map((row) => row.id);

  it('narrow by equipment', () => {
    expect(apply({ modality: 'cable' })).toEqual(['fly']);
  });

  it('narrow by muscle', () => {
    expect(apply({ muscleId: 14 })).toEqual(['squat']);
  });

  it('narrow to the user’s own', () => {
    expect(apply({ mineOnly: true })).toEqual(['mine']);
  });

  it('combine, rather than replacing one another', () => {
    // In that order because the list is sorted by the pt-BR name: *Supino inclinado* before *Supino reto*.
    expect(apply({ modality: 'barbell', query: 'supino' })).toEqual(['incline', 'bench']);
  });

  it('show everything when nothing is set', () => {
    expect(apply({})).toHaveLength(ALL.length);
    expect(isFiltered(NO_FILTER)).toBe(false);
    expect(isFiltered({ ...NO_FILTER, query: ' ' })).toBe(false);
    expect(isFiltered({ ...NO_FILTER, modality: 'cable' })).toBe(true);
  });
});

describe('the order the list comes back in', () => {
  /**
   * Sorted by the name **on screen**, which is why `src/db` does not sort at all: a global carries
   * `exercise.barbell_bench_press`, so ordering in SQL would order every language by English-ish identifiers.
   */
  it('is alphabetical in the language being read, and differs between languages', () => {
    const inPt = filterCatalog(ALL, NO_FILTER, translateIn('pt-BR'), 'pt-BR').map((row) => row.id);
    const inEn = filterCatalog(ALL, NO_FILTER, translateIn('en'), 'en').map((row) => row.id);

    expect(inPt).not.toEqual(inEn);
    const ptNames = inPt.map((id) => exerciseLabel(ALL.find((row) => row.id === id)!, translateIn('pt-BR')));
    expect([...ptNames]).toEqual([...ptNames].sort((left, right) => left.localeCompare(right, 'pt-BR')));
  });
});

describe('sortForDisplay', () => {
  /**
   * The hidden-exercises view has no filters of its own — it hands `sortForDisplay` whatever `listArchivedExercises`
   * returns — so this is the one place its ordering is exercised on its own, unfiltered.
   */
  it('reaches the same order filterCatalog does with no filter applied', () => {
    const filtered = filterCatalog(ALL, NO_FILTER, translateIn('pt-BR'), 'pt-BR').map((row) => row.id);
    const sorted = sortForDisplay(ALL, translateIn('pt-BR'), 'pt-BR').map((row) => row.id);

    expect(sorted).toEqual(filtered);
  });

  it('does not mutate the list it was given', () => {
    const copy = [...ALL];
    sortForDisplay(ALL, translateIn('en'), 'en');

    expect(ALL).toEqual(copy);
  });
});

describe('telling a fork from the built-in it came from (task 004 stage 6 device pass)', () => {
  // A fork carries the built-in's translated name (ADR-008), so the two read identically; ownership is the difference.
  const FORK = exercise({ id: 'fork', name: 'Abdominal bicicleta', ownerUserId: 'u1', forkedFromId: 'bicycle' });
  const BUILT_IN = exercise({ id: 'bicycle', nameKey: 'exercise.bicycle_crunch' });
  const say = (key: string, options?: Record<string, unknown>) =>
    key === 'catalog.yours_label' ? `${String(options?.name)}, seu` : key;

  it('marks the user’s own exercise, fork or not, and never a built-in one', () => {
    expect(isOwnExercise(FORK)).toBe(true);
    expect(isOwnExercise(MINE)).toBe(true);
    expect(isOwnExercise(BUILT_IN)).toBe(false);
  });

  it('says it aloud as well, so the mark is never visual alone (INV-24)', () => {
    expect(spokenName(FORK, 'Abdominal bicicleta', say)).toBe('Abdominal bicicleta, seu');
    expect(spokenName(BUILT_IN, 'Abdominal bicicleta', say)).toBe('Abdominal bicicleta');
  });
});
