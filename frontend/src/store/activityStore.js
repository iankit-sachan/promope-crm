/**
 * Activity feed store - holds the live event stream.
 */

import { create } from 'zustand'

export const useActivityStore = create((set) => ({
  activities: [],
  isConnected: false,

  setInitialFeed: (activities) => set({ activities }),

  addActivity: (activity) =>
    set((state) => ({
      // Prepend new activity and keep max 100 in memory
      activities: [activity, ...state.activities].slice(0, 100),
    })),

  setConnected: (isConnected) => set({ isConnected }),

  clearFeed: () => set({ activities: [] }),
}))
