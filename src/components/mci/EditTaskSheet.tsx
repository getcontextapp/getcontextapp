'use client'

import { useState } from 'react'
import TaskScheduleFields from './TaskScheduleFields'
import type { ExpectedPeriod, PlannedActivity, RepeatRule } from '@/types'

export default function EditTaskSheet({ task, onSaved, onClose, onDelete }: {
  task: PlannedActivity
  onSaved: (task: PlannedActivity, removedTaskIds?: string[]) => void
  onClose: () => void
  onDelete: (action?: 'delete' | 'remove_today' | 'stop_repeating') => void
}) {
  const [note, setNote] = useState(task.note || task.label)
  const [period, setPeriod] = useState<ExpectedPeriod>(task.expected_period)
  const [time, setTime] = useState<string | null>(task.expected_time)
  const [repeat, setRepeat] = useState<RepeatRule>(task.repeat_rule ?? 'none')
  const [seriesScope, setSeriesScope] = useState<'one' | 'future'>('one')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isRepeatingTask = task.repeat_rule !== 'none'

  async function save() {
    setSaving(true); setError(null)
    const response = await fetch('/api/planned-activities', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: task.id,
        action: 'update',
        note,
        expected_period: period,
        expected_time: time,
        repeat_rule: repeat,
        series_scope: seriesScope,
      }),
    })
    const result = await response.json()
    setSaving(false)
    if (!response.ok) return setError(result.error ?? 'Could not save changes.')
    onSaved(result.plannedActivity, result.deleted_planned_activity_ids ?? [])
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-warm-900/35" role="dialog" aria-modal="true" aria-labelledby="edit-task-title">
      <div className="mx-auto max-h-[92svh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-cream-50 px-5 pb-8 pt-4 shadow-float safe-bottom">
        <div className="mb-4 h-1 w-10 rounded-pill bg-warm-300/40 mx-auto" />
        <h2 id="edit-task-title" className="font-serif text-xl font-semibold text-warm-900">Edit task</h2>
        <label className="mt-4 block text-sm font-medium text-warm-600" htmlFor="edit-task-name">Task name</label>
        <input id="edit-task-name" value={note} onChange={event => setNote(event.target.value)} maxLength={160}
          className="mb-5 mt-2 min-h-12 w-full rounded-xl border border-cream-300 bg-white px-4 text-base text-warm-800" />
        <TaskScheduleFields period={period} time={time} repeat={repeat} onPeriod={setPeriod} onTime={setTime} onRepeat={setRepeat} />
        {isRepeatingTask && (
          <fieldset className="mt-5">
            <legend className="text-sm font-medium text-warm-600">Apply changes to</legend>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {[
                ['one', 'This task only'],
                ['future', 'This and future'],
              ].map(([value, label]) => (
                <button key={value} type="button" onClick={() => setSeriesScope(value as 'one' | 'future')}
                  className={`min-h-12 rounded-xl border px-2 text-sm font-medium ${seriesScope === value ? 'border-warm-700 bg-warm-700 text-cream-50' : 'border-cream-300 bg-white text-warm-600'}`}>
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
        )}
        {error && <p className="mt-3 text-sm text-terracotta-700">{error}</p>}
        <button onClick={save} disabled={saving || !note.trim()} className="mt-5 min-h-12 w-full rounded-xl bg-warm-700 text-base font-medium text-cream-50 disabled:opacity-50">
          {saving ? 'Saving...' : 'Save changes'}
        </button>
        <button onClick={onClose} className="mt-2 min-h-11 w-full text-sm font-medium text-warm-500">Cancel</button>
        {isRepeatingTask ? (
          <div className="mt-4 grid grid-cols-1 gap-2 border-t border-cream-200 pt-4">
            <button onClick={() => onDelete('remove_today')} className="min-h-11 w-full rounded-xl border border-cream-300 bg-white text-sm font-medium text-warm-700">
              Remove from today
            </button>
            <button onClick={() => onDelete('stop_repeating')} className="min-h-11 w-full text-sm font-medium text-terracotta-700">
              Stop repeating
            </button>
          </div>
        ) : (
          <button onClick={() => onDelete('delete')} className="mt-4 min-h-11 w-full border-t border-cream-200 pt-4 text-sm font-medium text-terracotta-700">
            Delete task
          </button>
        )}
      </div>
    </div>
  )
}
