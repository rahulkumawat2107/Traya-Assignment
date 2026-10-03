import { v4 as uuidv4 } from 'uuid';

export interface IdGenerator {
  newId(): string;
}

/**
 * Relies on the `react-native-get-random-values` polyfill imported at the top
 * of index.js. Tests inject a deterministic fake instead.
 */
export const uuidGenerator: IdGenerator = {
  newId: () => uuidv4(),
};
