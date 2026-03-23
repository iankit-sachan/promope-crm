/**
 * WebSocket hook for the live activity feed.
 * Connects to ws://localhost:8000/ws/activity/
 * and dispatches new events into the activity store.
 */

import { useEffect, useRef, useCallback } from 'react'
import { useAuthStore } from '../store/authStore'
import { useActivityStore } from '../store/activityStore'

const WS_BASE = import.meta.env.VITE_WS_URL ||
  `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`

/** Roles permitted to watch the global activity feed. */
const ACTIVITY_FEED_ROLES = ['founder', 'admin', 'hr']

export function useActivityFeed() {
  const wsRef = useRef(null)
  const reconnectTimerRef = useRef(null)
  const { isAuthenticated, accessToken, user } = useAuthStore()
  const { addActivity, setInitialFeed, setConnected } = useActivityStore()

  const connect = useCallback(() => {
    if (!isAuthenticated || !accessToken) return
    // Only founder / admin / hr are allowed to watch the global feed.
    if (!ACTIVITY_FEED_ROLES.includes(user?.role)) return

    // Append token as query param (simplest auth for WS)
    const url = `${WS_BASE}/ws/activity/?token=${accessToken}`
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      console.log('[WS] Activity feed connected')
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'initial_feed') {
          setInitialFeed(msg.data)
        } else if (msg.type === 'new_activity') {
          addActivity(msg.data)
        }
      } catch (e) {
        console.warn('[WS] Failed to parse message', e)
      }
    }

    ws.onclose = () => {
      setConnected(false)
      console.log('[WS] Activity feed disconnected. Reconnecting in 5s...')
      reconnectTimerRef.current = setTimeout(connect, 5000)
    }

    ws.onerror = (err) => {
      console.warn('[WS] Activity feed error', err)
      ws.close()
    }

    // Keepalive ping every 30 seconds
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }))
      }
    }, 30000)

    return () => clearInterval(pingInterval)
  }, [isAuthenticated, accessToken, user, addActivity, setInitialFeed, setConnected])

  useEffect(() => {
    connect()
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      if (wsRef.current) wsRef.current.close()
    }
  }, [connect])

  return useActivityStore()
}

export function useNotificationSocket() {
  const wsRef              = useRef(null)
  const reconnectTimerRef  = useRef(null)
  const notifCallbackRef   = useRef(null)   // callback for regular notifications
  const syncCallbackRef    = useRef(null)   // callback for data_sync events
  const { isAuthenticated, accessToken } = useAuthStore()

  const connect = useCallback(() => {
    if (!isAuthenticated || !accessToken) return

    const url = `${WS_BASE}/ws/notifications/?token=${accessToken}`
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'new_notification') {
          const data = msg.data
          if (data?.msg_type === 'data_sync') {
            // Route to data_sync handler (web + Android WebView bridge)
            syncCallbackRef.current?.(data)
          } else {
            // Regular user-visible notification
            notifCallbackRef.current?.(data)
          }
        }
      } catch (e) {}
    }

    ws.onclose = () => {
      reconnectTimerRef.current = setTimeout(connect, 5000)
    }
  }, [isAuthenticated, accessToken])

  useEffect(() => {
    connect()
    // Expose native bridge callback for Android WebView
    window.__crmSyncCallback = (resourceType, resourceId, action) => {
      syncCallbackRef.current?.({ resource_type: resourceType, resource_id: resourceId, action })
    }
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      if (wsRef.current) wsRef.current.close()
      delete window.__crmSyncCallback
    }
  }, [connect])

  /** Register a callback for regular user-visible notifications */
  const onNotification = useCallback((callback) => {
    notifCallbackRef.current = callback
  }, [])

  /** Register a callback for data_sync events (auto-refresh triggers) */
  const onDataSync = useCallback((callback) => {
    syncCallbackRef.current = callback
  }, [])

  return { onNotification, onDataSync }
}
