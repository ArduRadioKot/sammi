import { create } from "zustand";
import type { CommandActionId } from "@/types/domain";

type CommandIntent = {
  action: CommandActionId;
  at: number;
};

interface UiState {
  sidebarCollapsed: boolean;
  mobileNavOpen: boolean;
  commandOpen: boolean;
  commandIntent: CommandIntent | null;
  reduceTransparency: boolean;
  toggleSidebar: () => void;
  setMobileNavOpen: (open: boolean) => void;
  setCommandOpen: (open: boolean) => void;
  dispatchCommand: (action: CommandActionId) => void;
  consumeCommand: () => void;
  setReduceTransparency: (value: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  sidebarCollapsed: false,
  mobileNavOpen: false,
  commandOpen: false,
  commandIntent: null,
  reduceTransparency: false,
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setMobileNavOpen: (open) => set({ mobileNavOpen: open }),
  setCommandOpen: (open) => set({ commandOpen: open }),
  dispatchCommand: (action) => set({ commandIntent: { action, at: Date.now() }, commandOpen: false }),
  consumeCommand: () => set({ commandIntent: null }),
  setReduceTransparency: (value) => set({ reduceTransparency: value }),
}));
