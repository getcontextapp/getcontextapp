'use client'

import { useId } from 'react'
import { REPEAT_LABELS } from '@/lib/task-scheduling'
import type { ExpectedPeriod, RepeatRule } from '@/types'

const PERIODS: Array<{ value: ExpectedPeriod; label: string }> = [
  { value: 'anytime', label: 'Anytime' },
  { value: 'morning', label: 'Morning' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'evening', label: 'Evening' },
]
const TIMES = ['08:00', '10:00', '12:00', '15:00', '18:00']

export default function TaskScheduleFields({
  period,
  time,
  repeat,
  onPeriod,
  onTime,
  onRepeat,
}: {
  period: ExpectedPeriod
  time: string | null
  repeat: RepeatRule
  onPeriod: (value: ExpectedPeriod) => void
  onTime: (value: string | null) => void
  onRepeat: (value: RepeatRule) => void
}) {
  const repeatId = useId()

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-sm font-medium text-warm-600">When?</p>
        <div className="grid grid-cols-4 gap-1.5">
          {PERIODS.map(item => (
            <button key={item.value} type="button" onClick={() => { onPeriod(item.value); onTime(null) }}
              className={`min-h-11 rounded-xl border px-1 text-xs font-medium ${!time && period === item.value ? 'border-warm-700 bg-warm-700 text-cream-50' : 'border-cream-300 bg-white text-warm-600'}`}>
              {item.label}
            </button>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-5 gap-1.5">
          {TIMES.map(value => {
            const label = new Date(`2000-01-01T${value}:00`).toLocaleTimeString('en-US', { hour: 'numeric', hour12: true })
            return (
              <button key={value} type="button" onClick={() => onTime(value)}
                className={`min-h-10 rounded-lg border px-1 text-xs font-medium ${time === value ? 'border-sage-500 bg-sage-100 text-warm-800' : 'border-cream-300 bg-white text-warm-500'}`}>
                {label}
              </button>
            )
          })}
        </div>
        <label className="mt-2 flex min-h-11 items-center justify-between rounded-xl border border-cream-300 bg-white px-3 text-sm text-warm-600">
          <span>More times</span>
          <input type="time" value={time ?? ''} onChange={event => onTime(event.target.value || null)}
            className="bg-transparent text-base font-medium text-warm-800" />
        </label>
      </div>
      <div>
        <label className="text-sm font-medium text-warm-600" htmlFor={repeatId}>Repeat</label>
        <select id={repeatId} value={repeat} onChange={event => onRepeat(event.target.value as RepeatRule)}
          className="mt-2 min-h-12 w-full rounded-xl border border-cream-300 bg-white px-3 text-base text-warm-700">
          {(Object.entries(REPEAT_LABELS) as Array<[RepeatRule, string]>).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>
    </div>
  )
}
