import type { Goal, GoalDirection } from '@/domain/goals/goalProgress';
import type { MetricType } from '@/domain/measurement/types';
import type { SqlDriver } from '../db/SqlDriver';

export const DEFAULT_GOALS: readonly Goal[] = [
  { metric: 'weight', startValue: 78, targetValue: 72, direction: 'decrease' },
  { metric: 'steps', startValue: 0, targetValue: 8000, direction: 'increase' },
  { metric: 'sleep', startValue: 0, targetValue: 480, direction: 'increase' },
  {
    metric: 'calories',
    startValue: 0,
    targetValue: 500,
    direction: 'increase',
  },
  { metric: 'water', startValue: 0, targetValue: 2000, direction: 'increase' },
  { metric: 'workout', startValue: 0, targetValue: 30, direction: 'increase' },
];

export class GoalRepository {
  constructor(
    private readonly db: SqlDriver,
    private readonly userId: string,
  ) {}

  async get(metric: MetricType): Promise<Goal | null> {
    const result = await this.db.execute(
      'SELECT * FROM goals WHERE user_id = ? AND metric = ?',
      [this.userId, metric],
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return {
      metric: row.metric as MetricType,
      startValue: Number(row.start_value),
      targetValue: Number(row.target_value),
      direction: row.direction as GoalDirection,
    };
  }

  async getAll(): Promise<Goal[]> {
    const result = await this.db.execute(
      'SELECT * FROM goals WHERE user_id = ?',
      [this.userId],
    );
    return result.rows.map(row => ({
      metric: row.metric as MetricType,
      startValue: Number(row.start_value),
      targetValue: Number(row.target_value),
      direction: row.direction as GoalDirection,
    }));
  }

  async set(goal: Goal): Promise<void> {
    await this.db.execute(
      `INSERT INTO goals (user_id, metric, start_value, target_value, direction)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id, metric) DO UPDATE SET
         start_value = excluded.start_value,
         target_value = excluded.target_value,
         direction = excluded.direction`,
      [
        this.userId,
        goal.metric,
        goal.startValue,
        goal.targetValue,
        goal.direction,
      ],
    );
  }

  /** Seeds goals on first launch without overwriting ones already stored. */
  async ensureDefaults(goals: readonly Goal[] = DEFAULT_GOALS): Promise<void> {
    for (const goal of goals) {
      await this.db.execute(
        `INSERT INTO goals (user_id, metric, start_value, target_value, direction)
         VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`,
        [
          this.userId,
          goal.metric,
          goal.startValue,
          goal.targetValue,
          goal.direction,
        ],
      );
    }
  }
}
