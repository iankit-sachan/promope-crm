import { useState, useRef, useCallback, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Monitor, MonitorOff, Play, Square, RefreshCw, Copy, Wifi, WifiOff, Clock, User } from 'lucide-react'
import { remoteService } from '../services/api'
import { useRemoteControl } from '../hooks/useRemoteControl'
import { useAuthStore } from '../store/authStore'
import toast from 'react-hot-toast'

// ── Active Session Panel ────────────────────────────────────────────────────

function SessionPanel({ session, onEnd }) {
  const canvasRef = useRef(null)
  const { connected, onMouseMove, onMouseDown, onWheel, onKeyDown, endSession } = useRemoteControl({
    sessionId: session.session_id,
    canvasRef,
    onStateChange: (event, data) => {
      if (event === 'ended' || event === 'session_ended') {
        toast('Session ended')
        onEnd()
      }
    },
  })

  const handleEnd = useCallback(() => {
    endSession()
    onEnd()
  }, [endSession, onEnd])

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
      {/* Session header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <div className={`w-2.5 h-2.5 rounded-full ${connected ? 'bg-green-400 animate-pulse' : 'bg-yellow-400'}`} />
          <span className="text-sm font-medium text-slate-200">
            {connected ? 'Live Session' : 'Connecting…'}
          </span>
          <span className="text-xs text-slate-500 font-mono">{session.session_id?.slice(0, 8)}…</span>
        </div>
        <button
          onClick={handleEnd}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg transition-colors"
        >
          <Square size={12} />
          End Session
        </button>
      </div>

      {/* Canvas */}
      <div className="relative bg-black" style={{ aspectRatio: '16/9' }}>
        {!connected && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10">
            <RefreshCw size={32} className="text-slate-500 animate-spin" />
            <p className="text-slate-400 text-sm">Waiting for screen stream…</p>
          </div>
        )}
        <canvas
          ref={canvasRef}
          className="w-full h-full outline-none cursor-crosshair block"
          tabIndex={0}
          onMouseMove={onMouseMove}
          onMouseDown={onMouseDown}
          onWheel={onWheel}
          onKeyDown={onKeyDown}
          onContextMenu={(e) => e.preventDefault()}
        />
      </div>

      <p className="text-center text-xs text-slate-600 py-2">
        Click the canvas and press keys to control — mouse and keyboard events are forwarded in real time
      </p>
    </div>
  )
}

// ── Agent Token Card ────────────────────────────────────────────────────────

function AgentTokenCard() {
  const { user } = useAuthStore()
  const { data, isLoading } = useQuery({
    queryKey: ['my-agent-token'],
    queryFn: () => remoteService.myToken().then((r) => r.data),
    enabled: user?.role === 'employee',
  })

  const copyToken = () => {
    if (data?.agent_token) {
      navigator.clipboard.writeText(data.agent_token)
      toast.success('Token copied!')
    }
  }

  if (user?.role !== 'employee') return null

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-5 mb-6">
      <h3 className="text-sm font-semibold text-slate-200 mb-1">Your Remote Agent Token</h3>
      <p className="text-xs text-slate-500 mb-3">
        Use this token when running the remote agent script on your machine.
      </p>
      {isLoading ? (
        <div className="h-9 bg-slate-700 rounded-lg animate-pulse" />
      ) : data?.agent_token ? (
        <div className="flex items-center gap-2">
          <code className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-green-400 font-mono truncate">
            {data.agent_token}
          </code>
          <button
            onClick={copyToken}
            className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
            title="Copy token"
          >
            <Copy size={14} />
          </button>
        </div>
      ) : (
        <p className="text-xs text-slate-500 italic">No agent registered yet. Register via the CLI agent script.</p>
      )}
      {data?.machine_name && (
        <p className="text-xs text-slate-600 mt-2">Machine: <span className="text-slate-400">{data.machine_name}</span></p>
      )}
    </div>
  )
}

// ── Main Page ───────────────────────────────────────────────────────────────

export default function RemoteControlPage() {
  const queryClient = useQueryClient()
  const [activeSession, setActiveSession] = useState(null)
  const [pendingAgentId, setPendingAgentId] = useState(null)

  // Poll agents list
  const { data: agents = [], isLoading: agentsLoading } = useQuery({
    queryKey: ['remote-agents'],
    queryFn: () => remoteService.agentList().then((r) => Array.isArray(r.data) ? r.data : (r.data?.results ?? [])),
    refetchInterval: 5000,
  })

  // Session history
  const { data: sessions = [], isLoading: sessionsLoading } = useQuery({
    queryKey: ['remote-sessions'],
    queryFn: () => remoteService.sessionList().then((r) => Array.isArray(r.data) ? r.data : (r.data?.results ?? [])),
  })

  // Request session mutation
  const requestMutation = useMutation({
    mutationFn: (agentId) => remoteService.requestSession({ agent_id: agentId }),
    onSuccess: (res) => {
      const session = res.data
      setPendingAgentId(null)
      // Poll until session becomes active
      const sessionId = session.session_id || session.id
      startPollingSession(session.id)
      toast.success('Session request sent — waiting for employee to accept')
      queryClient.invalidateQueries({ queryKey: ['remote-sessions'] })
    },
    onError: () => {
      setPendingAgentId(null)
    },
  })

  // End session mutation
  const endMutation = useMutation({
    mutationFn: (sessionId) => remoteService.endSession(sessionId),
    onSuccess: () => {
      setActiveSession(null)
      queryClient.invalidateQueries({ queryKey: ['remote-sessions'] })
      queryClient.invalidateQueries({ queryKey: ['remote-agents'] })
    },
  })

  // Poll a pending session until it becomes active/rejected
  const pollRef = useRef(null)
  const startPollingSession = useCallback((sessionDbId) => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      try {
        const res = await remoteService.sessionList()
        const list = Array.isArray(res.data) ? res.data : (res.data?.results ?? [])
        const s = list.find((x) => x.id === sessionDbId)
        if (s?.status === 'active') {
          clearInterval(pollRef.current)
          setActiveSession(s)
          queryClient.invalidateQueries({ queryKey: ['remote-sessions'] })
        } else if (s?.status === 'rejected') {
          clearInterval(pollRef.current)
          toast.error('Session rejected by employee')
          queryClient.invalidateQueries({ queryKey: ['remote-sessions'] })
        }
      } catch {}
    }, 2000)
  }, [queryClient])

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  const handleRequest = (agent) => {
    setPendingAgentId(agent.id)
    requestMutation.mutate(agent.id)
  }

  const handleEnd = useCallback(() => {
    if (activeSession) endMutation.mutate(activeSession.id)
    else setActiveSession(null)
  }, [activeSession, endMutation])

  const formatDuration = (start, end) => {
    if (!start) return '—'
    const from = new Date(start)
    const to = end ? new Date(end) : new Date()
    const secs = Math.floor((to - from) / 1000)
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m}m ${s}s`
  }

  const recentSessions = [...(sessions || [])].sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at)
  ).slice(0, 10)

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <Monitor size={24} className="text-blue-400" />
            Remote Control
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            View and control employee screens in real time
          </p>
        </div>
        <button
          onClick={() => queryClient.invalidateQueries({ queryKey: ['remote-agents'] })}
          className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
          title="Refresh"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Employee: show own agent token */}
      <AgentTokenCard />

      {/* Active session panel */}
      {activeSession && (
        <div>
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">Active Session</h2>
          <SessionPanel session={activeSession} onEnd={handleEnd} />
        </div>
      )}

      {/* Agents table */}
      <div>
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">Connected Agents</h2>
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          {agentsLoading ? (
            <div className="p-8 text-center text-slate-500 text-sm">Loading agents…</div>
          ) : agents.length === 0 ? (
            <div className="p-8 text-center">
              <MonitorOff size={32} className="mx-auto text-slate-600 mb-3" />
              <p className="text-slate-500 text-sm">No agents registered yet.</p>
              <p className="text-slate-600 text-xs mt-1">
                Employees must run <code className="text-blue-400">remote_agent.py</code> on their machine.
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-slate-400 text-xs uppercase tracking-wide">
                  <th className="text-left px-5 py-3">Employee</th>
                  <th className="text-left px-5 py-3">Machine</th>
                  <th className="text-left px-5 py-3">Status</th>
                  <th className="text-left px-5 py-3">Last Seen</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {agents.map((agent) => (
                  <tr key={agent.id} className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <User size={14} className="text-slate-500" />
                        <span className="text-slate-200">{agent.employee_name || agent.employee}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-slate-400 font-mono text-xs">{agent.machine_name}</td>
                    <td className="px-5 py-3">
                      {agent.is_online ? (
                        <span className="inline-flex items-center gap-1.5 text-green-400 text-xs font-medium">
                          <Wifi size={12} /> Online
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-slate-500 text-xs">
                          <WifiOff size={12} /> Offline
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-slate-500 text-xs">
                      {agent.last_ping
                        ? new Date(agent.last_ping).toLocaleString()
                        : '—'}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {agent.is_online && !activeSession && (
                        <button
                          onClick={() => handleRequest(agent)}
                          disabled={pendingAgentId === agent.id || requestMutation.isPending}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:text-slate-500 text-white text-xs font-medium rounded-lg transition-colors"
                        >
                          {pendingAgentId === agent.id ? (
                            <>
                              <RefreshCw size={12} className="animate-spin" />
                              Waiting…
                            </>
                          ) : (
                            <>
                              <Play size={12} />
                              Request Control
                            </>
                          )}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Session history */}
      <div>
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">Session History</h2>
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          {sessionsLoading ? (
            <div className="p-6 text-center text-slate-500 text-sm">Loading…</div>
          ) : recentSessions.length === 0 ? (
            <div className="p-6 text-center text-slate-500 text-sm">No sessions yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-slate-400 text-xs uppercase tracking-wide">
                  <th className="text-left px-5 py-3">Employee / Machine</th>
                  <th className="text-left px-5 py-3">Controller</th>
                  <th className="text-left px-5 py-3">Status</th>
                  <th className="text-left px-5 py-3">Started</th>
                  <th className="text-left px-5 py-3">Duration</th>
                </tr>
              </thead>
              <tbody>
                {recentSessions.map((s) => (
                  <tr key={s.id} className="border-b border-slate-700/50 hover:bg-slate-700/20 transition-colors">
                    <td className="px-5 py-3">
                      <div className="text-slate-200 text-xs">{s.agent_employee || s.agent}</div>
                      <div className="text-slate-600 text-xs font-mono">{s.machine_name || ''}</div>
                    </td>
                    <td className="px-5 py-3 text-slate-400 text-xs">{s.controller_name || s.controller}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        s.status === 'active'   ? 'bg-green-900/40 text-green-400' :
                        s.status === 'ended'    ? 'bg-slate-700 text-slate-400' :
                        s.status === 'rejected' ? 'bg-red-900/40 text-red-400' :
                        'bg-yellow-900/40 text-yellow-400'
                      }`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-500 text-xs">
                      {s.started_at ? new Date(s.started_at).toLocaleString() : '—'}
                    </td>
                    <td className="px-5 py-3 text-slate-500 text-xs">
                      <span className="inline-flex items-center gap-1">
                        <Clock size={11} />
                        {formatDuration(s.started_at, s.ended_at)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
