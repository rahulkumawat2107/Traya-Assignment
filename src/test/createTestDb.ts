import Database from 'better-sqlite3';
import { migrate } from '@/data/db/migrate';
import {
  createSqlDriver,
  type SqlDriver,
  type SqlRow,
} from '@/data/db/SqlDriver';

/** In-memory SQLite behind the same SqlDriver interface the app uses. */
export function createRawTestDb(): SqlDriver {
  const db = new Database(':memory:');
  return createSqlDriver(async (sql, params = []) => {
    const statement = db.prepare(sql);
    if (statement.reader) {
      return { rows: statement.all(...params) as SqlRow[], rowsAffected: 0 };
    }
    const info = statement.run(...params);
    return { rows: [], rowsAffected: info.changes };
  });
}

export async function createTestDb(): Promise<SqlDriver> {
  const db = createRawTestDb();
  await migrate(db);
  return db;
}
