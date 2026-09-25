import { getTableName, sql, type AnyColumn, type SQL, type Table } from 'drizzle-orm';

/**
 * A column written as `"table"."column"`, whatever query it ends up in — for the inside of a raw `sql` subquery.
 *
 * **Drizzle writes a column bare inside a `sql` fragment when the query around it has no join**, and a correlated
 * subquery then binds the bare name to *its own* table. The routines list counted `"routine_id" = "id"` — `id` being
 * `routine_exercises.id` — so every routine read "0 exercises" (task 004 stage 6 device pass; stage 5a's). The same
 * fragment is qualified correctly the moment the outer query joins something, which is why a correct subquery can
 * break by having a join removed. Qualifying by hand takes the question away. (A column nested in a fragment of its
 * own is qualified too; the `sql.identifier`s make the rendering explicit rather than relying on that.)
 */
export function qualified(table: Table, column: AnyColumn): SQL {
  return sql`${sql.identifier(getTableName(table))}.${sql.identifier(column.name)}`;
}
