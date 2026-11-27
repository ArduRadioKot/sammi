import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { RefreshHours } from "@/services/relationship-analysis";

type Preferences = {
  sendOnEnter: boolean;
  searchByDefault: boolean | null;
  searchKeywords: string;
  setSearchKeywords: (value: string) => void;
  refreshHours: RefreshHours | "automatic";
  setSendOnEnter: (value: boolean) => void;
  setSearchByDefault: (value: boolean | null) => void;
  setRefreshHours: (value: RefreshHours | "automatic") => void;
};

export const usePreferences = create<Preferences>()(persist((set) => ({
  sendOnEnter: true,
  searchByDefault: null,
  refreshHours: "automatic",
  searchKeywords: "",
  setSearchKeywords: (searchKeywords) => set({ searchKeywords }),
  setSendOnEnter: (sendOnEnter) => set({ sendOnEnter }),
  setSearchByDefault: (searchByDefault) => set({ searchByDefault }),
  setRefreshHours: (refreshHours) => set({ refreshHours }),
}), {
  name: "sammi-preferences",
  partialize: ({ sendOnEnter, searchByDefault, refreshHours, searchKeywords }) => ({ sendOnEnter, searchByDefault, refreshHours, searchKeywords }),
}));
