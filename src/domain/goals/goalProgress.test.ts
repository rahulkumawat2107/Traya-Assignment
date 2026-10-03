import { computeGoalProgress, type Goal } from './goalProgress';

const loseWeight: Goal = {
  metric: 'weight',
  startValue: 80,
  targetValue: 72,
  direction: 'decrease',
};

const dailySteps: Goal = {
  metric: 'steps',
  startValue: 0,
  targetValue: 8000,
  direction: 'increase',
};

describe('computeGoalProgress', () => {
  it('reports partial progress towards a decrease goal', () => {
    expect(computeGoalProgress(loseWeight, 76)).toEqual({
      fraction: 0.5,
      remaining: 4,
      achieved: false,
    });
  });

  it('reports partial progress towards an increase goal', () => {
    expect(computeGoalProgress(dailySteps, 2000)).toEqual({
      fraction: 0.25,
      remaining: 6000,
      achieved: false,
    });
  });

  it('is achieved exactly at the target', () => {
    expect(computeGoalProgress(loseWeight, 72)).toEqual({
      fraction: 1,
      remaining: 0,
      achieved: true,
    });
  });

  it('clamps at 100% when the target is exceeded', () => {
    expect(computeGoalProgress(dailySteps, 12_000)).toEqual({
      fraction: 1,
      remaining: 0,
      achieved: true,
    });
  });

  it('reads as 0% when moving away from the target', () => {
    expect(computeGoalProgress(loseWeight, 83)).toEqual({
      fraction: 0,
      remaining: 11,
      achieved: false,
    });
  });

  it('handles a goal whose start already equals the target', () => {
    const goal: Goal = { ...loseWeight, startValue: 72 };
    expect(computeGoalProgress(goal, 72).fraction).toBe(1);
    expect(computeGoalProgress(goal, 75).fraction).toBe(0);
  });
});
