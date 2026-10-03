export type SqlValue = string | number | null;
export type SqlRow = Record<string, SqlValue>;

export interface SqlResult {
  rows: SqlRow[];
  rowsAffected: number;
}

export interface SqlExecutor {
  execute(sql: string, params?: SqlValue[]): Promise<SqlResult>;
}

/**
 * The only database surface the rest of the app sees. Two implementations
 * exist: op-sqlite on device and better-sqlite3 in Jest, so repository tests
 * run real SQL without a simulator.
 */
export interface SqlDriver extends SqlExecutor {
  /**
   * Runs `fn` inside a single transaction. Everything written through `tx`
   * commits together or not at all. Inside `fn`, always use `tx`, never the
   * driver itself: the driver would queue behind the open transaction.
   */
  transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T>;
}

export type RawExecute = (
  sql: string,
  params?: SqlValue[],
) => Promise<SqlResult>;

/**
 * Wraps a single-connection `execute` function into a SqlDriver.
 *
 * All top-level calls go through one queue. Without it, an unrelated query
 * issued while a transaction is awaiting would run on the same connection
 * between BEGIN and COMMIT and silently become part of that transaction (or
 * be rolled back with it).
 */
export function createSqlDriver(raw: RawExecute): SqlDriver {
  let tail: Promise<unknown> = Promise.resolve();

  const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
    const run = tail.then(task);
    tail = run.catch(() => undefined);
    return run;
  };

  return {
    execute: (sql, params) => enqueue(() => raw(sql, params)),
    transaction: fn =>
      enqueue(async () => {
        await raw('BEGIN IMMEDIATE');
        try {
          const result = await fn({ execute: raw });
          await raw('COMMIT');
          return result;
        } catch (error) {
          await raw('ROLLBACK');
          throw error;
        }
      }),
  };
}

export function placeholders(count: number): string {
  return new Array(count).fill('?').join(', ');
}
