'use client'
import type { ContextCard } from '@/types'

interface Props {
  card: ContextCard
  isGenerating?: boolean
  collapsed?: boolean
  onShowWaiting?: () => void
  onExpand?: () => void
  onDismiss: () => void
  pendingCount?: number
  timeZone?: string | null
}

const CARD_STYLES: Record<string, string> = {
  open:    'bg-gradient-to-br from-cream-50 to-cream-100 border-cream-400',
  reentry: 'bg-gradient-to-br from-terracotta-50 to-cream-100 border-terracotta-200',
}

const CARD_LABELS: Record<string, { icon: string; label: string }> = {
  open:    { icon: '🌿', label: 'Your day so far' },
  reentry: { icon: '👋', label: 'Welcome back' },
}

export default function ContextCardDisplay({
  card,
  isGenerating,
  collapsed = false,
  onShowWaiting,
  onExpand,
  onDismiss,
  pendingCount = 0,
  timeZone,
}: Props) {
  const style = CARD_STYLES[card.type] ?? CARD_STYLES.open
  const meta  = CARD_LABELS[card.type] ?? CARD_LABELS.open
  const footerLabel = card.generated_by === 'ai' ? 'AI reflection' : 'Saved by Context'

  if (collapsed) {
    return (
      <div className={`rounded-2xl border px-4 py-3 animate-fade-up ${style}`}>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onExpand}
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
            aria-label="Expand Context update"
          >
            <span className="text-lg">{meta.icon}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-warm-800">Context has an update</span>
              <span className="block text-xs text-warm-500 mt-0.5">Tap to view</span>
            </span>
            <span className="text-sm font-medium text-warm-600">View</span>
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="w-8 h-8 rounded-full bg-warm-200/60 flex items-center justify-center text-warm-600 text-lg"
            aria-label="Dismiss Context update"
          >
            ×
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={`rounded-card border-2 p-5 animate-fade-up ${style} ${isGenerating ? 'animate-pulse-soft' : ''}`}>
      {/* Label row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <span className="text-base">{meta.icon}</span>
          <span className="text-xs font-medium text-warm-500 uppercase tracking-wide">{meta.label}</span>
          {card.type === 'reentry' && (
            <span className="ml-1 px-2 py-0.5 rounded-pill bg-terracotta-100 text-terracotta-600 text-xs font-medium">
              Re-entry
            </span>
          )}
        </div>
        <button
          onClick={onDismiss}
          className="w-6 h-6 rounded-full bg-warm-200/60 flex items-center justify-center
                     text-warm-500 hover:text-warm-800 hover:bg-warm-200 transition-colors text-sm leading-none"
          title="Dismiss card"
        >
          ×
        </button>
      </div>

      {/* Card title */}
      <h2 className="font-serif text-lg font-semibold text-warm-900 mb-2 leading-snug">
        {card.title}
      </h2>

      <p className="text-xs font-medium text-warm-500 mb-2">
        {pendingCount > 0
          ? `${pendingCount} ${pendingCount === 1 ? 'plan is' : 'plans are'} waiting right now`
          : 'Nothing is waiting right now'}
      </p>

      {/* Card body */}
      <p className="text-warm-700 text-sm leading-relaxed whitespace-pre-line">
        {card.body}
      </p>

      <div className={`${pendingCount > 0 ? 'grid-cols-2' : 'grid-cols-1'} grid gap-2 mt-4`}>
        {pendingCount > 0 && (
          <button
            onClick={onShowWaiting}
            className="rounded-xl bg-warm-700 text-cream-100 py-2 text-sm font-medium active:scale-[0.98] transition-all"
          >
            Show {pendingCount} waiting {pendingCount === 1 ? 'plan' : 'plans'}
          </button>
        )}
        <button
          onClick={onDismiss}
          className="rounded-xl border border-warm-200 text-warm-500 py-2 text-sm font-medium active:scale-[0.98] transition-all"
        >
          Dismiss
        </button>
      </div>

      {/* Footer */}
      <p className="text-warm-300 text-xs mt-3">
        Updated {new Date(card.created_at).toLocaleTimeString('en-US', {
          timeZone: timeZone || undefined,
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        })}
        {' · '}{footerLabel}
      </p>
    </div>
  )
}
