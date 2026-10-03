/**
 * Schema as ordered migrations. Each entry runs once, inside a transaction,
 * and the applied count is tracked in `PRAGMA user_version`. Never edit a
 * shipped migration; append a new one.
 */
export const MIGRATIONS: readonly string[][] = [
  [
    `CREATE TABLE measurements (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      metric TEXT NOT NULL,
      value REAL NOT NULL,
      measured_at INTEGER NOT NULL,
      source TEXT NOT NULL,
      external_id TEXT,
      hlc TEXT NOT NULL,
      deleted_at INTEGER,
      sync_status TEXT NOT NULL
    )`,
    // Serves both hot queries: history paging and range scans for a metric.
    `CREATE INDEX idx_measurements_history
      ON measurements (user_id, metric, measured_at DESC, id DESC)`,
    // A provider record can only ever be imported once.
    `CREATE UNIQUE INDEX idx_measurements_external
      ON measurements (source, external_id) WHERE external_id IS NOT NULL`,
    `CREATE TABLE outbox (
      op_id TEXT PRIMARY KEY NOT NULL,
      entity_id TEXT NOT NULL,
      op_type TEXT NOT NULL,
      payload TEXT NOT NULL,
      hlc TEXT NOT NULL,
      status TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt_at INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at INTEGER NOT NULL
    )`,
    `CREATE INDEX idx_outbox_status ON outbox (status)`,
    `CREATE TABLE sync_state (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    )`,
    `CREATE TABLE goals (
      user_id TEXT NOT NULL,
      metric TEXT NOT NULL,
      start_value REAL NOT NULL,
      target_value REAL NOT NULL,
      direction TEXT NOT NULL,
      PRIMARY KEY (user_id, metric)
    )`,
  ],
  // The calories metric was removed. Clear what earlier builds stored so a
  // queued change for it cannot be pushed and rejected.
  [
    `DELETE FROM outbox WHERE entity_id IN
      (SELECT id FROM measurements WHERE metric = 'calories')`,
    `DELETE FROM measurements WHERE metric = 'calories'`,
    `DELETE FROM goals WHERE metric = 'calories'`,
  ],
];

export interface MeasurementRow {
  id: string;
  user_id: string;
  metric: string;
  value: number;
  measured_at: number;
  source: string;
  external_id: string | null;
  hlc: string;
  deleted_at: number | null;
  sync_status: string;
}

export interface OutboxRow {
  op_id: string;
  entity_id: string;
  op_type: string;
  payload: string;
  hlc: string;
  status: string;
  attempts: number;
  next_attempt_at: number;
  last_error: string | null;
  created_at: number;
}
