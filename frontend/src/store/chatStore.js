/**
 * chatStore — Zustand store for the chat system.
 *
 * Holds conversations, groups, messages per room, active room,
 * and per-room WS connection state.
 */
import { create } from 'zustand'

export const useChatStore = create((set, get) => ({
  // Lists
  conversations: [],   // DirectConversation[]
  groups:        [],   // ChatGroup[]
  reports:       [],   // PdfReport[] (my reports)
  adminReports:  [],   // PdfReport[] (admin view)

  // Active room: { type: 'direct'|'group', id: number, data: object }
  activeRoom: null,

  // Messages per room:  { 'direct_1': [...], 'group_2': [...] }
  messages: {},

  // WS state for active room
  wsConnected: false,

  // Typing: { 'direct_1': { userId: name } }
  typing: {},

  // ── Setters ──────────────────────────────────────────────────────────────

  setConversations: (convs) => set({ conversations: Array.isArray(convs) ? convs : (convs?.results ?? []) }),

  setGroups: (groups) => set({ groups: Array.isArray(groups) ? groups : (groups?.results ?? []) }),

  setReports: (reports) => set({ reports }),

  setAdminReports: (adminReports) => set({ adminReports }),

  setActiveRoom: (room) => set({ activeRoom: room, wsConnected: false }),

  setWsConnected: (v) => set({ wsConnected: v }),

  // ── Messages ──────────────────────────────────────────────────────────────

  setMessages: (roomKey, msgs) =>
    set((s) => ({ messages: { ...s.messages, [roomKey]: msgs } })),

  addMessage: (roomKey, msg) =>
    set((s) => {
      const existing = s.messages[roomKey] || []
      // Deduplicate by id
      if (existing.some((m) => m.id === msg.id)) return s
      return { messages: { ...s.messages, [roomKey]: [...existing, msg] } }
    }),

  // Replace an optimistic temp message with the confirmed server message.
  // If the server message already arrived via WS, just remove the temp entry.
  replaceTempMessage: (roomKey, tempId, realMsg) =>
    set((s) => {
      const existing = s.messages[roomKey] || []
      const realExists = existing.some((m) => m.id === realMsg.id)
      const next = realExists
        ? existing.filter((m) => m.id !== tempId)
        : existing.map((m) => (m.id === tempId ? realMsg : m))
      return { messages: { ...s.messages, [roomKey]: next } }
    }),

  // Remove a single message by id (e.g. rollback a failed optimistic entry).
  removeMessage: (roomKey, msgId) =>
    set((s) => {
      const existing = s.messages[roomKey] || []
      return { messages: { ...s.messages, [roomKey]: existing.filter((m) => m.id !== msgId) } }
    }),

  // ── Read receipts ─────────────────────────────────────────────────────────

  markRead: (roomKey, userId, messageIds) =>
    set((s) => {
      const msgs = s.messages[roomKey]
      if (!msgs) return s
      const updated = msgs.map((m) =>
        messageIds.includes(m.id) && !m.read_by.includes(userId)
          ? { ...m, read_by: [...m.read_by, userId] }
          : m
      )
      return { messages: { ...s.messages, [roomKey]: updated } }
    }),

  // ── Unread counts ─────────────────────────────────────────────────────────

  updateConversationUnread: (convId, delta) =>
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === convId ? { ...c, unread_count: Math.max(0, (c.unread_count || 0) + delta) } : c
      ),
    })),

  resetUnread: (type, id) =>
    set((s) => {
      if (type === 'direct') {
        return {
          conversations: s.conversations.map((c) =>
            c.id === id ? { ...c, unread_count: 0 } : c
          ),
        }
      }
      return {
        groups: s.groups.map((g) =>
          g.id === id ? { ...g, unread_count: 0 } : g
        ),
      }
    }),

  // ── Typing indicators ─────────────────────────────────────────────────────

  setTyping: (roomKey, userId, userName, isTyping) =>
    set((s) => {
      const room = { ...(s.typing[roomKey] || {}) }
      if (isTyping) room[userId] = userName
      else          delete room[userId]
      return { typing: { ...s.typing, [roomKey]: room } }
    }),

  // ── Reports ───────────────────────────────────────────────────────────────

  addReport: (report) =>
    set((s) => ({ reports: [report, ...s.reports] })),

  updateAdminReport: (updated) =>
    set((s) => ({
      adminReports: s.adminReports.map((r) => (r.id === updated.id ? updated : r)),
    })),
}))
