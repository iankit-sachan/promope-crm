/**
 * Auth store using Zustand.
 * Persists tokens and user info to localStorage.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,

      login: (data) => {
        set({
          user: data.user,
          accessToken: data.access,
          refreshToken: data.refresh,
          isAuthenticated: true,
        })
        // Record attendance check-in after login (fire-and-forget)
        import('../services/api').then(({ attendanceService }) => {
          attendanceService.checkin().catch(() => {})
        })
      },

      logout: () => {
        // Record attendance check-out before clearing state (fire-and-forget)
        import('../services/api').then(({ attendanceService }) => {
          attendanceService.checkout().catch(() => {})
        })
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
        })
      },

      updateUser: (userData) => {
        set((state) => ({
          user: { ...state.user, ...userData },
        }))
      },

      refreshProfile: async () => {
        try {
          const { authService } = await import('../services/api')
          const { data } = await authService.profile()
          set((state) => ({ user: { ...state.user, ...data } }))
        } catch {}
      },

      updateTokens: (access, refresh) => {
        set({ accessToken: access, refreshToken: refresh })
      },

      getAccessToken: () => get().accessToken,
      getRefreshToken: () => get().refreshToken,
    }),
    {
      name: 'crm-auth',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)
