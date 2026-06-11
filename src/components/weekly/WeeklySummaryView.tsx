'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ACTIVITY_TILES } from '@/types'
import { getWeeklyEncouragement } from '@/lib/weekly-summary'
import type { WeeklySummaryData, WeeklySummaryRole } from '@/lib/weekly-summary'

interface Props {
  summary: WeeklySummaryData
  role: WeeklySummaryRole
}

const STATUS_COLORS = {
  completed: '#7D9E6E',
  notCompleted: '#E2A63B',
  skipped: '#D9785B',
}

function polarPoint(center: number, radius: number, angle: number) {
  const radians = (angle - 90) * Math.PI / 180
  return {
    x: center + radius * Math.cos(radians),
    y: center + radius * Math.sin(radians),
  }
}

function describeArc(center: number, radius: number, startAngle: number, endAngle: number) {
  const start = polarPoint(center, radius, endAngle)
  const end = polarPoint(center, radius, startAngle)
  const largeArc = endAngle - startAngle > 180 ? 1 : 0
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 0 ${end.x} ${end.y}`
}

function SegmentedRing({ summary }: { summary: WeeklySummaryData }) {
  const radius = 62
  const gapDegrees = 5
  let cursor = 0
  const segments = [
    { value: summary.completed, color: STATUS_COLORS.completed },
    { value: summary.notCompleted, color: STATUS_COLORS.notCompleted },
    { value: summary.skipped, color: STATUS_COLORS.skipped },
  ]

  return (
    <div
      role="img"
      aria-label={`${summary.completed} completed, ${summary.notCompleted} not completed, ${summary.skipped} skipped`}
      className="relative h-40 w-40 shrink-0"
    >
      <svg viewBox="0 0 160 160" className="h-full w-full" aria-hidden="true">
        <circle cx="80" cy="80" r={radius} fill="none" stroke="#F2EDE5" strokeWidth="16" />
        {summary.totalPlanned > 0 && segments.map((segment, index) => {
          if (segment.value === 0) return null
          const sweep = (segment.value / summary.totalPlanned) * 360
          const usableGap = Math.min(gapDegrees, Math.max(sweep / 3, 1))
          const startAngle = cursor + usableGap / 2
          const endAngle = cursor + sweep - usableGap / 2
          cursor += sweep
          return (
            <path
              key={index}
              d={describeArc(80, radius, startAngle, endAngle)}
              fill="none"
              stroke={segment.color}
              strokeWidth="16"
              strokeLinecap="round"
            />
          )
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="font-serif text-4xl font-semibold text-warm-900">{summary.totalPlanned}</span>
        <span className="mt-1 text-xs leading-4 text-warm-500">planned activities</span>
      </div>
    </div>
  )
}

function CompletionRing({ percent }: { percent: number }) {
  const radius = 25
  const circumference = 2 * Math.PI * radius
  const length = Math.max(0, Math.min(100, percent)) / 100 * circumference

  return (
    <div className="relative mx-auto h-16 w-16" aria-hidden="true">
      <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90">
        <circle cx="32" cy="32" r={radius} fill="none" stroke="#E5EFD9" strokeWidth="7" />
        {percent > 0 && (
          <circle
            cx="32"
            cy="32"
            r={radius}
            fill="none"
            stroke={STATUS_COLORS.completed}
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={`${length} ${circumference - length}`}
          />
        )}
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-warm-900">
        {percent}%
      </span>
    </div>
  )
}

function StatCard({
  label,
  value,
  detail,
  icon,
  completionRate,
}: {
  label: string
  value: string
  detail: string
  icon?: string
  completionRate?: number
}) {
  return (
    <div className="min-w-0 rounded-card border border-cream-200 bg-white px-2 py-4 text-center shadow-card">
      <p className="min-h-8 text-xs font-semibold leading-4 text-warm-700">{label}</p>
      <div className="mt-2">
        {completionRate !== undefined ? (
          <CompletionRing percent={completionRate} />
        ) : (
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-cream-100 text-3xl" aria-hidden="true">
            {icon}
          </span>
        )}
      </div>
      {completionRate === undefined && (
        <p className="mt-2 font-serif text-lg font-semibold leading-tight text-warm-900">{value}</p>
      )}
      <p className="mt-2 text-xs leading-4 text-warm-400">{detail}</p>
    </div>
  )
}

const PERIOD_STYLES = {
  Morning: { color: '#F8C85A', icon: '🌤️' },
  Afternoon: { color: '#FFD978', icon: '☀️' },
  Evening: { color: '#BDA8F5', icon: '🌙' },
}

function TimeOfDayChart({ periods }: { periods: WeeklySummaryData['periods'] }) {
  const paths = [
    'M 18 92 Q 43 43 92 30',
    'M 108 27 Q 150 15 192 27',
    'M 208 30 Q 257 43 282 92',
  ]
  const positions = [
    { x: 58, iconY: 98, percentY: 126, labelY: 148, countY: 166 },
    { x: 150, iconY: 68, percentY: 96, labelY: 118, countY: 136 },
    { x: 242, iconY: 98, percentY: 126, labelY: 148, countY: 166 },
  ]

  return (
    <div className="mt-3">
      <svg viewBox="0 0 300 178" className="w-full" aria-hidden="true">
        {periods.map((period, index) => (
          <g key={period.period}>
            <path
              d={paths[index]}
              fill="none"
              stroke={PERIOD_STYLES[period.period].color}
              strokeWidth="12"
              strokeLinecap="round"
            />
            <text
              x={positions[index].x}
              y={positions[index].iconY}
              textAnchor="middle"
              fontSize="22"
            >
              {PERIOD_STYLES[period.period].icon}
            </text>
            <text
              x={positions[index].x}
              y={positions[index].percentY}
              textAnchor="middle"
              fontSize="22"
              fontWeight="700"
              fill="#1E1A14"
            >
              {period.percent}%
            </text>
            <text
              x={positions[index].x}
              y={positions[index].labelY}
              textAnchor="middle"
              fontSize="13"
              fontWeight="500"
              fill="#4F463B"
            >
              {period.period}
            </text>
            <text
              x={positions[index].x}
              y={positions[index].countY}
              textAnchor="middle"
              fontSize="10"
              fill="#887E6E"
            >
              {period.count} {period.count === 1 ? 'activity' : 'activities'}
            </text>
          </g>
        ))}
      </svg>
      <div className="sr-only">
        {periods.map(period => (
          <p key={period.period}>
            {period.period}: {period.percent}%, {period.count} {period.count === 1 ? 'activity' : 'activities'}
          </p>
        ))}
      </div>
    </div>
  )
}

export default function WeeklySummaryView({ summary, role }: Props) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [showAllCategories, setShowAllCategories] = useState(false)
  const homeHref = role === 'care_partner' ? '/care-partner' : '/mci-user'
  const visibleCategories = showAllCategories ? summary.categories : summary.categories.slice(0, 3)

  return (
    <main className="min-h-svh bg-cream-50 pb-10 safe-bottom">
      <header className="border-b border-cream-200 bg-cream-100 safe-top">
        <div className="mx-auto flex max-w-lg items-center gap-3 px-5 py-4">
          <Link
            href={homeHref}
            aria-label="Back to dashboard"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-2xl text-warm-700 shadow-sm
                       focus:outline-none focus-visible:ring-4 focus-visible:ring-sage-200"
          >
            ‹
          </Link>
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-warm-400">
              {role === 'care_partner' ? 'Care Partner View' : 'Your Activity'}
            </p>
            <h1 className="font-serif text-xl font-semibold text-warm-900">Weekly summary</h1>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-lg space-y-5 px-5 pt-5">
        <section aria-labelledby="week-heading">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-sage-100 text-2xl" aria-hidden="true">
              🌿
            </span>
            <div>
              <h2 id="week-heading" className="font-serif text-2xl font-semibold text-warm-900">
                {role === 'care_partner' ? 'The week at a glance' : 'Your week at a glance'}
              </h2>
              <p className="mt-1 text-sm text-warm-400">{summary.dateLabel}</p>
            </div>
          </div>
        </section>

        <section className="card border border-cream-200 p-5" aria-label="Weekly planned activity totals">
          <div className="grid grid-cols-[160px_1fr] items-center gap-4">
            <SegmentedRing summary={summary} />

            <dl className="grid min-w-0 gap-4">
              {[
                ['Completed', summary.completed, STATUS_COLORS.completed],
                ['Not completed', summary.notCompleted, STATUS_COLORS.notCompleted],
                ['Skipped', summary.skipped, STATUS_COLORS.skipped],
              ].map(([label, value, color]) => (
                <div key={String(label)} className="flex items-center gap-3">
                  <span className="h-4 w-4 shrink-0 rounded-full" style={{ backgroundColor: String(color) }} aria-hidden="true" />
                  <dt className="min-w-0 flex-1 text-sm leading-4 text-warm-600">{label}</dt>
                  <dd className="text-base font-semibold text-warm-900">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="rounded-card border border-sage-200 bg-sage-50 p-5">
          <h2 className="text-lg font-semibold text-warm-900">A note about the week</h2>
          <p className="mt-2 text-base leading-7 text-warm-600">{getWeeklyEncouragement(summary, role)}</p>
        </section>

        <section aria-label="Weekly highlights" className="grid grid-cols-3 gap-2">
          <StatCard
            label="Completion rate"
            value={`${summary.completionRate}%`}
            detail={summary.totalPlanned > 0 ? `${summary.completed} of ${summary.totalPlanned} planned` : 'No plans recorded'}
            completionRate={summary.completionRate}
          />
          <StatCard
            label="Most active day"
            value={summary.mostActiveDay ?? 'No activity'}
            detail={summary.mostActiveDay ? `${summary.mostActiveDayCount} completed` : 'Nothing recorded'}
            icon="⭐"
          />
          <StatCard
            label="Days with activity"
            value={`${summary.daysWithActivity} of 7`}
            detail={`${summary.activityCount} total completed`}
            icon="📅"
          />
        </section>

        <section>
          <button
            type="button"
            onClick={() => setDetailsOpen(current => !current)}
            className="flex min-h-14 w-full items-center justify-between gap-4 rounded-xl border border-cream-300 bg-cream-100 px-4 py-3 text-left
                       focus:outline-none focus-visible:ring-4 focus-visible:ring-sage-200"
            aria-expanded={detailsOpen}
            aria-controls="weekly-details"
          >
            <span>
              <span className="block text-base font-semibold text-warm-700">More about this week</span>
              <span className="mt-0.5 block text-sm text-warm-400">Time of day and activity categories</span>
            </span>
            <span className="text-xl text-warm-400" aria-hidden="true">{detailsOpen ? '⌃' : '⌄'}</span>
          </button>

          {detailsOpen && (
            <div id="weekly-details" className="mt-3 space-y-5">
              <section className="card border border-cream-200 p-5" aria-labelledby="time-heading">
                <h2 id="time-heading" className="font-serif text-lg font-semibold text-warm-900">
                  By time of day
                </h2>
                <TimeOfDayChart periods={summary.periods} />
              </section>

              <section className="card border border-cream-200 p-5" aria-labelledby="category-heading">
                <h2 id="category-heading" className="font-serif text-lg font-semibold text-warm-900">
                  Top activity categories
                </h2>
                {visibleCategories.length === 0 ? (
                  <p className="mt-3 text-sm text-warm-400">No completed activity categories were recorded.</p>
                ) : (
                  <div className="mt-4 grid grid-cols-3 gap-3">
                    {visibleCategories.map(item => {
                      const tile = ACTIVITY_TILES.find(candidate => candidate.category === item.category)
                      return (
                        <div key={item.category} className="min-w-0 text-center">
                          <span className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full border text-2xl ${tile?.colorClass ?? 'tile-custom'}`} aria-hidden="true">
                            {tile?.icon ?? '📌'}
                          </span>
                          <p className="mt-2 text-sm font-medium leading-5 text-warm-700">{tile?.label ?? item.category}</p>
                          <p className="mt-1 text-xs leading-4 text-warm-400">{item.count} completed</p>
                        </div>
                      )
                    })}
                  </div>
                )}
                {summary.categories.length > 3 && (
                  <button
                    type="button"
                    onClick={() => setShowAllCategories(current => !current)}
                    className="mt-4 min-h-11 w-full rounded-xl border border-cream-300 px-4 text-sm font-medium text-warm-600"
                    aria-expanded={showAllCategories}
                  >
                    {showAllCategories ? 'Show fewer categories' : 'Show all categories'}
                  </button>
                )}
              </section>
            </div>
          )}
        </section>

        <div className="rounded-xl border border-cream-200 bg-white px-4 py-4">
          <p className="text-sm font-medium text-warm-700">Weekly recap texts</p>
          <p className="mt-1 text-sm leading-5 text-warm-400">
            Context sends a short recap with a private dashboard link on Sunday mornings.
          </p>
        </div>
      </div>
    </main>
  )
}
