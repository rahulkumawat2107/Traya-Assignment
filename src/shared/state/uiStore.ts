import { create } from 'zustand';
import type { HistoryRange } from '@/domain/measurement/types';

interface UiState {
  /** Range selected on the dashboard. */
  range: HistoryRange;
  setRange: (range: HistoryRange) => void;
}

export const useUiStore = create<UiState>(set => ({
  range: '7d',
  setRange: range => set({ range }),
}));
