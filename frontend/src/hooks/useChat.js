/**
 * useChat — WebSocket hook for a single chat room.
 *
 * Connects to ws://<host>/ws/chat/<roomType>/<roomId>/?token=<jwt>
 * when roomType + roomId are provided, and disconnects on cleanup.
 *
 * Delegates state updates to chatStore.
 */
import { useEffect, useRef, useCallback } from 'react'
import { useAuthStore } from '../store/authStore'
import { useChatStore } from '../store/chatStore'

const WS_BASE =
  window.location.protocol === 'https:'
    ? `wss://${window.location.host}`
    : `ws://${window.location.host}`

export function useChat(roomType, roomId) {
  const wsRef            = useRef(null)
  const reconnectRef     = useRef(null)
  const isUnmountedRef   = useRef(false)

  const getAccessToken   = useAuthStore((s) => s.getAccessToken)
  const { addMessage, setMessages, markRead, setTyping, setWsConnected, resetUnread } = useChatStore()

  const roomKey = roomType && roomId ? `${roomType}_${roomId}` : null

  const connect = useCallback(() => {
    if (!roomKey || isUnmountedRef.current) return
    const token = getAccessToken()
    if (!token) return

    const url    = `${WS_BASE}/ws/chat/${roomType}/${roomId}/?token=${token}`
    const socket = new WebSocket(url)
    wsRef.current = socket

    socket.onopen = () => {
      setWsConnected(true)
    }

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)

        if (data.type === 'history') {
          setMessages(roomKey, data.messages)
          resetUnread(roomType, roomId)

        } else if (data.type === 'message') {
          const { type: _, ...msg } = data
          addMessage(roomKey, msg)
          resetUnread(roomType, roomId)

        } else if (data.type === 'read_receipt') {
          markRead(roomKey, data.user_id, data.message_ids)

        } else if (data.type === 'typing') {
          setTyping(roomKey, data.user_id, data.user_name, data.is_typing)
        }
      } catch (_) {}
    }

    socket.onclose = () => {
      setWsConnected(false)
      if (!isUnmountedRef.current) {
        reconnectRef.current = setTimeout(connect, 5000)
      }
    }

    socket.onerror = () => {}
  }, [roomKey, roomType, roomId, getAccessToken]) // eslint-disable-line

  useEffect(() => {
    isUnmountedRef.current = false
    connect()
    return () => {
      isUnmountedRef.current = true
      clearTimeout(reconnectRef.current)
      if (wsRef.current) {
        wsRef.current.onclose = null
        wsRef.current.close()
      }
      setWsConnected(false)
    }
  }, [connect])

  /** Send a read receipt for a list of message IDs. */
  const sendRead = useCallback((messageIds) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'read', message_ids: messageIds }))
    }
  }, [])

  /** Broadcast a typing indicator. */
  const sendTyping = useCallback((isTyping) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'typing', is_typing: isTyping }))
    }
  }, [])

  return { sendRead, sendTyping }
}
