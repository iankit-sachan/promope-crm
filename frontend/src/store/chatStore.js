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
