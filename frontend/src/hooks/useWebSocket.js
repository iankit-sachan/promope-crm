/**
 * WebSocket hook for the live activity feed.
 * Connects to ws://localhost:8000/ws/activity/
 * and dispatches new events into the activity store.
 */

import { useEffect, useRef, useCallback } from 'react'
import { useAuthStore } from '../store/authStore'
import { useActivityStore } from '../store/activityStore'

const WS_BASE = import.meta.env.VITE_WS_URL || `ws://${window.location.host}`

export function useActivityFeed() {
  const wsRef = useRef(null)
  const reconnectTimerRef = useRef(null)
  const { isAuthenticated, accessToken } = useAuthStore()
  const { addActivity, setInitialFeed, setConnected } = useActivityStore()

  const connect = useCallback(() => {
    if (!isAuthenticated || !accessToken) return

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
  }, [isAuthenticated, accessToken, addActivity, setInitialFeed, setConnected])

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
  const wsRef = useRef(null)
  const { isAuthenticated, accessToken } = useAuthStore()

  const onNotification = useCallback((callback) => {
    if (!isAuthenticated || !accessToken) return

    const url = `${WS_BASE}/ws/notifications/?token=${accessToken}`
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'new_notification') {
          callback(msg.data)
        }
      } catch (e) {}
    }

    ws.onclose = () => setTimeout(() => onNotification(callback), 5000)
  }, [isAuthenticated, accessToken])

  useEffect(() => {
    return () => {
      if (wsRef.current) wsRef.current.close()
    }
  }, [])

  return { onNotification }
}
