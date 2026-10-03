import { open } from '@op-engineering/op-sqlite';
import { createSqlDriver, type SqlDriver, type SqlRow } from './SqlDriver';

/** Opens the on-device database. Only the composition root calls this. */
export function openDatabase(name: string): SqlDriver {
  const db = open({ name });
  return createSqlDriver(async (sql, params) => {
    const result = await db.execute(sql, params);
    return {
      rows: (result.rows ?? []) as SqlRow[],
      rowsAffected: result.rowsAffected ?? 0,
    };
  });
}
