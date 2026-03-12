/**
 * ChatPopup — Floating WhatsApp/Messenger-style chat widget.
 *
 * Renders a fixed button (bottom-right) that toggles a chat panel.
 * Conversation list → click → ChatWindow with live WebSocket messages.
 *
 * Reuses all existing infrastructure:
 *  - useChat(type, id)  WebSocket hook
 *  - useChatStore       conversations / messages / unread / typing
 *  - usePresenceStore   online/away/offline status
 *  - chatService.*      REST calls
 *  - chatService.messageableUsers  user list for new-DM search (role-filtered by backend)
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate }    from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore }     from '../../store/authStore'
import { useChatStore }     from '../../store/chatStore'
import { usePresenceStore } from '../../store/presenceStore'
import { useChat }          from '../../hooks/useChat'
import { chatService } from '../../services/api'

// ─── helpers ────────────────────────────────────────────────────────────────

function getInitials(name = '') {
  return name
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

function timeAgo(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  if (isNaN(d)) return ''
  const diff = Math.floor((Date.now() - d) / 1000)
  if (diff < 60)  return 'now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return `${Math.floor(diff / 86400)}d`
}

// ─── Presence dot helper (stable per userId) ────────────────────────────────

function useOnlineStatus(userId) {
  return usePresenceStore(
    useCallback(
      (s) => s.employees.find((e) => e.user_id === userId)?.status ?? 'offline',
      [userId]
    )
  )
}

const STATUS_COLORS = {
  online:  'bg-green-400',
  away:    'bg-yellow-400',
  idle:    'bg-yellow-400',
  offline: 'bg-slate-500',
}

// ─── Avatar ─────────────────────────────────────────────────────────────────

function Avatar({ name, size = 'sm' }) {
  const sz = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-9 h-9 text-sm'
  return (
    <div className={`${sz} rounded-full bg-indigo-600 flex items-center justify-center font-semibold text-white flex-shrink-0`}>
      {getInitials(name)}
    </div>
  )
}

// ─── StatusDot ──────────────────────────────────────────────────────────────

function StatusDot({ userId }) {
  const status = useOnlineStatus(userId)
  return (
    <span className={`w-2.5 h-2.5 rounded-full border-2 border-slate-800 flex-shrink-0 ${STATUS_COLORS[status] ?? 'bg-slate-500'}`} />
  )
}

// ─── MessageBubble ──────────────────────────────────────────────────────────

function MessageBubble({ msg, isMine, otherName }) {
  const hasFile = msg.file_url || msg.file_name
  return (
    <div className={`flex items-end gap-1.5 mb-1.5 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
      {!isMine && (
        <div className="w-6 h-6 rounded-full bg-indigo-700 flex items-center justify-center text-[10px] font-semibold text-white flex-shrink-0 mb-0.5">
          {getInitials(otherName)}
        </div>
      )}
      <div
        className={`max-w-[70%] px-3 py-1.5 text-sm leading-snug break-words ${
          isMine
            ? 'bg-indigo-600 text-white rounded-2xl rounded-br-sm'
            : 'bg-slate-700 text-slate-100 rounded-2xl rounded-bl-sm'
        }`}
      >
        {hasFile ? (
          <a
            href={msg.file_url || '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="underline opacity-80 text-xs"
          >
            📎 {msg.file_name || 'Attachment'}
          </a>
        ) : (
          msg.content
        )}
        <span className={`block text-[10px] mt-0.5 ${isMine ? 'text-indigo-200 text-right' : 'text-slate-400'}`}>
          {timeAgo(msg.created_at || msg.timestamp)}
        </span>
      </div>
    </div>
  )
}

// ─── ChatWindow ─────────────────────────────────────────────────────────────

function ChatWindow({ convId, otherUser, onBack }) {
  const navigate   = useNavigate()
  const qc         = useQueryClient()
  const user       = useAuthStore((s) => s.user)
  const messages   = useChatStore((s) => s.messages[`direct_${convId}`] || [])
  const typing     = useChatStore((s) => s.typing[`direct_${convId}`] || {})
  const { setMessages, addMessage, replaceTempMessage, removeMessage } = useChatStore()
  const [text, setText]   = useState('')
  const messagesEndRef    = useRef(null)
  const typingTimerRef    = useRef(null)
  const inputRef          = useRef(null)

  // WebSocket for this conversation
  const { sendRead, sendTyping } = useChat('direct', convId)

  // Load history via REST (also kept fresh by 5s poll)
  useQuery({
    queryKey: ['chat-history', 'direct', convId],
    queryFn: async () => {
      const r = await chatService.conversationMessages(convId)
      const msgs = Array.isArray(r.data) ? r.data : (r.data?.results ?? [])
      setMessages(`direct_${convId}`, msgs)
      return msgs
    },
    enabled: !!convId,
    staleTime: 0,
    refetchInterval: 5000,
  })

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Mark unread as read when window opens
  useEffect(() => {
    const unread = messages.filter(
      (m) => m.sender_id !== user?.id && !m.read_by?.includes(user?.id)
    )
    if (unread.length > 0) {
      sendRead(unread.map((m) => m.id))
    }
  }, [messages, sendRead, user?.id])

  const sendMutation = useMutation({
    mutationFn: ({ content }) => chatService.sendDirectMessage(convId, { content }),
    onMutate: ({ content }) => {
      const tempId = `temp_${Date.now()}`
      addMessage(`direct_${convId}`, {
        id: tempId,
        content,
        sender_id: user?.id,
        created_at: new Date().toISOString(),
        read_by: [],
      })
      return { tempId }
    },
    onSuccess: (res, _vars, context) => {
      if (res?.data) replaceTempMessage(`direct_${convId}`, context.tempId, res.data)
      qc.invalidateQueries({ queryKey: ['chat-conversations'] })
    },
    onError: (_err, _vars, context) => {
      if (context?.tempId) removeMessage(`direct_${convId}`, context.tempId)
    },
  })

  const handleSend = () => {
    const content = text.trim()
    if (!content) return
    setText('')
    sendTyping(false)
    clearTimeout(typingTimerRef.current)
    sendMutation.mutate({ content })
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleTextChange = (e) => {
    setText(e.target.value)
    sendTyping(true)
    clearTimeout(typingTimerRef.current)
    typingTimerRef.current = setTimeout(() => sendTyping(false), 2000)
  }

  const typingUsers = Object.values(typing).filter(Boolean)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-700 flex-shrink-0">
        <button
          onClick={onBack}
          className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
          title="Back to conversations"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <Avatar name={otherUser?.full_name || otherUser?.name || 'User'} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">
            {otherUser?.full_name || otherUser?.name || 'User'}
          </p>
          <div className="flex items-center gap-1">
            <StatusDot userId={otherUser?.id} />
            <span className="text-xs text-slate-400 capitalize">
              {usePresenceStore.getState().employees.find(e => e.user_id === otherUser?.id)?.status || 'offline'}
            </span>
          </div>
        </div>
        <button
          onClick={() => navigate('/chat')}
          className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
          title="Open full chat"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5 min-h-0">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-slate-500 text-xs text-center">No messages yet.<br />Say hello! 👋</p>
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            msg={msg}
            isMine={msg.sender_id === user?.id}
            otherName={otherUser?.full_name || otherUser?.name || 'User'}
          />
        ))}
        {typingUsers.length > 0 && (
          <div className="flex items-center gap-1.5 text-slate-400 text-xs px-1 py-0.5">
            <span className="flex gap-0.5">
              <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </span>
            {typingUsers[0]} is typing…
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex items-end gap-2 px-3 py-2 border-t border-slate-700 flex-shrink-0">
        <textarea
          ref={inputRef}
          value={text}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          placeholder="Type a message…"
          rows={1}
          className="flex-1 bg-slate-700 text-white text-sm rounded-xl px-3 py-2 resize-none outline-none focus:ring-1 focus:ring-indigo-500 placeholder-slate-500 min-h-[36px] max-h-20 leading-snug"
          style={{ overflowY: 'auto' }}
        />
        <button
          onClick={handleSend}
          disabled={!text.trim()}
          className="w-9 h-9 flex-shrink-0 rounded-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
        >
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </div>
    </div>
  )
}

// ─── ConvItem ────────────────────────────────────────────────────────────────

function ConvItem({ conv, currentUserId, onClick }) {
  const other = conv.participants?.find((p) => p.id !== currentUserId) || conv.other_user || {}
  const lastMsg = conv.last_message
  const unread  = conv.unread_count || 0

  return (
    <button
      onClick={() => onClick(conv, other)}
      className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-slate-700/60 rounded-lg transition-colors text-left group"
    >
      <div className="relative flex-shrink-0">
        <Avatar name={other.full_name || other.name || 'User'} />
        <span className="absolute -bottom-0.5 -right-0.5">
          <StatusDot userId={other.id} />
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <p className="text-sm font-medium text-white truncate">
            {other.full_name || other.name || 'User'}
          </p>
          <span className="text-[10px] text-slate-500 flex-shrink-0">{timeAgo(lastMsg?.created_at)}</span>
        </div>
        <p className="text-xs text-slate-400 truncate">
          {lastMsg?.content ? (lastMsg.content.length > 35 ? lastMsg.content.slice(0, 35) + '…' : lastMsg.content) : 'No messages yet'}
        </p>
      </div>
      {unread > 0 && (
        <span className="w-5 h-5 flex-shrink-0 rounded-full bg-indigo-500 text-white text-[10px] font-bold flex items-center justify-center">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </button>
  )
}

// ─── ConversationList ────────────────────────────────────────────────────────

function ConversationList({ onSelectConv, currentUser }) {
  const qc = useQueryClient()
  const conversations   = useChatStore((s) => s.conversations)
  const { setConversations } = useChatStore()
  const [search, setSearch]         = useState('')
  const [showNewDM, setShowNewDM]   = useState(false)
  const [newDMSearch, setNewDMSearch] = useState('')
  const navigate = useNavigate()

  const canMessageEveryone = ['founder', 'admin', 'manager', 'hr'].includes(currentUser?.role)

  // Load conversations (shared query key with ChatPage — deduplicated)
  useQuery({
    queryKey: ['chat-conversations'],
    queryFn: async () => {
      const r = await chatService.conversations()
      const data = r.data?.results ?? r.data ?? []
      setConversations(Array.isArray(data) ? data : [])
      return data
    },
    refetchInterval: 30_000,
    enabled: !!currentUser,
  })

  // Load messageable users for new-DM search (role-filtered by backend, accessible to all roles)
  const { data: allUsers = [] } = useQuery({
    queryKey: ['chat-messageable-users'],
    queryFn: async () => {
      const r = await chatService.messageableUsers({ page_size: 200 })
      return r.data?.results ?? r.data ?? []
    },
    enabled: showNewDM,
    staleTime: 60_000,
  })

  const createConvMutation = useMutation({
    mutationFn: (userId) => chatService.createConversation(userId),
    onSuccess: (res) => {
      const conv = res.data
      qc.invalidateQueries({ queryKey: ['chat-conversations'] })
      if (conv?.id) {
        const other = conv.other_user || conv.participants?.find((p) => p.id !== currentUser?.id) || {}
        onSelectConv(conv, other)
      }
      setShowNewDM(false)
      setNewDMSearch('')
    },
  })

  const filtered = conversations.filter((c) => {
    const other = c.participants?.find((p) => p.id !== currentUser?.id) || c.other_user || {}
    const name = (other.full_name || other.name || '').toLowerCase()
    return name.includes(search.toLowerCase())
  })

  // Backend already filters by role; apply client-side name/email search only
  const dmUsers = allUsers.filter((u) => {
    if (!newDMSearch) return true
    const name  = (u.full_name || u.name || '').toLowerCase()
    const email = (u.email || '').toLowerCase()
    return name.includes(newDMSearch.toLowerCase()) || email.includes(newDMSearch.toLowerCase())
  })

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-700 flex-shrink-0">
        <h3 className="text-sm font-semibold text-white">Messages</h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowNewDM((v) => !v)}
            className={`p-1.5 rounded-lg transition-colors ${showNewDM ? 'bg-indigo-600 text-white' : 'hover:bg-slate-700 text-slate-400 hover:text-white'}`}
            title="New direct message"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-2 flex-shrink-0">
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search conversations…"
            className="w-full bg-slate-700 text-white text-xs rounded-lg pl-8 pr-3 py-1.5 outline-none focus:ring-1 focus:ring-indigo-500 placeholder-slate-500"
          />
        </div>
      </div>

      {/* New DM user picker */}
      {showNewDM && (
        <div className="border-b border-slate-700 flex-shrink-0">
          <div className="px-3 pb-2">
            <input
              type="text"
              value={newDMSearch}
              onChange={(e) => setNewDMSearch(e.target.value)}
              placeholder="Search people…"
              autoFocus
              className="w-full bg-slate-700 text-white text-xs rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-indigo-500 placeholder-slate-500"
            />
          </div>
          <div className="max-h-36 overflow-y-auto">
            {dmUsers.length === 0 && (
              <p className="text-slate-500 text-xs px-4 pb-2">No users found</p>
            )}
            {dmUsers.map((u) => {
              const userId = u.user?.id || u.id
              const name   = u.full_name || u.user?.full_name || u.name || 'User'
              const role   = u.role || u.user?.role || ''
              return (
                <button
                  key={userId}
                  onClick={() => createConvMutation.mutate(userId)}
                  disabled={createConvMutation.isPending}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-slate-700/60 transition-colors text-left"
                >
                  <Avatar name={name} size="sm" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-white truncate">{name}</p>
                    <p className="text-[10px] text-slate-400 capitalize">{role}</p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-2 py-1 min-h-0">
        {filtered.length === 0 && !showNewDM && (
          <div className="flex flex-col items-center justify-center h-full gap-2 py-8">
            <svg className="w-8 h-8 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <p className="text-slate-500 text-xs text-center">
              {search ? 'No conversations match' : 'No conversations yet'}
            </p>
          </div>
        )}
        {filtered.map((conv) => (
          <ConvItem
            key={conv.id}
            conv={conv}
            currentUserId={currentUser?.id}
            onClick={onSelectConv}
          />
        ))}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-slate-700 flex-shrink-0">
        <button
          onClick={() => navigate('/chat')}
          className="w-full flex items-center justify-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors py-1"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          Open full chat
        </button>
      </div>
    </div>
  )
}

// ─── ChatPopup (root) ────────────────────────────────────────────────────────

export default function ChatPopup() {
  const user         = useAuthStore((s) => s.user)
  const conversations = useChatStore((s) => s.conversations)
  const totalUnread  = useChatStore((s) =>
    s.conversations.reduce((a, c) => a + (c.unread_count || 0), 0)
  )

  const [isOpen, setIsOpen]           = useState(false)
  const [activeConv, setActiveConv]   = useState(null)  // { conv, other }
  const panelRef = useRef(null)

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return
    const handler = (e) => {
      if (!panelRef.current?.contains(e.target)) setIsOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [isOpen])

  if (!user) return null

  return (
    <div ref={panelRef} className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2">
      {/* Panel */}
      {isOpen && (
        <div
          className="w-80 bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col fade-in"
          style={{ height: '480px' }}
        >
          {activeConv ? (
            <ChatWindow
              convId={activeConv.conv.id}
              otherUser={activeConv.other}
              onBack={() => setActiveConv(null)}
            />
          ) : (
            <ConversationList
              onSelectConv={(conv, other) => setActiveConv({ conv, other })}
              currentUser={user}
            />
          )}
        </div>
      )}

      {/* Floating button */}
      <button
        onClick={() => {
          setIsOpen((v) => !v)
          if (isOpen) setActiveConv(null)
        }}
        className="relative w-14 h-14 rounded-full bg-indigo-600 hover:bg-indigo-500 shadow-lg hover:shadow-indigo-500/30 flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95"
        aria-label="Toggle chat"
      >
        {isOpen ? (
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        )}
        {/* Unread badge */}
        {!isOpen && totalUnread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-slate-900">
            {totalUnread > 99 ? '99+' : totalUnread}
          </span>
        )}
      </button>
    </div>
  )
}
