/**
 * usePresence — WebSocket hook for real-time employee presence tracking.
 *
 * Connects to ws://<host>/ws/presence/?token=<jwt>
 * - Sends { type: 'ping' }  every 30 seconds as heartbeat
 * - Sends { type: 'away' }  after 5 minutes  of no user activity
 * - Sends { type: 'idle' }  after 15 minutes of no user activity
 * - Reverts to 'online' on any mouse/keyboard/touch event
 * - Marks 'away' when the browser tab is hidden
 * - Updates presenceStore with every snapshot received
 *
 * Status escalation:
 *   activity → Online
 *   5 min idle → Away   (then starts 10-min idle countdown)
 *   15 min idle → Idle
 *   any activity → Online (clears both timers)
 */

import { useEffect, useRef, useCallback } from 'react'
import { useAuthStore }    from '../store/authStore'
import { usePresenceStore } from '../store/presenceStore'

const WS_BASE         = import.meta.env.VITE_WS_URL ||
  `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`
const HEARTBEAT_MS    = 30_000       // 30 s
const AWAY_TIMEOUT_MS = 5 * 60_000  // 5 min  → away
const IDLE_TIMEOUT_MS = 15 * 60_000 // 15 min → idle (10 min after away)

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keypress', 'scroll', 'touchstart', 'click']

export function usePresence() {
  const { isAuthenticated, accessToken } = useAuthStore()
  const { setPresenceData, setConnected } = usePresenceStore()

  const wsRef          = useRef(null)
  const heartbeatRef   = useRef(null)
  const inactivityRef  = useRef(null)   // away timer (5 min)
  const idleTimerRef   = useRef(null)   // idle escalation timer (10 min after away)
  const reconnectRef   = useRef(null)
  const isAwayRef      = useRef(false)
  const isIdleRef      = useRef(false)
  const mountedRef     = useRef(true)

  // ── send helpers ────────────────────────────────────────────────────────────

  const send = useCallback((msg) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg))
    }
  }, [])

  const markOnline = useCallback(() => {
    if (isAwayRef.current || isIdleRef.current) {
      isAwayRef.current = false
      isIdleRef.current = false
      send({ type: 'ping' })
    }
  }, [send])

  const markIdle = useCallback(() => {
    if (!isIdleRef.current) {
      isIdleRef.current = true
      isAwayRef.current = true  // idle ⊇ away
      send({ type: 'idle' })
    }
  }, [send])

  const markAway = useCallback(() => {
    if (!isAwayRef.current && !isIdleRef.current) {
      isAwayRef.current = true
      send({ type: 'away' })
      // Escalate to idle after a further 10 min (total 15 min from last activity)
      clearTimeout(idleTimerRef.current)
      idleTimerRef.current = setTimeout(
        markIdle,
        IDLE_TIMEOUT_MS - AWAY_TIMEOUT_MS  // 10 min
      )
    }
  }, [send, markIdle])

  // ── inactivity timer ────────────────────────────────────────────────────────

  const resetInactivity = useCallback(() => {
    markOnline()
    clearTimeout(inactivityRef.current)
    clearTimeout(idleTimerRef.current)
    inactivityRef.current = setTimeout(markAway, AWAY_TIMEOUT_MS)
  }, [markOnline, markAway])

  // ── WebSocket connect ────────────────────────────────────────────────────────

  const connect = useCallback(() => {
    if (!isAuthenticated || !accessToken || !mountedRef.current) return

    const url = `${WS_BASE}/ws/presence/?token=${accessToken}`
    const ws  = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      if (!mountedRef.current) return ws.close()
      setConnected(true)
      console.log('[Presence] connected')
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'presence_snapshot') {
          setPresenceData(msg.users, msg.summary)
        }
      } catch {}
    }

    ws.onclose = () => {
      setConnected(false)
      console.log('[Presence] disconnected — reconnecting in 5 s')
      if (mountedRef.current) {
        reconnectRef.current = setTimeout(connect, 5000)
      }
    }

    ws.onerror = () => ws.close()

    // Heartbeat every 30 s
    heartbeatRef.current = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) send({ type: 'ping' })
    }, HEARTBEAT_MS)

    return ws
  }, [isAuthenticated, accessToken, setPresenceData, setConnected, send])

  // ── lifecycle ────────────────────────────────────────────────────────────────

  useEffect(() => {
    mountedRef.current = true
    connect()

    // Activity listeners
    ACTIVITY_EVENTS.forEach(evt =>
      window.addEventListener(evt, resetInactivity, { passive: true })
    )
    resetInactivity() // start away timer immediately

    // Tab visibility: hidden tab → away; visible → reset
    const handleVisibility = () => {
      if (document.hidden) markAway()
      else resetInactivity()
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      mountedRef.current = false
      clearInterval(heartbeatRef.current)
      clearTimeout(inactivityRef.current)
      clearTimeout(idleTimerRef.current)
      clearTimeout(reconnectRef.current)
      ACTIVITY_EVENTS.forEach(evt =>
        window.removeEventListener(evt, resetInactivity)
      )
      document.removeEventListener('visibilitychange', handleVisibility)
      if (wsRef.current) wsRef.current.close()
    }
  }, [connect, resetInactivity, markAway])
}
