/**
 * Correlated subqueries name their columns in full — task 004 stage 6 device pass.
 *
 * Drizzle writes a column bare inside a raw `sql` fragment when the query around it has no join, and a correlated
 * subquery binds a bare name to its own table: the routines list counted `"routine_id" = "id"` and read "0 exercises"
 * for every routine. The fragments are rendered here inside a query **with no join** — the case that broke — without
 * opening a database, because the SQL text is the thing that was wrong.
 */
import { drizzle } from 'drizzle-orm/sqlite-proxy';

import { bodyWeightOnTheDay } from '../history';
import { liveExerciseCount } from '../routines';
import { routines, workouts } from '../schema';

jest.mock('../client', () => ({ db: {}, sqlite: {} }));

const render = drizzle(async () => ({ rows: [] }));

describe('a correlated subquery', () => {
  it('counts a routine’s exercises against the routine, not against itself', () => {
    const text = render.select({ id: routines.id, count: liveExerciseCount }).from(routines).toSQL().sql;
    expect(text).toContain('"routine_exercises"."routine_id" = "routines"."id"');
    expect(text).not.toMatch(/WHERE\s+"routine_id"/);
  });

  it('takes the body weight of the workout’s own user, on or before its own day (INV-07, INV-17)', () => {
    const text = render.select({ id: workouts.id, bodyWeight: bodyWeightOnTheDay }).from(workouts).toSQL().sql;
    expect(text).toContain('"body_weight_log"."user_id" = "workouts"."user_id"');
    expect(text).toContain('"body_weight_log"."measured_on" <= "workouts"."local_date"');
  });
});
