'use client'
import { useState, useEffect, useRef } from 'react'
import type { ActivityTileConfig, ActivityLog } from '@/types'

interface Props {
  tile: ActivityTileConfig
  onLogged: (activity: ActivityLog) => void
  onClose: () => void
}

export default function ActivityLogModal({ tile, onLogged, onClose }: Props) {
  const [selectedPreset, setSelectedPreset] = useState('')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError(null)

    const res = await fetch('/api/log-activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: tile.category,
        label: tile.label,
        note: note.trim() || selectedPreset || null,
      }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Something went wrong')
      setLoading(false)
      return
    }

    const activity: ActivityLog = await res.json()
    onLogged(activity)
    setLoading(false)
  }

  function handleSuggestion(s: string) {
    setSelectedPreset(s)
    setNote(current => {
      if (!current.trim() || current === selectedPreset) return s
      return current
    })
    inputRef.current?.focus()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-warm-900/30 backdrop-blur-sm animate-fade-in" />

      {/* Sheet */}
      <div className={`${tile.colorClass} border-t-4 relative w-full max-w-lg mx-auto rounded-t-3xl pt-2 pb-8
                       animate-fade-up shadow-float`}
           style={{ borderColor: 'rgba(0,0,0,0.08)' }}>

        {/* Drag handle */}
        <div className="w-10 h-1 bg-warm-300/40 rounded-pill mx-auto mb-4" />

        <div className="px-6 space-y-5">
          {/* Tile header */}
          <div className="flex items-center gap-3">
            <span className="text-3xl">{tile.icon}</span>
            <div>
              <h2 className="font-serif text-xl font-semibold text-warm-900">Confirm {tile.label}</h2>
              <p className="text-warm-500 text-sm">Tap a common option or add a small detail.</p>
            </div>
            <button onClick={onClose} className="ml-auto text-warm-400 hover:text-warm-700 text-2xl leading-none">
              ×
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Quick suggestions */}
            {tile.suggestions.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {tile.suggestions.map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => handleSuggestion(s)}
                    className={`px-3 py-1.5 rounded-pill text-sm border border-black/10 bg-white/60
                                hover:bg-white/90 active:scale-[0.97] transition-all font-medium text-warm-700
                                ${selectedPreset === s ? 'bg-white/90 ring-2 ring-terracotta-300/50' : ''}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            <input
              ref={inputRef}
              type="text"
              value={note}
              onChange={e => {
                setNote(e.target.value)
                if (e.target.value !== selectedPreset) setSelectedPreset('')
              }}
              className="w-full px-4 py-3 rounded-xl border border-black/10 bg-white/50 text-warm-700 text-sm
                         focus:outline-none focus:ring-2 focus:ring-terracotta-300/60 placeholder:text-warm-300"
              placeholder="Add a detail if helpful"
              maxLength={200}
            />

            {error && (
              <p className="text-terracotta-600 text-sm">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl bg-warm-700 text-cream-100 font-medium text-base
                         hover:bg-warm-900 active:scale-[0.98] transition-all
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Saving…' : `Confirm ${tile.label}`}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
