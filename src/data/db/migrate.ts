import { MIGRATIONS } from './schema';
import type { SqlDriver } from './SqlDriver';

/** Applies any migrations not yet recorded in `PRAGMA user_version`. */
export async function migrate(
  db: SqlDriver,
  migrations: readonly string[][] = MIGRATIONS,
): Promise<number> {
  const result = await db.execute('PRAGMA user_version');
  const current = Number(result.rows[0]?.user_version ?? 0);

  for (let version = current; version < migrations.length; version++) {
    const statements = migrations[version]!;
    await db.transaction(async tx => {
      for (const statement of statements) {
        await tx.execute(statement);
      }
      // PRAGMA does not accept bound parameters; the value is our own index.
      await tx.execute(`PRAGMA user_version = ${version + 1}`);
    });
  }
  return migrations.length;
}
