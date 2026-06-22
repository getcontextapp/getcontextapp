'use client'

import { useRef, useState } from 'react'
import { ACTIVITY_TILES } from '@/types'
import TaskScheduleFields from './TaskScheduleFields'
import type { ActivityCategory, ExpectedPeriod, PlannedActivity, RepeatRule, TimelineEvent } from '@/types'

interface DraftPlan {
  category: ActivityCategory
  note: string
  expected_period: ExpectedPeriod
  expected_time?: string | null
  repeat_rule?: RepeatRule
}

interface DraftModification extends DraftPlan {
  id: string
  current_note: string
  planned_for?: string
}

interface Props {
  plannedFor: string
  onSaved: (items: PlannedActivity[]) => void
  onTimelineSaved?: (event: TimelineEvent) => void
}

export default function NaturalLanguagePlanComposer({ plannedFor, onSaved, onTimelineSaved }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [message, setMessage] = useState('')
  const [drafts, setDrafts] = useState<DraftPlan[]>([])
  const [modification, setModification] = useState<DraftModification | null>(null)
  const [capture, setCapture] = useState<{ type: 'doing_now' | 'did'; text: string } | null>(null)
  const [savedCapture, setSavedCapture] = useState<TimelineEvent | null>(null)
  const [parsing, setParsing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  function openComposer() {
    setExpanded(true)
    window.setTimeout(() => inputRef.current?.focus(), 50)
  }

  async function interpretPlans() {
    if (!message.trim()) {
      openComposer()
      setError('Tell Context what you are doing or planning.')
      return
    }

    setParsing(true)
    setError(null)
    setSavedCapture(null)
    try {
      const response = await fetch('/api/planned-activities/natural-language', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'parse', message }),
      })
      const result = await response.json()
      if (!response.ok) {
        setError(result.error ?? 'Context could not understand that yet.')
        return
      }
      if (result.capture) {
        setCapture(result.capture)
        setModification(null)
        setDrafts([])
      } else if (result.modification) {
        setModification(result.modification)
        setDrafts([])
      } else {
        setDrafts(result.items)
        setCapture(null)
      }
      setError(null)
    } catch {
      setError('Context could not connect. Please try again.')
    } finally {
      setParsing(false)
    }
  }

  async function saveModification() {
    if (!modification) return
    setSaving(true); setError(null)
    const response = await fetch('/api/planned-activities/natural-language', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'modify', modification }),
    })
    const result = await response.json()
    setSaving(false)
    if (!response.ok) return setError(result.error ?? 'Context could not change that task.')
    onSaved([result.item, result.previous].filter(Boolean))
    setModification(null); setMessage(''); setExpanded(false)
  }

  async function savePlans() {
    const validDrafts = drafts.filter(item => item.note.trim())
    if (validDrafts.length === 0) {
      setError('Keep at least one plan before saving.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      const response = await fetch('/api/planned-activities/natural-language', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save',
          planned_for: plannedFor,
          items: validDrafts,
        }),
      })
      const result = await response.json()
      if (!response.ok) {
        setError(result.error ?? 'Context could not save these plans.')
        return
      }

      onSaved(result.items)
      setMessage('')
      setDrafts([])
      setExpanded(false)
    } catch {
      setError('Context could not connect. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function saveCapture() {
    if (!capture?.text.trim()) return
    setSaving(true)
    setError(null)
    try {
      const response = await fetch('/api/timeline-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: capture.text,
          type: capture.type,
          source: 'user-stated',
          confidence: 'high',
        }),
      })
      const result = await response.json()
      if (!response.ok) {
        setError(result.error ?? 'Context could not save that note.')
        return
      }
      setSavedCapture(result.event)
      onTimelineSaved?.(result.event)
      setMessage('')
      setCapture(null)
      window.setTimeout(() => {
        setSavedCapture(null)
        setExpanded(false)
      }, 2500)
    } catch {
      setError('Context could not connect. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  function updateDraft(index: number, patch: Partial<DraftPlan>) {
    setDrafts(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item))
  }

  return (
    <>
      <div className="animate-fade-up">
        {!expanded && (
          <button
            type="button"
            onClick={openComposer}
            className="w-full min-h-14 rounded-pill border-2 border-cream-300 bg-white px-5 py-3
                       shadow-card flex items-center gap-3 text-left active:scale-[0.99] transition-all
                       focus:outline-none focus:ring-2 focus:ring-terracotta-300/60"
            aria-expanded={expanded}
          >
            <span className="text-lg" aria-hidden="true">＋</span>
            <span className="flex-1 text-base font-medium text-warm-600">Tell Context your plans for today...</span>
            <span className="w-9 h-9 shrink-0 rounded-full bg-warm-700 text-cream-50 flex items-center justify-center text-lg" aria-hidden="true">→</span>
          </button>
        )}

        {expanded && (
          <div className="card p-5 border border-cream-200 animate-fade-up">
            <label htmlFor="natural-plan-input" className="font-serif text-lg font-semibold text-warm-900">
              What would you like to do today?
            </label>
            <p className="text-sm text-warm-400 mt-1">You can mention plans, what you're doing now, or what you just did.</p>
            <textarea
              ref={inputRef}
              id="natural-plan-input"
              value={message}
              onChange={event => setMessage(event.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="For example: Making lunch, take my medicine after breakfast, or call my care partner at 4."
              className="mt-4 w-full resize-none rounded-xl border border-cream-300 bg-cream-50 px-4 py-3
                         text-base leading-relaxed text-warm-800 placeholder:text-warm-300
                         focus:outline-none focus:ring-2 focus:ring-terracotta-300/60"
            />
            {error && drafts.length === 0 && <p className="text-sm text-terracotta-600 mt-2">{error}</p>}
            <div className="grid grid-cols-[1fr_2fr] gap-2 mt-4">
              <button
                type="button"
                onClick={() => {
                  setExpanded(false)
                  setError(null)
                }}
                className="rounded-xl border border-warm-200 py-3 text-sm font-medium text-warm-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={interpretPlans}
                disabled={parsing}
                className="rounded-xl bg-warm-700 py-3 text-sm font-medium text-cream-50 disabled:opacity-50"
              >
                {parsing ? 'Understanding...' : 'Continue'}
              </button>
            </div>
          </div>
        )}
      </div>

      {drafts.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-end" role="dialog" aria-modal="true" aria-labelledby="plan-preview-title">
          <div className="absolute inset-0 bg-warm-900/30 backdrop-blur-sm" />
          <div className="relative w-full max-w-lg mx-auto max-h-[90svh] overflow-y-auto rounded-t-3xl bg-cream-50 px-5 pt-3 pb-8 shadow-float animate-fade-up safe-bottom">
            <div className="w-10 h-1 bg-warm-300/40 rounded-pill mx-auto mb-4" />
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="plan-preview-title" className="font-serif text-xl font-semibold text-warm-900">Context understood</h2>
                <p className="text-sm text-warm-500 mt-1">Check each plan before adding it.</p>
              </div>
              <button
                type="button"
                onClick={() => setDrafts([])}
                className="w-9 h-9 rounded-full bg-cream-200 text-warm-600 text-xl"
                aria-label="Close plan preview"
              >
                ×
              </button>
            </div>

            <div className="space-y-3 mt-5">
              {drafts.map((draft, index) => {
                const tile = ACTIVITY_TILES.find(item => item.category === draft.category)
                return (
                  <div key={`${index}-${draft.category}`} className="rounded-2xl border border-cream-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{tile?.icon ?? '✏️'}</span>
                      <input
                        value={draft.note}
                        onChange={event => updateDraft(index, { note: event.target.value })}
                        maxLength={160}
                        aria-label={`Plan ${index + 1}`}
                        className="min-w-0 flex-1 border-b border-cream-200 bg-transparent py-1 text-base font-semibold text-warm-900 focus:outline-none focus:border-terracotta-400"
                      />
                      <button
                        type="button"
                        onClick={() => setDrafts(current => current.filter((_, itemIndex) => itemIndex !== index))}
                        className="text-sm text-terracotta-700"
                        aria-label={`Remove ${draft.note}`}
                      >
                        Remove
                      </button>
                    </div>
                    <div className="mt-3">
                      <TaskScheduleFields
                        period={draft.expected_period}
                        time={draft.expected_time ?? null}
                        repeat={draft.repeat_rule ?? 'none'}
                        onPeriod={value => updateDraft(index, { expected_period: value })}
                        onTime={value => updateDraft(index, { expected_time: value })}
                        onRepeat={value => updateDraft(index, { repeat_rule: value })}
                      />
                    </div>
                  </div>
                )
              })}
            </div>

            {error && <p className="text-sm text-terracotta-600 mt-3">{error}</p>}
            <button
              type="button"
              onClick={savePlans}
              disabled={saving || drafts.length === 0}
              className="w-full rounded-xl bg-warm-700 py-3.5 mt-5 text-base font-medium text-cream-50 disabled:opacity-50"
            >
              {saving ? 'Adding plans...' : `Add ${drafts.length} ${drafts.length === 1 ? 'plan' : 'plans'} to today`}
            </button>
            <button
              type="button"
              onClick={() => {
                setDrafts([])
                window.setTimeout(() => inputRef.current?.focus(), 50)
              }}
              className="w-full py-3 mt-1 text-sm font-medium text-warm-500"
            >
              Go back and change my message
            </button>
          </div>
        </div>
      )}
      {capture && (
        <div className="fixed inset-0 z-50 flex items-end" role="dialog" aria-modal="true" aria-labelledby="capture-preview-title">
          <div className="absolute inset-0 bg-warm-900/30 backdrop-blur-sm" />
          <div className="relative w-full max-w-lg mx-auto rounded-t-3xl bg-cream-50 px-5 pt-3 pb-8 shadow-float animate-fade-up safe-bottom">
            <div className="w-10 h-1 bg-warm-300/40 rounded-pill mx-auto mb-4" />
            <h2 id="capture-preview-title" className="font-serif text-xl font-semibold text-warm-900">Context understood</h2>
            <p className="text-sm text-warm-500 mt-1">This becomes a note Context can use later.</p>
            <div className="mt-5 rounded-2xl border border-cream-200 bg-white p-4 shadow-sm">
              <span className="inline-flex rounded-pill bg-sage-100 px-3 py-1 text-xs font-semibold text-sage-600">
                Saved as certain
              </span>
              <input
                value={capture.text}
                onChange={event => setCapture(current => current ? { ...current, text: event.target.value } : current)}
                className="mt-4 min-h-12 w-full rounded-xl border border-cream-300 bg-cream-50 px-4 text-base font-semibold text-warm-900"
                aria-label="What Context understood"
              />
              <p className="mt-3 text-sm text-warm-400">
                {capture.type === 'doing_now' ? 'Right now.' : 'Just now.'}
              </p>
            </div>
            {error && <p className="text-sm text-terracotta-600 mt-3">{error}</p>}
            <button
              type="button"
              onClick={saveCapture}
              disabled={saving || !capture.text.trim()}
              className="w-full rounded-xl bg-warm-700 py-3.5 mt-5 text-base font-medium text-cream-50 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save it'}
            </button>
            <button
              type="button"
              onClick={() => {
                setCapture(null)
                window.setTimeout(() => inputRef.current?.focus(), 50)
              }}
              className="w-full py-3 mt-1 text-sm font-medium text-warm-500"
            >
              Go back and change my message
            </button>
          </div>
        </div>
      )}
      {savedCapture && (
        <div className="fixed inset-x-5 bottom-5 z-50 mx-auto max-w-sm rounded-2xl border border-sage-200 bg-sage-50 px-5 py-4 text-center shadow-float">
          <p className="font-serif text-lg font-semibold text-warm-900">
            {savedCapture.text}, {savedCapture.type === 'doing_now' ? 'right now' : 'just now'}.
          </p>
          <p className="mt-1 text-sm text-warm-500">
            Saved at {new Date(savedCapture.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}.
          </p>
        </div>
      )}
      {modification && (
        <div className="fixed inset-0 z-50 flex items-end bg-warm-900/35" role="dialog" aria-modal="true" aria-labelledby="change-preview-title">
          <div className="mx-auto w-full max-w-lg rounded-t-3xl bg-cream-50 px-5 pb-8 pt-5 shadow-float safe-bottom">
            <h2 id="change-preview-title" className="font-serif text-xl font-semibold text-warm-900">Change this task?</h2>
            <p className="mt-2 text-sm text-warm-500">From: {modification.current_note}</p>
            {modification.planned_for && modification.planned_for !== plannedFor && (
              <p className="mt-1 text-sm font-medium text-sage-600">
                Move to {new Date(`${modification.planned_for}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </p>
            )}
            <input value={modification.note} onChange={event => setModification(current => current ? { ...current, note: event.target.value } : current)}
              className="mt-4 min-h-12 w-full rounded-xl border border-cream-300 bg-white px-4 text-base font-semibold text-warm-900" />
            <div className="mt-4">
              <TaskScheduleFields period={modification.expected_period} time={modification.expected_time ?? null}
                repeat={modification.repeat_rule ?? 'none'}
                onPeriod={value => setModification(current => current ? { ...current, expected_period: value } : current)}
                onTime={value => setModification(current => current ? { ...current, expected_time: value } : current)}
                onRepeat={value => setModification(current => current ? { ...current, repeat_rule: value } : current)} />
            </div>
            {error && <p className="mt-3 text-sm text-terracotta-700">{error}</p>}
            <button onClick={saveModification} disabled={saving} className="mt-5 min-h-12 w-full rounded-xl bg-warm-700 text-base font-medium text-cream-50">
              {saving ? 'Saving...' : 'Confirm change'}
            </button>
            <button onClick={() => setModification(null)} className="mt-2 min-h-11 w-full text-sm font-medium text-warm-500">Cancel</button>
          </div>
        </div>
      )}
    </>
  )
}
