import { useState, useCallback, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  DndContext, DragOverlay, closestCorners, PointerSensor, useSensor, useSensors,
  useDroppable,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { hiringService } from '../../services/api'
import { Star, ChevronRight, X, ExternalLink, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'

const STAGES = [
  { key: 'applied',        label: 'Applied',        color: 'text-indigo-400',   bg: 'bg-indigo-500/10 border-indigo-500/30' },
  { key: 'screening',      label: 'Screening',      color: 'text-purple-400',   bg: 'bg-purple-500/10 border-purple-500/30' },
  { key: 'interview',      label: 'Interview',      color: 'text-blue-400',     bg: 'bg-blue-500/10 border-blue-500/30' },
  { key: 'technical_test', label: 'Technical Test', color: 'text-cyan-400',     bg: 'bg-cyan-500/10 border-cyan-500/30' },
  { key: 'final_round',    label: 'Final Round',    color: 'text-amber-400',    bg: 'bg-amber-500/10 border-amber-500/30' },
  { key: 'offer_sent',     label: 'Offer Sent',     color: 'text-orange-400',   bg: 'bg-orange-500/10 border-orange-500/30' },
  { key: 'hired',          label: 'Hired',          color: 'text-green-400',    bg: 'bg-green-500/10 border-green-500/30' },
  { key: 'rejected',       label: 'Rejected',       color: 'text-red-400',      bg: 'bg-red-500/10 border-red-500/30' },
]

function StarRating({ value }) {
  if (!value) return null
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} className={clsx('w-2.5 h-2.5', i <= value ? 'text-amber-400 fill-amber-400' : 'text-slate-600')} />
      ))}
    </div>
  )
}

function CandidateCard({ candidate, onClick, isDragging }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging: isSortableDragging } = useSortable({
    id: String(candidate.id),
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isSortableDragging ? 0.4 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onClick(candidate)}
      className={clsx(
        'bg-slate-800 border border-slate-700 rounded-lg p-3 cursor-grab active:cursor-grabbing',
        'hover:border-slate-500 transition-colors select-none',
        isDragging && 'shadow-xl',
      )}
    >
      <p className="text-sm font-medium text-slate-200 truncate">{candidate.candidate_name}</p>
      <p className="text-xs text-slate-500 truncate mt-0.5">{candidate.position_title || 'No position'}</p>
      <div className="flex items-center justify-between mt-2">
        <p className="text-xs text-slate-600">
          {candidate.application_date
            ? new Date(candidate.application_date).toLocaleDateString()
            : new Date(candidate.created_at).toLocaleDateString()}
        </p>
        <StarRating value={candidate.rating} />
      </div>
    </div>
  )
}

function DragOverlayCard({ candidate }) {
  return (
    <div className="bg-slate-800 border border-indigo-500 rounded-lg p-3 shadow-2xl w-52">
      <p className="text-sm font-medium text-slate-200 truncate">{candidate.candidate_name}</p>
      <p className="text-xs text-slate-500 truncate mt-0.5">{candidate.position_title || 'No position'}</p>
    </div>
  )
}

function KanbanColumn({ stage, candidates, onCardClick }) {
  // P1: make the column itself a valid drop target so cards can be dropped on empty space
  const { setNodeRef: setDropRef } = useDroppable({ id: stage.key })

  return (
    <div className={clsx('flex-shrink-0 w-52 flex flex-col border rounded-xl', stage.bg)}>
      <div className="p-3 border-b border-slate-700/50">
        <div className="flex items-center justify-between">
          <p className={clsx('text-xs font-semibold uppercase tracking-wide', stage.color)}>
            {stage.label}
          </p>
          <span className="text-xs bg-slate-700/60 text-slate-400 rounded-full px-1.5 py-0.5 font-medium">
            {candidates.length}
          </span>
        </div>
      </div>
      <SortableContext
        items={candidates.map(c => String(c.id))}
        strategy={verticalListSortingStrategy}
      >
        <div ref={setDropRef} className="p-2 flex flex-col gap-2 flex-1 min-h-[120px]">
          {candidates.map(c => (
            <CandidateCard key={c.id} candidate={c} onClick={onCardClick} />
          ))}
        </div>
      </SortableContext>
    </div>
  )
}

function CandidateDrawer({ candidate, onClose }) {
  const navigate = useNavigate()

  if (!candidate) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div
        className="w-80 bg-slate-800 border-l border-slate-700 h-full flex flex-col fade-in shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h3 className="font-semibold text-white text-sm">{candidate.candidate_name}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-3 flex-1 overflow-y-auto">
          <div>
            <p className="text-xs text-slate-500">Email</p>
            <p className="text-sm text-slate-300">{candidate.email}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Position</p>
            <p className="text-sm text-slate-300">{candidate.position_title || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Stage</p>
            <p className="text-sm text-slate-300 capitalize">{candidate.current_stage?.replace('_', ' ')}</p>
          </div>
          {candidate.rating && (
            <div>
              <p className="text-xs text-slate-500">Rating</p>
              <StarRating value={candidate.rating} />
            </div>
          )}
          <div>
            <p className="text-xs text-slate-500">Applied</p>
            <p className="text-sm text-slate-300">
              {candidate.application_date
                ? new Date(candidate.application_date).toLocaleDateString()
                : new Date(candidate.created_at).toLocaleDateString()}
            </p>
          </div>
          {candidate.notes && (
            <div>
              <p className="text-xs text-slate-500">Notes</p>
              <p className="text-sm text-slate-400 whitespace-pre-wrap">{candidate.notes}</p>
            </div>
          )}
        </div>
        <div className="p-4 border-t border-slate-700">
          <button
            onClick={() => navigate(`/hr/hiring/candidates/${candidate.id}`)}
            className="btn-primary w-full flex items-center justify-center gap-2 text-sm"
          >
            <ExternalLink className="w-4 h-4" /> View Full Profile
          </button>
        </div>
      </div>
    </div>
  )
}

export default function HiringPipeline() {
  const qc = useQueryClient()
  const [posFilter, setPosFilter] = useState('')
  const [selectedCard, setSelectedCard] = useState(null)
  const [activeId, setActiveId] = useState(null)
  const [activeCandidate, setActiveCandidate] = useState(null)
  // P2: capture posFilter at drag-start so invalidation uses the right cache key
  const [dragPosFilter, setDragPosFilter] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['hiring-pipeline', posFilter],
    queryFn:  () => hiringService.pipeline(posFilter ? { position: posFilter } : {}).then(r => r.data),
  })
  const { data: jobsData } = useQuery({
    queryKey: ['hiring-jobs', 'all'],
    queryFn:  () => hiringService.jobList().then(r => r.data),
  })

  const jobs = Array.isArray(jobsData) ? jobsData : (jobsData?.results ?? [])

  // P3: memoize so flatCandidates isn't recomputed on every render
  const flatCandidates = useMemo(
    () => (data ? Object.values(data).flat() : []),
    [data]
  )

  const stageMutation = useMutation({
    mutationFn: ({ id, stage }) => hiringService.candidateStage(id, stage),
    onError: () => {
      toast.error('Failed to update stage')
      qc.invalidateQueries({ queryKey: ['hiring-pipeline'] })
    },
  })

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const handleDragStart = useCallback((event) => {
    const id = Number(event.active.id)
    const candidate = flatCandidates.find(c => c.id === id)
    setActiveId(event.active.id)
    setActiveCandidate(candidate || null)
    setDragPosFilter(posFilter)  // P2: snapshot filter at drag-start
  }, [flatCandidates, posFilter])

  const handleDragEnd = useCallback((event) => {
    const { active, over } = event
    setActiveId(null)
    setActiveCandidate(null)

    if (!over || !data) return

    // Find which column the card was dropped into
    const candidateId = Number(active.id)
    const overId = over.id

    // overId is either a candidate id (string) or a stage key
    let targetStage = null

    // Check if dropped directly on a column identifier (stage key)
    if (STAGES.find(s => s.key === overId)) {
      targetStage = overId
    } else {
      // Dropped on another card — find that card's stage
      const overCandidateId = Number(overId)
      for (const stage of STAGES) {
        const stageCards = data[stage.key] || []
        if (stageCards.find(c => c.id === overCandidateId)) {
          targetStage = stage.key
          break
        }
      }
    }

    if (!targetStage) return

    // Find current stage of the dragged candidate
    let currentStage = null
    for (const stage of STAGES) {
      const stageCards = data[stage.key] || []
      if (stageCards.find(c => c.id === candidateId)) {
        currentStage = stage.key
        break
      }
    }

    if (!currentStage || currentStage === targetStage) return

    // Optimistic update — use dragPosFilter (snapshot from drag-start) for correct cache key
    qc.setQueryData(['hiring-pipeline', dragPosFilter], (old) => {
      if (!old) return old
      const updated = { ...old }
      const card = (updated[currentStage] || []).find(c => c.id === candidateId)
      if (!card) return old
      updated[currentStage] = (updated[currentStage] || []).filter(c => c.id !== candidateId)
      updated[targetStage] = [...(updated[targetStage] || []), { ...card, current_stage: targetStage }]
      return updated
    })

    stageMutation.mutate({ id: candidateId, stage: targetStage }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ['hiring-pipeline'] })
        qc.invalidateQueries({ queryKey: ['hiring-candidates'] })
        qc.invalidateQueries({ queryKey: ['hiring-dashboard'] })
      },
    })
  }, [data, dragPosFilter, qc, stageMutation])

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Hiring Pipeline</h1>
          <p className="text-slate-400 text-sm mt-1">Drag cards between columns to advance candidates</p>
        </div>
        <div className="flex items-center gap-3">
          {stageMutation.isPending && (
            <span className="flex items-center gap-1.5 text-xs text-slate-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Updating…
            </span>
          )}
          <select
            className="input text-sm"
            value={posFilter}
            onChange={e => setPosFilter(e.target.value)}
          >
            <option value="">All Positions</option>
            {jobs.map(j => <option key={j.id} value={j.id}>{j.job_title}</option>)}
          </select>
        </div>
      </div>

      {/* Board */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64 text-slate-500">Loading pipeline…</div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-3 overflow-x-auto pb-4">
            {STAGES.map(stage => (
              <KanbanColumn
                key={stage.key}
                stage={stage}
                candidates={data?.[stage.key] || []}
                onCardClick={setSelectedCard}
              />
            ))}
          </div>

          <DragOverlay>
            {activeCandidate ? <DragOverlayCard candidate={activeCandidate} /> : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* Candidate side drawer */}
      {selectedCard && (
        <CandidateDrawer candidate={selectedCard} onClose={() => setSelectedCard(null)} />
      )}
    </div>
  )
}
