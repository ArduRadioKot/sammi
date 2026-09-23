import { create } from "zustand";

interface WorkspaceState {
  credits: number;
  creditsEpoch: number;
  spendCredits: (amount: number) => void;
  restoreCredits: (amount: number) => void;
  invalidateCredits: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  credits: 0,
  creditsEpoch: 0,
  spendCredits: (amount) => set((state) => ({ credits: Math.max(0, state.credits - amount) })),
  restoreCredits: (amount) => set((state) => ({ credits: state.credits + amount })),
  invalidateCredits: () => set((state) => ({ creditsEpoch: state.creditsEpoch + 1 })),
}));
