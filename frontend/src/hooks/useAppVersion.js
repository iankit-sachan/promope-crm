/**
 * useAppVersion — checks the backend for the latest published Android APK version.
 * Runs once per hour (staleTime). Only acts when window.Android exists (i.e. inside WebView).
 * Calls native bridge methods showUpdateBanner() or showForceUpdateDialog() as needed.
 */

import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../services/api'
import { useAuthStore } from '../store/authStore'

// Must match defaultConfig.versionCode in android-wrapper-app/app/build.gradle
const CURRENT_VERSION_CODE = 2

export function useAppVersion() {
  const { isAuthenticated } = useAuthStore()

  const { data } = useQuery({
    queryKey: ['app-version'],
    queryFn: () => api.get('/notifications/app-version/?platform=android').then(r => r.data),
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 60,   // re-check once per hour
    refetchOnWindowFocus: false,
  })

  useEffect(() => {
    if (!data || !window.Android) return
    if (data.version_code > CURRENT_VERSION_CODE) {
      if (data.force_update) {
        window.Android.showForceUpdateDialog(
          data.version_name,
          data.release_notes || ''
        )
      } else {
        window.Android.showUpdateBanner(data.version_name)
      }
    }
  }, [data])
}
