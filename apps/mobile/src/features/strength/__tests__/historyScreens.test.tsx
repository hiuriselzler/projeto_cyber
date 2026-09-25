/**
 * The history screens — task 004 stage 7 — in both languages, both unit systems and both themes: the list, a workout's
 * detail, and an exercise's history with its charts.
 *
 * The reads are replaced (SQLite does not open under Node) and so is the core; what they do is proven in `src/db`'s
 * pure suites, in Rust and Python over the shared fixtures, and on the phone.
 */
import { fireEvent, screen } from '@testing-library/react-native';

import { MATRIX, renderUi } from '../../../../test/render';
import { readExercise, type CatalogExercise } from '@/db/catalog';
import {
  listFinishedWorkouts,
  readExerciseSessions,
  readFinishedWorkout,
  readSetsOfWorkouts,
  readWorkoutDetail,
  type DatedSession,
  type PerformedSet,
} from '@/db/history';
import { sessionMetrics, type SessionMetrics } from '@/domain';

import { ExerciseHistoryScreen } from '../ExerciseHistoryScreen';
import { WorkoutDetailScreen } from '../WorkoutDetailScreen';
import { WorkoutHistoryScreen } from '../WorkoutHistoryScreen';

jest.mock('@/db/client', () => ({ db: {}, sqlite: {} }));
jest.mock('@/db/history', () => ({
  listFinishedWorkouts: jest.fn(() => []),
  readSetsOfWorkouts: jest.fn(() => new Map()),
  readFinishedWorkout: jest.fn(() => null),
  readWorkoutDetail: jest.fn(() => []),
  readWorkoutSets: jest.fn(() => []),
  readExerciseHistory: jest.fn(() => []),
  readExerciseSessions: jest.fn(() => []),
}));
jest.mock('@/db/catalog', () => ({ readExercise: jest.fn(() => null) }));
jest.mock('@/domain', () => ({
  sessionMetrics: jest.fn(() => []),
  countedSetCount: jest.fn(() => 2),
  volumeKg: jest.fn(() => 1000),
  personalBests: jest.fn(() => ({ maxWeightKg: null, bestE1rmKg: null, bestSessionVolumeKg: null, bestRepsAtWeight: [] })),
  detectPrs: jest.fn(() => []),
}));
jest.mock('../useLiveWorkout', () => ({ useSignedInUserId: () => 'user-1' }));
const mockPush = jest.fn();
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  return {
    useRouter: () => ({ push: mockPush, replace: jest.fn() }),
    // A screen comes into focus as it mounts; that is the read these tests need.
    useFocusEffect: (effect: () => void) => useEffect(() => effect(), [effect]),
  };
});

const WORDS = {
  en: {
    empty: 'No finished workouts yet',
    more: 'Show older workouts',
    twoSets: '2 counted sets',
    warmup: 'Warm-up',
    notTicked: 'not ticked',
    noRecords: 'This workout holds no record today.',
    link: 'History of this exercise',
    archived: 'Hidden from the exercise picker. Its history stays as it was.',
    timeDistance: 'Time and distance are listed session by session. They are not charted yet.',
    e1rmNote: 'A set logged without RIR has no estimated 1RM, so it leaves a gap rather than a zero.',
    top: 'Top set',
    e1rm: 'Best estimated 1RM',
    fatigue: 'Fatigue 7 of 10',
    bench: 'Barbell Bench Press',
  },
  'pt-BR': {
    empty: 'Nenhum treino finalizado ainda',
    more: 'Mostrar treinos mais antigos',
    twoSets: '2 séries contadas',
    warmup: 'Aquecimento',
    notTicked: 'não marcada',
    noRecords: 'Este treino não detém nenhum recorde hoje.',
    link: 'Histórico deste exercício',
    archived: 'Oculto do seletor de exercícios. O histórico dele continua como estava.',
    timeDistance: 'Tempo e distância aparecem sessão por sessão. Ainda não há gráfico para eles.',
    e1rmNote: 'Uma série registrada sem RIR não tem 1RM estimado, então deixa uma lacuna em vez de um zero.',
    top: 'Série mais pesada',
    e1rm: 'Melhor 1RM estimado',
    fatigue: 'Cansaço 7 de 10',
    bench: 'Supino reto com barra',
  },
} as const;

const BENCH: CatalogExercise = {
  id: 'bench',
  nameKey: 'exercise.barbell_bench_press',
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
};

function performed(overrides: Partial<PerformedSet> = {}): PerformedSet {
  return {
    setIndex: 1,
    setType: 'working',
    weightKg: 100,
    reps: 5,
    rir: 2,
    durationS: null,
    distanceM: null,
    isCompleted: true,
    ...overrides,
  };
}

function metrics(overrides: Partial<SessionMetrics> = {}): SessionMetrics {
  return { topLoadKg: 100, bestE1rmKg: 120, volumeKg: 1000, countedSets: 2, ...overrides };
}

function dated(workoutId: string, localDate: string): DatedSession {
  return { workoutId, title: 'Treino A', startedAt: 0, localDate, performed: [performed()], sets: [] };
}

beforeEach(() => {
  // `clearAllMocks` keeps a return value a previous test set, so each read is put back to "nothing" explicitly.
  jest.clearAllMocks();
  jest.mocked(listFinishedWorkouts).mockReturnValue([]);
  jest.mocked(readSetsOfWorkouts).mockReturnValue(new Map());
  jest.mocked(readFinishedWorkout).mockReturnValue(null);
  jest.mocked(readWorkoutDetail).mockReturnValue([]);
  jest.mocked(readExerciseSessions).mockReturnValue([]);
  jest.mocked(readExercise).mockReturnValue(null);
  jest.mocked(sessionMetrics).mockReturnValue([]);
});

describe.each(MATRIX)('$locale, $unitSystem, $preference', (setting) => {
  const words = WORDS[setting.locale];

  describe('the list', () => {
    it('says plainly when nothing is finished yet', async () => {
      await renderUi(<WorkoutHistoryScreen />, setting);
      expect(screen.getByText(words.empty)).toBeOnTheScreen();
    });

    it('shows each workout with its counted sets, and opens its detail', async () => {
      jest.mocked(listFinishedWorkouts).mockReturnValue([{ id: 'w1', title: 'Treino A', startedAt: 1, localDate: '2026-09-23' }]);
      jest.mocked(readSetsOfWorkouts).mockReturnValue(new Map());
      jest.mocked(sessionMetrics).mockReturnValue([metrics()]);
      await renderUi(<WorkoutHistoryScreen />, setting);

      expect(screen.getByText('Treino A')).toBeOnTheScreen();
      expect(screen.getByText(words.twoSets)).toBeOnTheScreen();
      expect(screen.queryByText(words.more)).toBeNull();
      await fireEvent.press(screen.getByRole('button', { name: new RegExp('^Treino A') }));
      expect(mockPush).toHaveBeenCalledWith({ pathname: '/workouts/[id]', params: { id: 'w1' } });
    });

    it('offers older workouts only when there are more, and reads a longer prefix for them', async () => {
      const many = Array.from({ length: 26 }, (_, at) => ({
        id: `w${String(at)}`,
        title: `T${String(at)}`,
        startedAt: 100 - at,
        localDate: '2026-09-23',
      }));
      jest.mocked(listFinishedWorkouts).mockReturnValue(many);
      jest.mocked(sessionMetrics).mockImplementation((sessions) => sessions.map(() => metrics()));
      await renderUi(<WorkoutHistoryScreen />, setting);

      // One past the page is read to know there is more, and not shown.
      expect(screen.queryByText('T25')).toBeNull();
      await fireEvent.press(screen.getByRole('button', { name: words.more }));
      expect(listFinishedWorkouts).toHaveBeenLastCalledWith('user-1', 51);
    });
  });

  describe('a workout’s detail', () => {
    it('shows every set as logged — the warm-up and the unticked row marked, not dropped (INV-04)', async () => {
      jest.mocked(readFinishedWorkout).mockReturnValue({
        id: 'w1',
        title: 'Treino A',
        startedAt: 0,
        endedAt: 1,
        localDate: '2026-09-23',
        notes: 'bom dia',
        perceivedFatigue: 7,
      });
      jest.mocked(readWorkoutDetail).mockReturnValue([
        {
          workoutExerciseId: 'we1',
          exerciseId: 'bench',
          tracking: 'weight_reps',
          notes: 'ombro ok',
          sets: [performed({ setType: 'warmup', weightKg: 60 }), performed({ setIndex: 2 }), performed({ setIndex: 3, isCompleted: false })],
        },
      ]);
      jest.mocked(readExercise).mockReturnValue(BENCH);
      await renderUi(<WorkoutDetailScreen workoutId="w1" />, setting);

      expect(screen.getByText('Treino A')).toBeOnTheScreen();
      expect(screen.getByText(words.bench)).toBeOnTheScreen();
      // The user's own words, exactly as typed (INV-27).
      expect(screen.getByText('bom dia')).toBeOnTheScreen();
      expect(screen.getByText('ombro ok')).toBeOnTheScreen();
      expect(screen.getByText(words.fatigue)).toBeOnTheScreen();
      expect(screen.getByText(words.warmup)).toBeOnTheScreen();
      expect(screen.getByText(words.notTicked)).toBeOnTheScreen();
      expect(screen.getByText(words.noRecords)).toBeOnTheScreen();

      await fireEvent.press(screen.getByRole('button', { name: words.link }));
      expect(mockPush).toHaveBeenCalledWith({ pathname: '/exercise/[id]', params: { id: 'bench' } });
    });

    it('shows nothing for a workout still in progress — its place is the live screen', async () => {
      jest.mocked(readFinishedWorkout).mockReturnValue({
        id: 'w1',
        title: 'Treino A',
        startedAt: 0,
        endedAt: null,
        localDate: '2026-09-23',
        notes: null,
        perceivedFatigue: null,
      });
      await renderUi(<WorkoutDetailScreen workoutId="w1" />, setting);
      expect(screen.queryByText('Treino A')).toBeNull();
    });
  });

  describe('an exercise’s history', () => {
    it('charts a lifted exercise, and says why the e1RM chart has a gap (INV-07)', async () => {
      jest.mocked(readExercise).mockReturnValue(BENCH);
      jest.mocked(readExerciseSessions).mockReturnValue([dated('w1', '2026-09-20'), dated('w2', '2026-09-23')]);
      jest.mocked(sessionMetrics).mockReturnValue([metrics(), metrics({ bestE1rmKg: null })]);
      await renderUi(<ExerciseHistoryScreen exerciseId="bench" />, setting);

      expect(screen.getByText(words.top)).toBeOnTheScreen();
      expect(screen.getByText(words.e1rm)).toBeOnTheScreen();
      expect(screen.getByText(words.e1rmNote)).toBeOnTheScreen();
      expect(screen.getAllByText('Treino A')).toHaveLength(2);
    });

    it('still opens, with every session, for an exercise archived after use (INV-11)', async () => {
      jest.mocked(readExercise).mockReturnValue({ ...BENCH, archivedAt: 5 });
      jest.mocked(readExerciseSessions).mockReturnValue([dated('w1', '2026-09-20')]);
      jest.mocked(sessionMetrics).mockReturnValue([metrics()]);
      await renderUi(<ExerciseHistoryScreen exerciseId="bench" />, setting);

      expect(screen.getByText(words.archived)).toBeOnTheScreen();
      expect(screen.getByText('Treino A')).toBeOnTheScreen();
    });

    it('lists a hold session by session and charts nothing (decision 6)', async () => {
      jest.mocked(readExercise).mockReturnValue({ ...BENCH, tracking: 'duration' });
      jest.mocked(readExerciseSessions).mockReturnValue([
        { ...dated('w1', '2026-09-20'), performed: [performed({ weightKg: null, reps: null, rir: null, durationS: 90 })] },
      ]);
      jest.mocked(sessionMetrics).mockReturnValue([metrics({ topLoadKg: null, bestE1rmKg: null, volumeKg: null, countedSets: 1 })]);
      await renderUi(<ExerciseHistoryScreen exerciseId="bench" />, setting);

      expect(screen.getByText(words.timeDistance)).toBeOnTheScreen();
      expect(screen.queryByText(words.top)).toBeNull();
      expect(screen.getByText('1:30')).toBeOnTheScreen();
    });
  });
});
