/**
 * useRemoteControl — WebSocket hook for the Remote Control viewer (manager side).
 *
 * Connects to ws/remote/session/<sessionId>/ and:
 *  - Receives screen frames and draws them to a <canvas>
 *  - Sends mouse move / click / scroll / keyboard events
 *  - Reports session state changes (accepted / rejected / ended)
 */
import { useEffect, useRef, useCallback, useState } from 'react'
import { useAuthStore } from '../store/authStore'

export function useRemoteControl({ sessionId, canvasRef, onStateChange }) {
  const { tokens } = useAuthStore()
  const wsRef       = useRef(null)
  const [connected, setConnected] = useState(false)

  // ── Connect ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!sessionId) return

    const token = tokens?.access
    const host  = window.location.hostname
    const port  = window.location.port ? `:${window.location.port}` : ''
    // Use ws in dev (Vite proxies everything), wss in production
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const url = `${protocol}://${host}${port}/ws/remote/session/${sessionId}/?token=${token}`

    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => setConnected(true)

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)

        if (data.type === 'frame') {
          drawFrame(data.data, data.w, data.h)
        } else if (data.type === 'session_update' || data.event) {
          const ev = data.event || data.type
          onStateChange?.(ev, data)
        }
      } catch {}
    }

    ws.onclose  = () => setConnected(false)
    ws.onerror  = (err) => console.error('RemoteControl WS error:', err)

    return () => ws.close()
  }, [sessionId])   // eslint-disable-line

  // ── Draw frame to canvas ─────────────────────────────────────────────────
  const drawFrame = useCallback((base64Data, srcW, srcH) => {
    const canvas = canvasRef?.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const img = new Image()
    img.onload = () => {
      canvas.width  = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    }
    img.src = `data:image/jpeg;base64,${base64Data}`
  }, [canvasRef])

  // ── Send helper ──────────────────────────────────────────────────────────
  const send = useCallback((obj) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(obj))
    }
  }, [])

  // ── Mouse event handlers (attach to canvas) ──────────────────────────────
  const onMouseMove = useCallback((e) => {
    const rect = e.target.getBoundingClientRect()
    send({
      type: 'mouse_move',
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top)  / rect.height,
    })
  }, [send])

  const onMouseDown = useCallback((e) => {
    const rect = e.target.getBoundingClientRect()
    const button = e.button === 2 ? 'right' : e.button === 1 ? 'middle' : 'left'
    send({
      type: 'mouse_click',
      button,
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top)  / rect.height,
    })
  }, [send])

  const onWheel = useCallback((e) => {
    const rect = e.target.getBoundingClientRect()
    send({
      type: 'mouse_scroll',
      x:  (e.clientX - rect.left) / rect.width,
      y:  (e.clientY - rect.top)  / rect.height,
      dy: Math.sign(e.deltaY) * -3,
    })
  }, [send])

  const onKeyDown = useCallback((e) => {
    e.preventDefault()
    const parts = []
    if (e.ctrlKey)  parts.push('ctrl')
    if (e.altKey)   parts.push('alt')
    if (e.shiftKey) parts.push('shift')
    if (e.metaKey)  parts.push('win')
    const key = e.key === ' ' ? 'space' : e.key.toLowerCase()
    if (!['control','alt','shift','meta'].includes(key)) parts.push(key)
    if (parts.length) send({ type: 'key', key: parts.join('+') })
  }, [send])

  const endSession = useCallback(() => send({ type: 'end_session' }), [send])

  return { connected, onMouseMove, onMouseDown, onWheel, onKeyDown, endSession }
}
