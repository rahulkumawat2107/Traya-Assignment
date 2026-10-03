import { migrate } from './migrate';
import { MIGRATIONS } from './schema';
import { createRawTestDb } from '@/test/createTestDb';

describe('SqlDriver', () => {
  it('commits everything written inside a transaction', async () => {
    const db = createRawTestDb();
    await db.execute('CREATE TABLE t (v INTEGER)');

    const returned = await db.transaction(async tx => {
      await tx.execute('INSERT INTO t VALUES (?)', [1]);
      await tx.execute('INSERT INTO t VALUES (?)', [2]);
      return 'done';
    });

    expect(returned).toBe('done');
    expect((await db.execute('SELECT * FROM t')).rows).toHaveLength(2);
  });

  it('rolls back everything when the callback throws', async () => {
    const db = createRawTestDb();
    await db.execute('CREATE TABLE t (v INTEGER)');

    await expect(
      db.transaction(async tx => {
        await tx.execute('INSERT INTO t VALUES (?)', [1]);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect((await db.execute('SELECT * FROM t')).rows).toHaveLength(0);
  });

  it('keeps unrelated queries out of an open transaction', async () => {
    const db = createRawTestDb();
    await db.execute('CREATE TABLE t (v INTEGER)');

    let release!: () => void;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });

    const failing = db.transaction(async tx => {
      await tx.execute('INSERT INTO t VALUES (?)', [1]);
      await gate;
      throw new Error('boom');
    });
    // Issued while the transaction is still open. If it ran immediately it
    // would be rolled back along with the transaction.
    const outside = db.execute('INSERT INTO t VALUES (?)', [2]);
    release();

    await expect(failing).rejects.toThrow('boom');
    await outside;
    expect((await db.execute('SELECT v FROM t')).rows).toEqual([{ v: 2 }]);
  });

  it('keeps working after a failed statement', async () => {
    const db = createRawTestDb();
    await expect(db.execute('SELECT * FROM missing')).rejects.toThrow();
    expect((await db.execute('SELECT 1 AS one')).rows).toEqual([{ one: 1 }]);
  });
});

describe('migrate', () => {
  it('applies migrations once and is safe to run again', async () => {
    const db = createRawTestDb();
    await migrate(db);
    await migrate(db);

    const version = await db.execute('PRAGMA user_version');
    expect(version.rows[0]?.user_version).toBe(MIGRATIONS.length);
    const tables = await db.execute(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    );
    expect(tables.rows.map(r => r.name)).toEqual(
      expect.arrayContaining(['goals', 'measurements', 'outbox', 'sync_state']),
    );
  });

  it('clears data for the removed calories metric on upgrade', async () => {
    const db = createRawTestDb();
    await migrate(db, MIGRATIONS.slice(0, 1));
    const insert = (id: string, metric: string) =>
      db.execute(
        `INSERT INTO measurements
          (id, user_id, metric, value, measured_at, source, hlc, sync_status)
         VALUES (?, 'u', ?, 1, 1, 'provider:a', 'h', 'pending')`,
        [id, metric],
      );
    await insert('c1', 'calories');
    await insert('w1', 'water');
    await db.execute(
      `INSERT INTO outbox (op_id, entity_id, op_type, payload, hlc, status, created_at)
       VALUES ('o1', 'c1', 'create', '{}', 'h', 'pending', 1), ('o2', 'w1', 'create', '{}', 'h', 'pending', 1)`,
    );

    await migrate(db);

    expect((await db.execute('SELECT id FROM measurements')).rows).toEqual([
      { id: 'w1' },
    ]);
    expect((await db.execute('SELECT op_id FROM outbox')).rows).toEqual([
      { op_id: 'o2' },
    ]);
  });

  it('applies only the migrations added since the last run', async () => {
    const db = createRawTestDb();
    await migrate(db, [['CREATE TABLE a (v INTEGER)']]);
    await migrate(db, [
      ['CREATE TABLE a (v INTEGER)'],
      ['CREATE TABLE b (v INTEGER)'],
    ]);
    expect((await db.execute('SELECT * FROM b')).rows).toEqual([]);
  });

  it('leaves the version untouched when a migration fails', async () => {
    const db = createRawTestDb();
    await expect(
      migrate(db, [['CREATE TABLE a (v INTEGER)', 'THIS IS NOT SQL']]),
    ).rejects.toThrow();
    expect(
      (await db.execute('PRAGMA user_version')).rows[0]?.user_version,
    ).toBe(0);
    await expect(db.execute('SELECT * FROM a')).rejects.toThrow();
  });
});
