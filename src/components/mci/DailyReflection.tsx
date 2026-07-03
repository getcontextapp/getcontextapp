'use client'

import { useState } from 'react'
import type { Reflection, ReflectionNodes } from '@/types'
import WebSpeechMicButton from './WebSpeechMicButton'

const EMPTY_NODES: ReflectionNodes = {
  activities: [],
  people: [],
  places: [],
  feelings: [],
}

function TagRow({
  label,
  items,
  tagClass,
}: {
  label: string
  items: string[]
  tagClass: string
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-[72px] shrink-0 text-[11px] font-bold uppercase tracking-wide text-warm-400">
        {label}
      </span>
      {items.length > 0 ? items.map(item => (
        <span key={`${label}-${item}`} className={`rounded-pill px-3 py-1 text-xs font-semibold ${tagClass}`}>
          {item}
        </span>
      )) : (
        <span className="text-xs font-medium text-warm-300">None yet</span>
      )}
    </div>
  )
}

export default function DailyReflection({ initialReflection }: { initialReflection: Reflection | null }) {
  const [reflection, setReflection] = useState<Reflection | null>(initialReflection)
  const [inputOpen, setInputOpen] = useState(!initialReflection)
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function saveReflection() {
    const rawInput = text.trim()
    if (!rawInput) {
      setError('Write or speak one thing you want Context to remember.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const response = await fetch('/api/reflections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_input: rawInput }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(result.error ?? 'Context could not save that reflection.')
        return
      }
      setReflection(result.reflection)
      setText('')
      setInputOpen(false)
    } catch {
      setError('Context could not connect. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function clearReflection() {
    if (!confirmClear) {
      setConfirmClear(true)
      setError(null)
      return
    }

    setClearing(true)
    setError(null)
    try {
      const response = await fetch('/api/reflections', { method: 'DELETE' })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(result.error ?? "Context could not clear today's reflection.")
        return
      }
      setReflection(null)
      setInputOpen(true)
      setText('')
      setConfirmClear(false)
    } catch {
      setError('Context could not connect. Please try again.')
    } finally {
      setClearing(false)
    }
  }

  if (reflection && !inputOpen) {
    const nodes = reflection.nodes ?? EMPTY_NODES
    return (
      <section className="rounded-[20px] border border-[#DDD0B8] bg-[#F5EFE6] p-4 animate-fade-up" aria-label="Daily Reflection">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-base font-bold text-warm-900">🌿 Daily Reflection</h2>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setInputOpen(true)
                setText('')
                setConfirmClear(false)
              }}
              className="text-sm font-semibold text-sage-600"
            >
              ✏️ Edit
            </button>
            <button
              type="button"
              onClick={() => {
                setInputOpen(true)
                setText('')
                setConfirmClear(false)
              }}
              className="text-sm font-semibold text-sage-600"
            >
              ＋ Add more
            </button>
          </div>
        </div>
        <p className="font-serif text-[17px] font-medium leading-7 text-warm-900">
          {reflection.ai_summary}
        </p>
        <div className="mt-4 space-y-2">
          <TagRow label="Activities" items={nodes.activities} tagClass="bg-sage-100 text-sage-600" />
          <TagRow label="People" items={nodes.people} tagClass="bg-[#E8F0F8] text-[#2A5080]" />
          <TagRow label="Places" items={nodes.places} tagClass="bg-[#F6ECD7] text-[#7C5616]" />
          <TagRow label="Feelings" items={nodes.feelings} tagClass="bg-[#F5E6F0] text-[#7A2F68]" />
        </div>
        <div className="mt-4 rounded-[14px] border border-cream-300 bg-white/60 p-3">
          {confirmClear ? (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-warm-700">Clear today's reflection?</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="min-h-11 rounded-xl border border-warm-200 text-sm font-semibold text-warm-600"
                  disabled={clearing}
                >
                  Keep it
                </button>
                <button
                  type="button"
                  onClick={clearReflection}
                  className="min-h-11 rounded-xl bg-terracotta-700 text-sm font-semibold text-white disabled:opacity-60"
                  disabled={clearing}
                >
                  {clearing ? 'Clearing...' : 'Clear'}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={clearReflection}
              className="min-h-11 text-sm font-semibold text-terracotta-700 underline underline-offset-4"
              disabled={clearing}
            >
              Clear today's reflection
            </button>
          )}
        </div>
        {error && <p className="mt-2 text-sm font-medium text-terracotta-700">{error}</p>}
      </section>
    )
  }

  return (
    <section className="rounded-[20px] border border-[#DDD0B8] bg-[#F5EFE6] p-4 animate-fade-up" aria-label="Daily Reflection">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="text-base font-bold text-warm-900">🌿 Daily Reflection</h2>
        {!reflection && (
          <span className="rounded-pill bg-sage-600 px-2.5 py-1 text-[11px] font-bold tracking-wide text-white">
            NEW
          </span>
        )}
      </div>
      <p className="mb-3 text-sm font-medium leading-6 text-warm-400">Tell Context about your day.</p>
      {saving ? (
        <p className="py-4 text-sm font-semibold text-sage-600">Saving your reflection...</p>
      ) : (
        <>
          <div className="relative">
            <textarea
              value={text}
              onChange={event => setText(event.target.value)}
              placeholder="Type or speak anything you want Context to remember..."
              rows={3}
              maxLength={2500}
              className="min-h-20 w-full resize-none rounded-[14px] border border-cream-300 bg-white px-4 py-3 pr-12 text-[15px] font-medium leading-6 text-warm-800 placeholder:text-warm-300 focus:outline-none focus:border-sage-500 focus:ring-2 focus:ring-sage-200"
            />
            <WebSpeechMicButton
              value={text}
              onChange={setText}
              onNotice={setNotice}
              className="absolute bottom-3 right-3 flex h-8 w-8 items-center justify-center rounded-full bg-sage-100 text-base"
              activeClassName="bg-terracotta-100"
              ariaLabel="Speak reflection"
            />
          </div>
          {notice && <p className="mt-2 text-xs font-medium text-warm-400">{notice}</p>}
          {error && <p className="mt-2 text-sm font-medium text-terracotta-700">{error}</p>}
          <p className="mt-2 text-xs font-semibold leading-5 text-warm-400">
            💬 Examples: Went to Walmart, had lunch with Sarah, worked on my paper, feeling productive today.
          </p>
          <button
            type="button"
            onClick={saveReflection}
            disabled={saving}
            className="mt-3 min-h-[52px] w-full rounded-[14px] bg-sage-600 text-base font-semibold text-white shadow-card disabled:opacity-60 focus:outline-none focus:ring-4 focus:ring-sage-300/70"
          >
            Save Reflection
          </button>
        </>
      )}
    </section>
  )
}
