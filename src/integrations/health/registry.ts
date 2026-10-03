import type { HealthProvider } from './HealthProvider';
import { MockProviderA } from './providers/MockProviderA';
import { MockProviderB } from './providers/MockProviderB';
import { MockProviderC } from './providers/MockProviderC';

export interface HealthRegistry {
  providers: HealthProvider[];
  /** Hooks for the debug screen to drive the simulated provider states. */
  simulation: {
    isScaleInstalled(): boolean;
    setScaleInstalled(installed: boolean): void;
  };
}

/**
 * The only place that knows the providers are mocks. To ship a real
 * integration, add an adapter that implements HealthProvider (for example
 * around HealthKit or Health Connect) and return it from here; nothing else
 * in the app changes.
 */
export function createHealthRegistry(): HealthRegistry {
  const scale = new MockProviderC();
  return {
    providers: [new MockProviderA(), new MockProviderB(), scale],
    simulation: {
      isScaleInstalled: () => scale.isInstalled(),
      setScaleInstalled: installed => scale.setInstalled(installed),
    },
  };
}
