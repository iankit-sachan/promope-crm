/**
 * useAppVersion — checks the backend for the latest app version.
 * - Android WebView: calls native bridge methods for update prompts.
 * - Web browser: shows a toast banner prompting the user to refresh.
 * Runs once per hour (staleTime).
 */

import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../services/api'
import { useAuthStore } from '../store/authStore'
import toast from 'react-hot-toast'

// Bump this every time you deploy a new web build.
// The deploy script auto-creates an AppVersion row with the new code.
const CURRENT_VERSION_CODE = 3

const DISMISSED_KEY = 'crm-update-dismissed-version'

export function useAppVersion() {
  const { isAuthenticated } = useAuthStore()
  const hasShownWeb = useRef(false)

  const { data } = useQuery({
    queryKey: ['app-version'],
    queryFn: () => api.get('/notifications/app-version/?platform=android').then(r => r.data),
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 60,   // re-check once per hour
    refetchOnWindowFocus: true,
  })

  useEffect(() => {
    if (!data) return
    if (data.version_code <= CURRENT_VERSION_CODE) return

    // Android WebView — use native bridge
    if (window.Android) {
      if (data.force_update) {
        window.Android.showForceUpdateDialog(
          data.version_name,
          data.release_notes || ''
        )
      } else {
        window.Android.showUpdateBanner(data.version_name)
      }
      return
    }

    // Web browser — show toast notification
    const dismissed = localStorage.getItem(DISMISSED_KEY)
    if (dismissed === String(data.version_code) && !data.force_update) return
    if (hasShownWeb.current) return
    hasShownWeb.current = true

    toast(
      (t) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div>
            <strong>Update Available (v{data.version_name})</strong>
            {data.release_notes && (
              <p style={{ margin: '4px 0 0', fontSize: '13px', opacity: 0.8 }}>
                {data.release_notes}
              </p>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => {
                toast.dismiss(t.id)
                window.location.reload()
              }}
              style={{
                padding: '6px 16px', borderRadius: '8px', border: 'none',
                background: '#6366f1', color: '#fff', fontWeight: 600,
                cursor: 'pointer', fontSize: '13px',
              }}
            >
              Refresh Now
            </button>
            {!data.force_update && (
              <button
                onClick={() => {
                  localStorage.setItem(DISMISSED_KEY, String(data.version_code))
                  toast.dismiss(t.id)
                }}
                style={{
                  padding: '6px 16px', borderRadius: '8px', border: '1px solid #475569',
                  background: 'transparent', color: '#94a3b8',
                  cursor: 'pointer', fontSize: '13px',
                }}
              >
                Later
              </button>
            )}
          </div>
        </div>
      ),
      {
        duration: data.force_update ? Infinity : 30000,
        position: 'top-center',
        style: {
          background: '#1e293b',
          color: '#e2e8f0',
          border: '1px solid #334155',
          maxWidth: '400px',
        },
      }
    )
  }, [data])
}
