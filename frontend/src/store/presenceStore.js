/**
 * Presence store — holds the real-time employee presence snapshot
 * received from the /ws/presence/ WebSocket.
 */

import { create } from 'zustand'

export const usePresenceStore = create((set) => ({
  employees:   [],
  summary:     { total: 0, online: 0, away: 0, idle: 0, offline: 0, present: 0 },
  lastUpdated: null,
  isConnected: false,

  setPresenceData: (employees, summary) => {
    set({
      employees,
      summary: summary ?? {
        total:   employees.length,
        online:  employees.filter(e => e.status === 'online').length,
        away:    employees.filter(e => e.status === 'away').length,
        idle:    employees.filter(e => e.status === 'idle').length,
        offline: employees.filter(e => e.status === 'offline').length,
        present: employees.filter(e => e.checked_in).length,
      },
      lastUpdated: new Date(),
    })
  },

  setConnected: (v) => set({ isConnected: v }),
}))
