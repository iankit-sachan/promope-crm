/**
 * ChatPage — Unified internal communication hub.
 *
 * Layout:
 *   Left panel  (320 px): tab bar (DMs | Groups | Reports) + search + list
 *   Right panel (flex-1): active conversation / group / report viewer
 *
 * Features:
 *   • Direct messages — real-time WS, read receipts, typing indicators
 *   • Online / Away / Offline status badges via the presence store
 *   • Group chat with member management
 *   • File / image / PDF sharing (multipart REST upload)
 *   • PDF report submission & admin approve/reject workflow
 *   • Full empty-state handling for every zero-data scenario
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  MessageSquare, Users, FileText, Plus, Search, Send,
  Paperclip, X, Check, CheckCheck, Download,
  UserPlus, FileCheck,
  Clock, ThumbsUp, ThumbsDown, Eye,
  Wifi, WifiOff,
} from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import { chatService }      from '../services/api'
import { useAuthStore }     from '../store/authStore'
import { useChatStore }     from '../store/chatStore'
import { usePresenceStore } from '../store/presenceStore'
import { useChat }          from '../hooks/useChat'
import { formatDate }       from '../utils/helpers'
import LoadingSpinner       from '../components/common/LoadingSpinner'

// ── Presence helper ─────────────────────────────────────────────────────────────

const STATUS_DOT = {
  online:  'bg-green-400',
  away:    'bg-yellow-400',
  offline: 'bg-slate-500',
}

const STATUS_TEXT = {
  online:  'text-green-400',
  away:    'text-yellow-400',
  offline: 'text-slate-500',
}

function useOnlineStatus(userId) {
  return usePresenceStore(
    useCallback(
      (s) => (userId ? (s.employees.find((e) => e.user_id === userId)?.status ?? 'offline') : null),
      [userId],
    ),
  )
}

/** Format a last_seen ISO string the WhatsApp way. */
function formatLastSeen(lastSeenIso) {
  if (!lastSeenIso) return 'Offline'
  const d       = new Date(lastSeenIso)
  const now     = new Date()
  const diffMs  = now - d
  const diffMin = Math.floor(diffMs / 60_000)
  const diffHr  = Math.floor(diffMs / 3_600_000)
  const diffDay = Math.floor(diffMs / 86_400_000)
  const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  if (diffMin < 1)   return 'last seen just now'
  if (diffMin < 60)  return `last seen ${diffMin} min ago`
  if (diffHr  < 24)  return `last seen today at ${timeStr}`
  if (diffDay === 1) return `last seen yesterday at ${timeStr}`
  const dateStr = d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  return `last seen ${dateStr} at ${timeStr}`
}

// ── Avatar ──────────────────────────────────────────────────────────────────────

function Avatar({ name, photo, size = 'sm', userId }) {
  const status = useOnlineStatus(userId)
  const dim    = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm'

  return (
    <div className={`relative shrink-0 ${dim}`}>
      <div className={`${dim} rounded-full overflow-hidden`}>
        {photo
          ? <img src={photo} alt="" className="w-full h-full object-cover" />
          : <div className="w-full h-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold rounded-full">
              {(name || '?')[0].toUpperCase()}
            </div>
        }
      </div>
      {status && (
        <span className={clsx(
          'absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-slate-900',
          STATUS_DOT[status] ?? STATUS_DOT.offline,
        )} />
      )}
    </div>
  )
}

// ── Timestamp ───────────────────────────────────────────────────────────────────

function TimeStamp({ iso }) {
  if (!iso) return null
  const d    = new Date(iso)
  const now  = new Date()
  const diff = now - d
  if (diff < 86_400_000)  return <span>{d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
  if (diff < 604_800_000) return <span>{d.toLocaleDateString([], { weekday: 'short' })}</span>
  return <span>{formatDate(iso.slice(0, 10))}</span>
}

// ── Report status config ────────────────────────────────────────────────────────

const REPORT_STATUS = {
  pending:  { label: 'Pending',  cls: 'bg-yellow-500/10 text-yellow-400', Icon: Clock },
  approved: { label: 'Approved', cls: 'bg-green-500/10 text-green-400',   Icon: ThumbsUp },
  rejected: { label: 'Rejected', cls: 'bg-red-500/10 text-red-400',       Icon: ThumbsDown },
}

// ── Conversation list item ───────────────────────────────────────────────────────

function ConversationItem({ conv, isActive, onSelect }) {
  const other   = conv.other_user
  const unread  = conv.unread_count || 0
  const lastMsg = conv.last_message

  return (
    <button
      onClick={() => onSelect(conv)}
      className={clsx(
        'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all',
        isActive ? 'bg-indigo-600' : 'hover:bg-slate-700/50',
      )}
    >
      <Avatar name={other?.full_name} photo={other?.profile_photo} userId={other?.id} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-1">
          <p className={clsx('text-sm font-medium truncate', isActive ? 'text-white' : 'text-slate-200')}>
            {other?.full_name || 'Unknown'}
          </p>
          {lastMsg && (
            <span className={clsx('text-[10px] shrink-0', isActive ? 'text-indigo-200' : 'text-slate-500')}>
              <TimeStamp iso={lastMsg.created_at} />
            </span>
          )}
        </div>
        <div className="flex items-center justify-between gap-1">
          <p className={clsx('text-xs truncate', isActive ? 'text-indigo-200' : 'text-slate-500')}>
            {lastMsg?.content || 'No messages yet'}
          </p>
          {unread > 0 && !isActive && (
            <span className="min-w-[1rem] h-4 rounded-full bg-indigo-500 text-white text-[10px] flex items-center justify-center shrink-0 px-1">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}

// ── Group list item ─────────────────────────────────────────────────────────────

function GroupItem({ group, isActive, onSelect }) {
  const unread  = group.unread_count || 0
  const lastMsg = group.last_message

  return (
    <button
      onClick={() => onSelect(group)}
      className={clsx(
        'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all',
        isActive ? 'bg-indigo-600' : 'hover:bg-slate-700/50',
      )}
    >
      <div className="w-8 h-8 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-xs font-bold shrink-0">
        {(group.name || '?')[0].toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-1">
          <p className={clsx('text-sm font-medium truncate', isActive ? 'text-white' : 'text-slate-200')}>
            {group.name}
          </p>
          {lastMsg && (
            <span className={clsx('text-[10px] shrink-0', isActive ? 'text-indigo-200' : 'text-slate-500')}>
              <TimeStamp iso={lastMsg.created_at} />
            </span>
          )}
        </div>
        <div className="flex items-center justify-between gap-1">
          <p className={clsx('text-xs truncate', isActive ? 'text-indigo-200' : 'text-slate-500')}>
            {lastMsg
              ? (lastMsg.sender_name ? `${lastMsg.sender_name.split(' ')[0]}: ` : '') + lastMsg.content
              : `${group.member_count} member${group.member_count !== 1 ? 's' : ''}`}
          </p>
          {unread > 0 && !isActive && (
            <span className="min-w-[1rem] h-4 rounded-full bg-indigo-500 text-white text-[10px] flex items-center justify-center shrink-0 px-1">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}

// ── New Direct Message modal ─────────────────────────────────────────────────────

function NewDMModal({ onClose, onCreated }) {
  const [search, setSearch] = useState('')
  const me = useAuthStore((s) => s.user)

  const { data: employees, isLoading } = useQuery({
    queryKey: ['employees-for-chat'],
    queryFn: () =>
      fetch('/api/employees/', {
        headers: { Authorization: `Bearer ${useAuthStore.getState().getAccessToken()}` },
      })
        .then((r) => r.json())
        .then((d) => d.results || d),
  })

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return (employees || []).filter(
      (e) =>
        e.user_id !== me?.id &&
        (!q || e.full_name?.toLowerCase().includes(q) || e.department_name?.toLowerCase().includes(q)),
    )
  }, [employees, search, me])

  const mutation = useMutation({
    mutationFn: (userId) => chatService.createConversation(userId),
    onSuccess: (res) => { onCreated(res.data); onClose() },
    onError: () => toast.error('Failed to start conversation'),
  })

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-slate-800 rounded-2xl w-full max-w-sm border border-slate-700 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h3 className="font-semibold text-white">New Direct Message</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3 border-b border-slate-700">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or department…"
              className="input pl-9 py-1.5 text-sm w-full"
            />
          </div>
        </div>

        <div className="max-h-72 overflow-y-auto p-2">
          {isLoading ? (
            <LoadingSpinner text="Loading…" />
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-center">
              <Users className="w-8 h-8 text-slate-600 mb-2" />
              <p className="text-slate-500 text-sm">{search ? 'No results' : 'No employees found'}</p>
            </div>
          ) : (
            filtered.map((emp) => (
              <button
                key={emp.id}
                onClick={() => mutation.mutate(emp.user_id)}
                disabled={mutation.isPending}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-slate-700/50 transition-colors text-left"
              >
                <Avatar name={emp.full_name} photo={emp.profile_photo} userId={emp.user_id} />
                <div>
                  <p className="text-sm font-medium text-slate-200">{emp.full_name}</p>
                  <p className="text-xs text-slate-500">{emp.department_name || emp.employee_id}</p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

// ── New Group modal ─────────────────────────────────────────────────────────────

function NewGroupModal({ onClose, onCreated }) {
  const [name, setName]         = useState('')
  const [desc, setDesc]         = useState('')
  const [search, setSearch]     = useState('')
  const [selected, setSelected] = useState([])
  const me = useAuthStore((s) => s.user)
  const qc = useQueryClient()

  const { data: employees } = useQuery({
    queryKey: ['employees-for-chat'],
    queryFn: () =>
      fetch('/api/employees/', {
        headers: { Authorization: `Bearer ${useAuthStore.getState().getAccessToken()}` },
      })
        .then((r) => r.json())
        .then((d) => d.results || d),
  })

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return (employees || []).filter(
      (e) =>
        e.user_id !== me?.id &&
        (!q || e.full_name?.toLowerCase().includes(q) || e.department_name?.toLowerCase().includes(q)),
    )
  }, [employees, search, me])

  const mutation = useMutation({
    mutationFn: () => chatService.createGroup({ name, description: desc, member_ids: selected }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['chat-groups'] })
      onCreated(res.data)
      onClose()
    },
    onError: () => toast.error('Failed to create group'),
  })

  const toggle = (userId) =>
    setSelected((s) => (s.includes(userId) ? s.filter((x) => x !== userId) : [...s, userId]))

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-slate-800 rounded-2xl w-full max-w-sm border border-slate-700 shadow-2xl flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h3 className="font-semibold text-white">Create Group</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3 border-b border-slate-700">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Group name *"
            className="input w-full"
          />
          <input
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Description (optional)"
            className="input w-full"
          />
        </div>

        <div className="p-3 border-b border-slate-700">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Add members…"
              className="input pl-9 py-1.5 text-sm w-full"
            />
          </div>
          {selected.length > 0 && (
            <p className="text-xs text-indigo-400 mt-1.5">
              {selected.length} member{selected.length !== 1 ? 's' : ''} selected
            </p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <p className="text-center text-slate-500 text-sm py-4">No employees found</p>
          ) : (
            filtered.map((emp) => (
              <button
                key={emp.id}
                onClick={() => toggle(emp.user_id)}
                className={clsx(
                  'w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-colors text-left',
                  selected.includes(emp.user_id) ? 'bg-indigo-600/20' : 'hover:bg-slate-700/50',
                )}
              >
                <Avatar name={emp.full_name} photo={emp.profile_photo} userId={emp.user_id} />
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-200">{emp.full_name}</p>
                  <p className="text-xs text-slate-500">{emp.department_name || emp.employee_id}</p>
                </div>
                {selected.includes(emp.user_id) && <Check className="w-4 h-4 text-indigo-400 shrink-0" />}
              </button>
            ))
          )}
        </div>

        <div className="p-4 border-t border-slate-700">
          <button
            onClick={() => mutation.mutate()}
            disabled={!name.trim() || mutation.isPending}
            className="btn-primary w-full"
          >
            {mutation.isPending ? 'Creating…' : 'Create Group'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Message bubble ───────────────────────────────────────────────────────────────

function MessageBubble({ msg, isMine, showAvatar }) {
  const isImage = msg.message_type === 'image'
  const isFile  = msg.message_type !== 'text' && !isImage
  const readBy  = msg.read_by || []

  return (
    <div className={clsx('flex gap-2 items-end group', isMine ? 'flex-row-reverse' : 'flex-row')}>
      {showAvatar
        ? <Avatar
            name={msg.sender_name}
            photo={msg.sender_photo}
            userId={isMine ? undefined : msg.sender_id}
            size="sm"
          />
        : <div className="w-8 shrink-0" />
      }

      <div className={clsx(
        'max-w-xs lg:max-w-md flex flex-col gap-0.5',
        isMine ? 'items-end' : 'items-start',
      )}>
        {showAvatar && !isMine && (
          <span className="text-[11px] text-slate-500 px-1">{msg.sender_name}</span>
        )}

        <div className={clsx(
          'rounded-2xl px-3 py-2 text-sm',
          isMine
            ? 'bg-indigo-600 text-white rounded-br-sm'
            : 'bg-slate-700 text-slate-100 rounded-bl-sm',
        )}>
          {msg.is_deleted ? (
            <span className="italic opacity-50 text-xs">This message was deleted</span>
          ) : isImage && msg.file_url ? (
            <img
              src={msg.file_url}
              alt={msg.file_name || 'image'}
              className="max-w-[200px] rounded-lg cursor-pointer"
              onClick={() => window.open(msg.file_url, '_blank')}
            />
          ) : (isFile || msg.message_type === 'pdf') && msg.file_url ? (
            <a
              href={msg.file_url}
              target="_blank"
              rel="noreferrer"
              download={msg.file_name}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                {msg.message_type === 'pdf'
                  ? <FileText className="w-4 h-4" />
                  : <Paperclip className="w-4 h-4" />
                }
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium truncate max-w-[150px]">{msg.file_name}</p>
                {msg.file_size && (
                  <p className="text-[10px] opacity-60">{(msg.file_size / 1024).toFixed(1)} KB</p>
                )}
              </div>
              <Download className="w-3.5 h-3.5 shrink-0 opacity-70 ml-1" />
            </a>
          ) : (
            <p className="whitespace-pre-wrap break-words">{msg.content}</p>
          )}
        </div>

        <div className={clsx('flex items-center gap-1 px-1', isMine ? 'flex-row-reverse' : 'flex-row')}>
          <span className="text-[10px] text-slate-500"><TimeStamp iso={msg.created_at} /></span>
          {isMine && (
            readBy.length > 1
              ? <CheckCheck className="w-3 h-3 text-indigo-400" />
              : <Check className="w-3 h-3 text-slate-500" />
          )}
        </div>
      </div>
    </div>
  )
}

// ── Message thread (right panel for DMs + groups) ───────────────────────────────

function MessageThread({ roomType, roomId, headerData, myUserId }) {
  const [text, setText]               = useState('')
  const [uploading, setUploading]     = useState(false)
  const [showMembers, setShowMembers] = useState(false)
  const messagesEndRef = useRef(null)
  const fileInputRef   = useRef(null)
  const typingTimerRef = useRef(null)
  const qc             = useQueryClient()

  const roomKey     = `${roomType}_${roomId}`
  const messages    = useChatStore((s) => s.messages[roomKey] || [])
  const wsConnected = useChatStore((s) => s.wsConnected)
  const typing      = useChatStore((s) => s.typing[roomKey] || {})
  const typingNames = Object.values(typing)

  // Online status for DM partner
  // Primary: real-time presence store (WS). Fallback: is_online flag from REST API.
  const otherUserId    = roomType === 'direct' ? headerData?.other_user?.id : undefined
  const wsStatus       = useOnlineStatus(otherUserId)
  const inPresence     = usePresenceStore(
    useCallback((s) => otherUserId ? s.employees.some((e) => e.user_id === otherUserId) : false, [otherUserId])
  )
  const restIsOnline   = headerData?.other_user?.is_online
  // Use WS status only when the user actually appears in the presence store;
  // otherwise fall back to the is_online flag returned by the REST API.
  const otherStatus    = inPresence ? wsStatus : (restIsOnline ? 'online' : 'offline')

  const { sendRead, sendTyping } = useChat(roomType, roomId)

  // HTTP fallback — fetch history on mount and whenever room changes.
  // The WS 'history' event will override this once connected (Redis up),
  // but this ensures messages load even when WS/Redis is unavailable.
  const setMessages = useChatStore((s) => s.setMessages)
  useQuery({
    queryKey: ['chat-history', roomType, roomId],
    queryFn: () => (roomType === 'direct'
      ? chatService.conversationMessages(roomId)
      : chatService.groupMessages(roomId)
    ).then((r) => {
      const msgs = Array.isArray(r.data) ? r.data : (r.data?.results ?? [])
      setMessages(roomKey, msgs)
      return msgs
    }),
    enabled: !!roomId,
    staleTime: 0,
    refetchInterval: 5000,   // poll every 5 s when WS is down
  })

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  // Send read receipts for unread messages in view
  useEffect(() => {
    const unreadIds = messages
      .filter((m) => m.sender_id !== myUserId && !(m.read_by || []).includes(myUserId))
      .map((m) => m.id)
    if (unreadIds.length) sendRead(unreadIds)
  }, [messages, myUserId, sendRead])

  const sendMutation = useMutation({
    mutationFn: async ({ content, file }) => {
      const isGroup = roomType === 'group'
      if (file) {
        const fd = new FormData()
        if (content) fd.append('content', content)
        fd.append('file', file)
        return isGroup
          ? chatService.sendGroupMessage(roomId, fd)
          : chatService.sendDirectMessage(roomId, fd)
      }
      return isGroup
        ? chatService.sendGroupMessage(roomId, { content })
        : chatService.sendDirectMessage(roomId, { content })
    },
    onSuccess: (res) => {
      // Optimistically add if WS hasn't delivered it yet
      if (res?.data) useChatStore.getState().addMessage(roomKey, res.data)
      // Refetch history so the other user's next poll sees the new message
      qc.invalidateQueries({ queryKey: ['chat-history', roomType, roomId] })
      qc.invalidateQueries({ queryKey: ['chat-conversations'] })
      qc.invalidateQueries({ queryKey: ['chat-groups'] })
    },
    onError: () => toast.error('Failed to send message'),
  })

  const handleSend = useCallback(() => {
    const t = text.trim()
    if (!t) return
    setText('')
    sendMutation.mutate({ content: t, file: null })
  }, [text, sendMutation])

  const handleFile = useCallback(
    (e) => {
      const file = e.target.files?.[0]
      if (!file) return
      setUploading(true)
      sendMutation.mutate(
        { content: '', file },
        { onSettled: () => { setUploading(false); e.target.value = '' } },
      )
    },
    [sendMutation],
  )

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
    sendTyping(true)
    clearTimeout(typingTimerRef.current)
    typingTimerRef.current = setTimeout(() => sendTyping(false), 2000)
  }

  const isGroupAdmin = roomType === 'group' && headerData?.my_role === 'admin'

  const removeMember = useMutation({
    mutationFn: (userId) => chatService.removeGroupMember(roomId, userId),
    onSuccess: () => {
      toast.success('Member removed')
      qc.invalidateQueries({ queryKey: ['chat-groups'] })
    },
    onError: () => toast.error('Failed to remove member'),
  })

  return (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="h-14 flex items-center justify-between px-4 border-b border-slate-700 shrink-0 bg-slate-800/30">
        <div className="flex items-center gap-3">
          {roomType === 'direct' ? (
            <Avatar
              name={headerData?.other_user?.full_name}
              photo={headerData?.other_user?.profile_photo}
              userId={headerData?.other_user?.id}
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-xs font-bold shrink-0">
              {(headerData?.name || '?')[0].toUpperCase()}
            </div>
          )}
          <div>
            <p className="text-sm font-semibold text-white">
              {roomType === 'direct'
                ? headerData?.other_user?.full_name
                : headerData?.name}
            </p>
            {roomType === 'direct' && otherStatus ? (
              <p className={clsx('text-xs', STATUS_TEXT[otherStatus] ?? STATUS_TEXT.offline)}>
                {otherStatus === 'online'
                  ? 'Online'
                  : otherStatus === 'away'
                  ? 'Away'
                  : formatLastSeen(headerData?.other_user?.last_seen)}
              </p>
            ) : roomType === 'group' ? (
              <p className="text-xs text-slate-500">
                {headerData?.member_count} member{headerData?.member_count !== 1 ? 's' : ''}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Live / offline badge */}
          <span
            title={wsConnected ? 'Real-time connected' : 'Reconnecting to real-time…'}
            className={clsx(
              'hidden sm:flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full',
              wsConnected
                ? 'bg-green-500/10 text-green-400'
                : 'bg-slate-700/60 text-slate-500',
            )}
          >
            {wsConnected
              ? <Wifi className="w-3 h-3" />
              : <WifiOff className="w-3 h-3" />
            }
            {wsConnected ? 'Live' : 'Offline'}
          </span>

          {/* Members toggle (groups only) */}
          {roomType === 'group' && (
            <button
              onClick={() => setShowMembers((v) => !v)}
              title="Members"
              className={clsx(
                'p-1.5 rounded-lg transition-colors',
                showMembers
                  ? 'bg-slate-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700',
              )}
            >
              <Users className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 min-h-0">

        {/* Messages */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto p-4 space-y-1">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-16 text-center">
                <div className="w-14 h-14 rounded-full bg-indigo-500/10 flex items-center justify-center mb-3">
                  <MessageSquare className="w-6 h-6 text-indigo-400" />
                </div>
                <p className="text-slate-300 font-medium">No messages yet</p>
                <p className="text-slate-600 text-sm mt-1">
                  {roomType === 'direct'
                    ? `Say hi to ${headerData?.other_user?.full_name?.split(' ')[0] ?? 'them'} 👋`
                    : 'Start the conversation 🚀'}
                </p>
              </div>
            ) : (
              messages.map((msg, i) => {
                const prev   = messages[i - 1]
                const isMine = msg.sender_id === myUserId
                const showAv = !prev || prev.sender_id !== msg.sender_id
                return <MessageBubble key={msg.id} msg={msg} isMine={isMine} showAvatar={showAv} />
              })
            )}

            {/* Typing indicator */}
            {typingNames.length > 0 && (
              <div className="flex items-center gap-2 text-xs text-slate-500 pl-10">
                <span className="flex gap-0.5">
                  {[0, 150, 300].map((d) => (
                    <span key={d} className="animate-bounce" style={{ animationDelay: `${d}ms` }}>•</span>
                  ))}
                </span>
                {typingNames.join(', ')} {typingNames.length === 1 ? 'is' : 'are'} typing…
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="px-4 pb-4 shrink-0">
            <div className="flex items-end gap-2 bg-slate-700/50 rounded-2xl px-3 py-2 border border-slate-600 focus-within:border-indigo-500/50 transition-colors">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                title="Attach file or image"
                className="p-1 text-slate-400 hover:text-indigo-400 transition-colors shrink-0"
              >
                {uploading
                  ? <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                  : <Paperclip className="w-4 h-4" />
                }
              </button>
              <input ref={fileInputRef} type="file" className="hidden" onChange={handleFile} />

              <textarea
                rows={1}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message…"
                className="flex-1 bg-transparent text-slate-200 text-sm resize-none outline-none placeholder-slate-500 max-h-24"
                onInput={(e) => {
                  e.target.style.height = 'auto'
                  e.target.style.height = `${e.target.scrollHeight}px`
                }}
              />

              <button
                onClick={handleSend}
                disabled={!text.trim() || sendMutation.isPending}
                className={clsx(
                  'p-1.5 rounded-xl transition-colors shrink-0',
                  text.trim()
                    ? 'text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10'
                    : 'text-slate-600 cursor-not-allowed',
                )}
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Group member sidebar */}
        {showMembers && roomType === 'group' && (
          <div className="w-52 border-l border-slate-700 flex flex-col bg-slate-800/20 shrink-0">
            <div className="px-3 py-2.5 border-b border-slate-700 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Members</span>
              <button
                onClick={() => setShowMembers(false)}
                className="text-slate-500 hover:text-white transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
              {(headerData?.members || []).map((m) => (
                <div
                  key={m.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg group/m hover:bg-slate-700/50 transition-colors"
                >
                  <Avatar name={m.user?.full_name} photo={m.user?.profile_photo} userId={m.user?.id} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-200 truncate">{m.user?.full_name}</p>
                    <p className="text-[10px] text-slate-500 capitalize">{m.role}</p>
                  </div>
                  {isGroupAdmin && m.user?.id !== myUserId && (
                    <button
                      onClick={() => removeMember.mutate(m.user.id)}
                      title="Remove"
                      className="opacity-0 group-hover/m:opacity-100 p-1 text-red-400 hover:text-red-300 transition-all"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}

              {isGroupAdmin && (
                <button
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-indigo-400 hover:bg-indigo-500/10 transition-colors text-xs mt-1"
                  onClick={() => toast('Open group settings to add members', { icon: 'ℹ️' })}
                >
                  <UserPlus className="w-3.5 h-3.5" /> Add member
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── PDF Reports panel ────────────────────────────────────────────────────────────

function ReportsPanel({ isManager }) {
  const [file, setFile]       = useState(null)
  const [title, setTitle]     = useState('')
  const [type, setType]       = useState('daily')
  const [desc, setDesc]       = useState('')
  const [viewing, setViewing] = useState(null)
  const [note, setNote]       = useState('')
  const fileRef = useRef(null)
  const qc      = useQueryClient()

  const { data: myReports,  isLoading: loadingMy }  = useQuery({
    queryKey: ['my-pdf-reports'],
    queryFn:  () => chatService.myReports().then((r) => r.data.results ?? r.data),
  })
  const { data: allReports, isLoading: loadingAll } = useQuery({
    queryKey: ['admin-pdf-reports'],
    queryFn:  () => chatService.adminReports().then((r) => r.data.results ?? r.data),
    enabled:  !!isManager,
  })

  const submitMutation = useMutation({
    mutationFn: () => {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('title', title || file.name)
      fd.append('report_type', type)
      fd.append('description', desc)
      return chatService.submitReport(fd)
    },
    onSuccess: () => {
      toast.success('Report submitted!')
      setFile(null); setTitle(''); setDesc('')
      qc.invalidateQueries({ queryKey: ['my-pdf-reports'] })
    },
    onError: () => toast.error('Failed to submit report'),
  })

  const reviewMutation = useMutation({
    mutationFn: ({ id, status }) => chatService.reviewReport(id, { status, admin_note: note }),
    onSuccess: () => {
      toast.success('Report reviewed')
      setViewing(null); setNote('')
      qc.invalidateQueries({ queryKey: ['admin-pdf-reports'] })
    },
    onError: () => toast.error('Failed to review report'),
  })

  const reports = isManager ? (allReports || []) : (myReports || [])
  const loading = isManager ? loadingAll : loadingMy

  return (
    <div className="flex h-full">

      {/* Left: list */}
      <div className="w-72 border-r border-slate-700 flex flex-col shrink-0">
        <div className="px-4 py-3 border-b border-slate-700">
          <p className="text-sm font-semibold text-white">
            {isManager ? 'All Submitted Reports' : 'My Reports'}
          </p>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {loading ? (
            <LoadingSpinner text="Loading…" />
          ) : reports.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-center px-4">
              <FileText className="w-10 h-10 text-slate-700 mb-2" />
              <p className="text-slate-500 text-sm font-medium">No reports yet</p>
              {!isManager && (
                <p className="text-slate-600 text-xs mt-1">Use the form → to submit your first report</p>
              )}
            </div>
          ) : (
            reports.map((r) => {
              const cfg  = REPORT_STATUS[r.status] ?? REPORT_STATUS.pending
              const Icon = cfg.Icon
              return (
                <button
                  key={r.id}
                  onClick={() => { setViewing(r); setNote(r.admin_note || '') }}
                  className={clsx(
                    'w-full flex items-start gap-3 px-3 py-2.5 rounded-xl text-left transition-colors',
                    viewing?.id === r.id
                      ? 'bg-indigo-600/20 border border-indigo-500/30'
                      : 'hover:bg-slate-700/50',
                  )}
                >
                  <div className="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center shrink-0 mt-0.5">
                    <FileText className="w-4 h-4 text-red-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-200 truncate">{r.title}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${cfg.cls}`}>
                        <Icon className="w-2.5 h-2.5" />{cfg.label}
                      </span>
                      <span className="text-[10px] text-slate-500">{r.report_type_label}</span>
                    </div>
                    {isManager && <p className="text-[10px] text-slate-500 mt-0.5">{r.submitter_name}</p>}
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* Right: detail or submit form */}
      <div className="flex-1 overflow-y-auto">
        {viewing ? (
          <div className="p-6 max-w-lg">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-white">{viewing.title}</h2>
                <p className="text-sm text-slate-400">
                  {viewing.report_type_label}{isManager && ` · ${viewing.submitter_name}`}
                </p>
              </div>
              <button
                onClick={() => setViewing(null)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Status badge */}
            {(() => {
              const cfg  = REPORT_STATUS[viewing.status] ?? REPORT_STATUS.pending
              const Icon = cfg.Icon
              return (
                <div className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full mb-4 ${cfg.cls}`}>
                  <Icon className="w-3.5 h-3.5" />{cfg.label}
                </div>
              )
            })()}

            {viewing.description && (
              <p className="text-sm text-slate-400 mb-4 bg-slate-700/30 rounded-xl p-3">
                {viewing.description}
              </p>
            )}

            {/* File link */}
            <a
              href={viewing.file_url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 p-3 bg-slate-700/50 rounded-xl hover:bg-slate-700 transition-colors mb-4"
            >
              <div className="w-10 h-10 bg-red-500/10 rounded-xl flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5 text-red-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-200 truncate">{viewing.file_name}</p>
                {viewing.file_size && (
                  <p className="text-xs text-slate-500">{(viewing.file_size / 1024).toFixed(1)} KB</p>
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                <Eye className="w-4 h-4 text-slate-400" />
                <Download className="w-4 h-4 text-slate-400" />
              </div>
            </a>

            {/* Approve / Reject (manager + pending) */}
            {isManager && viewing.status === 'pending' && (
              <div className="space-y-3">
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Add an admin note (optional)…"
                  rows={2}
                  className="input w-full text-sm"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => reviewMutation.mutate({ id: viewing.id, status: 'approved' })}
                    disabled={reviewMutation.isPending}
                    className="flex-1 flex items-center justify-center gap-2 py-2 bg-green-600 hover:bg-green-500 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-60"
                  >
                    <ThumbsUp className="w-4 h-4" /> Approve
                  </button>
                  <button
                    onClick={() => reviewMutation.mutate({ id: viewing.id, status: 'rejected' })}
                    disabled={reviewMutation.isPending}
                    className="flex-1 flex items-center justify-center gap-2 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-60"
                  >
                    <ThumbsDown className="w-4 h-4" /> Reject
                  </button>
                </div>
              </div>
            )}

            {/* Admin note (already reviewed) */}
            {viewing.admin_note && viewing.status !== 'pending' && (
              <div className="bg-slate-700/30 rounded-xl p-3 text-sm text-slate-300 mt-2">
                <p className="text-xs text-slate-500 mb-1 font-medium uppercase tracking-wide">Admin note</p>
                {viewing.admin_note}
              </div>
            )}
          </div>
        ) : !isManager ? (
          /* Employee submit form */
          <div className="p-6 max-w-md">
            <div className="flex items-center gap-2 mb-5">
              <FileCheck className="w-5 h-5 text-indigo-400" />
              <h2 className="text-base font-semibold text-white">Submit PDF Report</h2>
            </div>
            <div className="space-y-3">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Report title"
                className="input w-full"
              />
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="input w-full"
              >
                <option value="daily">Daily Report</option>
                <option value="weekly">Weekly Report</option>
                <option value="project">Project Report</option>
                <option value="other">Other</option>
              </select>
              <textarea
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="Description (optional)"
                rows={2}
                className="input w-full text-sm"
              />
              <div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
                {file ? (
                  <div className="flex items-center gap-3 p-3 bg-slate-700/50 rounded-xl border border-slate-600">
                    <FileText className="w-5 h-5 text-red-400 shrink-0" />
                    <span className="text-sm text-slate-200 flex-1 truncate">{file.name}</span>
                    <button
                      onClick={() => setFile(null)}
                      className="text-slate-400 hover:text-red-400 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="w-full p-5 border-2 border-dashed border-slate-600 rounded-xl text-slate-400 hover:border-indigo-500 hover:text-indigo-400 transition-colors text-sm flex flex-col items-center gap-1.5"
                  >
                    <Paperclip className="w-6 h-6" />
                    <span>Click to attach PDF</span>
                    <span className="text-xs text-slate-600">PDF files only</span>
                  </button>
                )}
              </div>
              <button
                onClick={() => submitMutation.mutate()}
                disabled={!file || submitMutation.isPending}
                className="btn-primary w-full disabled:opacity-60"
              >
                {submitMutation.isPending ? 'Submitting…' : 'Submit Report'}
              </button>
            </div>
          </div>
        ) : (
          /* Manager: nothing selected */
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <FileText className="w-12 h-12 text-slate-700 mb-3" />
            <p className="text-slate-500 font-medium">Select a report to review</p>
            <p className="text-slate-600 text-sm mt-1">
              {reports.length === 0
                ? 'No reports have been submitted yet.'
                : 'Click a report from the list on the left.'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────────

const TABS = ['dms', 'groups', 'reports']
const TAB_LABELS = { dms: 'Direct', groups: 'Groups', reports: 'Reports' }

export default function ChatPage() {
  const [tab, setTab]                   = useState('dms')
  const [search, setSearch]             = useState('')
  const [showDMModal, setDMModal]       = useState(false)
  const [showGroupModal, setGroupModal] = useState(false)
  const qc = useQueryClient()

  const user      = useAuthStore((s) => s.user)
  const isManager = ['founder', 'admin', 'manager'].includes(user?.role)

  const { activeRoom, setActiveRoom, conversations, groups, setConversations, setGroups } = useChatStore()

  useQuery({
    queryKey: ['chat-conversations'],
    queryFn: () => chatService.conversations().then((r) => {
      const data = r.data?.results ?? r.data ?? []
      setConversations(Array.isArray(data) ? data : [])
      return data
    }),
    refetchInterval: 30_000,
  })

  useQuery({
    queryKey: ['chat-groups'],
    queryFn: () => chatService.groups().then((r) => {
      const data = r.data?.results ?? r.data ?? []
      setGroups(Array.isArray(data) ? data : [])
      return data
    }),
    refetchInterval: 30_000,
  })

  const filteredConvs = useMemo(() => {
    const q = search.toLowerCase()
    return conversations.filter((c) => !q || c.other_user?.full_name?.toLowerCase().includes(q))
  }, [conversations, search])

  const filteredGroups = useMemo(() => {
    const q = search.toLowerCase()
    return groups.filter((g) => !q || g.name.toLowerCase().includes(q))
  }, [groups, search])

  const selectConversation = useCallback((conv) => {
    setActiveRoom({ type: 'direct', id: conv.id, data: conv })
    setTab('dms')
  }, [setActiveRoom])

  const selectGroup = useCallback((group) => {
    setActiveRoom({ type: 'group', id: group.id, data: group })
    setTab('groups')
  }, [setActiveRoom])

  const totalUnread =
    conversations.reduce((a, c) => a + (c.unread_count || 0), 0) +
    groups.reduce((a, g) => a + (g.unread_count || 0), 0)

  // Always derive header data from the live store so is_online / last_seen stay fresh.
  const liveHeaderData = useMemo(() => {
    if (!activeRoom) return null
    if (activeRoom.type === 'direct') {
      return conversations.find((c) => c.id === activeRoom.id) ?? activeRoom.data
    }
    if (activeRoom.type === 'group') {
      return groups.find((g) => g.id === activeRoom.id) ?? activeRoom.data
    }
    return activeRoom.data
  }, [activeRoom, conversations, groups])

  return (
    <div className="flex overflow-hidden -m-6" style={{ height: 'calc(100vh - 64px)' }}>

      {/* ── Left sidebar ──────────────────────────────────────────────────── */}
      <div className={clsx(
        'shrink-0 flex flex-col border-r border-slate-700 bg-slate-800/40',
        'w-full md:w-80',
        activeRoom ? 'hidden md:flex' : 'flex',
      )}>

        {/* Header */}
        <div className="h-14 flex items-center justify-between px-4 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-indigo-400" />
            <span className="font-semibold text-white text-sm">Messages</span>
            {totalUnread > 0 && (
              <span className="min-w-[1rem] h-4 rounded-full bg-indigo-500 text-white text-[10px] flex items-center justify-center px-1">
                {totalUnread > 9 ? '9+' : totalUnread}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setDMModal(true)}
              title="New message"
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              onClick={() => setGroupModal(true)}
              title="New group"
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
            >
              <Users className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-700 px-2 pt-2 gap-0.5">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={clsx(
                'flex-1 py-1.5 text-xs font-medium rounded-t-lg transition-colors',
                tab === t ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300',
              )}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>

        {/* Search */}
        {tab !== 'reports' && (
          <div className="px-3 py-2 border-b border-slate-700">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={tab === 'dms' ? 'Search chats…' : 'Search groups…'}
                className="input pl-8 py-1.5 text-xs w-full"
              />
            </div>
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">

          {tab === 'dms' && (
            filteredConvs.length === 0 ? (
              <div className="flex flex-col items-center py-10 text-center px-4">
                <MessageSquare className="w-10 h-10 text-slate-700 mb-2" />
                <p className="text-slate-500 text-sm font-medium">
                  {search ? 'No results' : 'No conversations yet'}
                </p>
                {!search && (
                  <button
                    onClick={() => setDMModal(true)}
                    className="text-indigo-400 hover:text-indigo-300 text-xs mt-2 transition-colors"
                  >
                    Start a conversation →
                  </button>
                )}
              </div>
            ) : (
              filteredConvs.map((c) => (
                <ConversationItem
                  key={c.id}
                  conv={c}
                  isActive={activeRoom?.type === 'direct' && activeRoom.id === c.id}
                  onSelect={selectConversation}
                />
              ))
            )
          )}

          {tab === 'groups' && (
            filteredGroups.length === 0 ? (
              <div className="flex flex-col items-center py-10 text-center px-4">
                <Users className="w-10 h-10 text-slate-700 mb-2" />
                <p className="text-slate-500 text-sm font-medium">
                  {search ? 'No results' : 'No groups yet'}
                </p>
                {!search && (
                  <button
                    onClick={() => setGroupModal(true)}
                    className="text-indigo-400 hover:text-indigo-300 text-xs mt-2 transition-colors"
                  >
                    Create a group →
                  </button>
                )}
              </div>
            ) : (
              filteredGroups.map((g) => (
                <GroupItem
                  key={g.id}
                  group={g}
                  isActive={activeRoom?.type === 'group' && activeRoom.id === g.id}
                  onSelect={selectGroup}
                />
              ))
            )
          )}

          {tab === 'reports' && (
            <button
              onClick={() => setActiveRoom({ type: 'reports', id: 'reports', data: {} })}
              className={clsx(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors',
                activeRoom?.type === 'reports' ? 'bg-indigo-600' : 'hover:bg-slate-700/50',
              )}
            >
              <div className="w-8 h-8 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center shrink-0">
                <FileText className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-200">
                  {isManager ? 'All Reports' : 'My Reports'}
                </p>
                <p className="text-xs text-slate-500">PDF submissions &amp; reviews</p>
              </div>
            </button>
          )}
        </div>
      </div>

      {/* ── Right panel ───────────────────────────────────────────────────── */}
      <div className={clsx(
        'flex-1 flex-col min-w-0 bg-slate-900',
        activeRoom ? 'flex' : 'hidden md:flex',
      )}>
        {/* Mobile back button */}
        {activeRoom && (
          <button
            onClick={() => setActiveRoom(null)}
            className="md:hidden flex items-center gap-2 px-4 py-2 text-sm text-slate-400 hover:text-white border-b border-slate-700 bg-slate-800/60"
          >
            ← Back to Messages
          </button>
        )}
        {activeRoom ? (
          activeRoom.type === 'reports' ? (
            <ReportsPanel isManager={isManager} />
          ) : (
            <MessageThread
              roomType={activeRoom.type}
              roomId={activeRoom.id}
              headerData={liveHeaderData}
              myUserId={user?.id}
            />
          )
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <div className="w-20 h-20 rounded-3xl bg-indigo-500/10 flex items-center justify-center mb-5">
              <MessageSquare className="w-10 h-10 text-indigo-400" />
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">Your messages</h2>
            <p className="text-slate-500 text-sm max-w-xs leading-relaxed">
              Select a conversation from the left, or start a new direct message or group chat.
            </p>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setDMModal(true)}
                className="btn-primary flex items-center gap-2 text-sm"
              >
                <Plus className="w-4 h-4" /> New Message
              </button>
              <button
                onClick={() => setGroupModal(true)}
                className="btn-secondary flex items-center gap-2 text-sm"
              >
                <Users className="w-4 h-4" /> New Group
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Modals ──────────────────────────────────────────────────────── */}
      {showDMModal && (
        <NewDMModal
          onClose={() => setDMModal(false)}
          onCreated={(conv) => {
            qc.invalidateQueries({ queryKey: ['chat-conversations'] })
            selectConversation(conv)
          }}
        />
      )}
      {showGroupModal && (
        <NewGroupModal
          onClose={() => setGroupModal(false)}
          onCreated={selectGroup}
        />
      )}
    </div>
  )
}
