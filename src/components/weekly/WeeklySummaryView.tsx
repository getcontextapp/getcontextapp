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
  notCompleted: '#D4B896',
  skipped: '#C47448',
}

function getRingBackground(summary: WeeklySummaryData) {
  if (summary.totalPlanned === 0) return '#EDE9E3'
  const completedEnd = (summary.completed / summary.totalPlanned) * 360
  const notCompletedEnd = completedEnd + (summary.notCompleted / summary.totalPlanned) * 360
  return `conic-gradient(
    ${STATUS_COLORS.completed} 0deg ${completedEnd}deg,
    ${STATUS_COLORS.notCompleted} ${completedEnd}deg ${notCompletedEnd}deg,
    ${STATUS_COLORS.skipped} ${notCompletedEnd}deg 360deg
  )`
}

function StatCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="min-w-0 rounded-card border border-cream-200 bg-white px-3 py-4 text-center shadow-card">
      <p className="text-xs font-medium leading-4 text-warm-500">{label}</p>
      <p className="mt-3 font-serif text-xl font-semibold leading-tight text-warm-900">{value}</p>
      <p className="mt-2 text-xs leading-4 text-warm-400">{detail}</p>
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
          <div className="flex flex-col items-center gap-5 sm:flex-row sm:justify-center sm:gap-8">
            <div
              role="img"
              aria-label={`${summary.completed} completed, ${summary.notCompleted} not completed, ${summary.skipped} skipped`}
              className="relative h-44 w-44 shrink-0 rounded-full"
              style={{ background: getRingBackground(summary) }}
            >
              <div className="absolute inset-[18px] flex flex-col items-center justify-center rounded-full bg-white text-center">
                <span className="font-serif text-4xl font-semibold text-warm-900">{summary.totalPlanned}</span>
                <span className="mt-1 text-sm text-warm-500">planned activities</span>
              </div>
            </div>

            <dl className="grid w-full max-w-xs gap-3">
              {[
                ['Completed', summary.completed, STATUS_COLORS.completed],
                ['Not completed', summary.notCompleted, STATUS_COLORS.notCompleted],
                ['Skipped', summary.skipped, STATUS_COLORS.skipped],
              ].map(([label, value, color]) => (
                <div key={String(label)} className="flex items-center gap-3">
                  <span className="h-4 w-4 shrink-0 rounded-full" style={{ backgroundColor: String(color) }} aria-hidden="true" />
                  <dt className="flex-1 text-base text-warm-600">{label}</dt>
                  <dd className="text-lg font-semibold text-warm-900">{value}</dd>
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
          />
          <StatCard
            label="Most active day"
            value={summary.mostActiveDay ?? 'No activity'}
            detail={summary.mostActiveDay ? `${summary.mostActiveDayCount} completed` : 'Nothing recorded'}
          />
          <StatCard
            label="Days with activity"
            value={`${summary.daysWithActivity} of 7`}
            detail={`${summary.activityCount} total completed`}
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
                  When activities were completed
                </h2>
                <div className="mt-5 grid grid-cols-3 gap-2">
                  {summary.periods.map((period, index) => (
                    <div key={period.period} className="min-w-0 text-center">
                      <div
                        className={`h-3 rounded-pill ${
                          index === 0 ? 'bg-cream-400' : index === 1 ? 'bg-cream-300' : 'bg-sage-300'
                        }`}
                        aria-hidden="true"
                      />
                      <p className="mt-3 text-lg font-semibold text-warm-900">{period.percent}%</p>
                      <p className="text-sm font-medium text-warm-600">{period.period}</p>
                      <p className="mt-1 text-xs text-warm-400">
                        {period.count} {period.count === 1 ? 'activity' : 'activities'}
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="card border border-cream-200 p-5" aria-labelledby="category-heading">
                <h2 id="category-heading" className="font-serif text-lg font-semibold text-warm-900">
                  Top activity categories
                </h2>
                {visibleCategories.length === 0 ? (
                  <p className="mt-3 text-sm text-warm-400">No completed activity categories were recorded.</p>
                ) : (
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    {visibleCategories.map(item => {
                      const tile = ACTIVITY_TILES.find(candidate => candidate.category === item.category)
                      return (
                        <div key={item.category} className="min-w-0 text-center">
                          <span className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full border text-2xl ${tile?.colorClass ?? 'tile-custom'}`} aria-hidden="true">
                            {tile?.icon ?? '📌'}
                          </span>
                          <p className="mt-2 truncate text-sm font-medium text-warm-700">{tile?.label ?? item.category}</p>
                          <p className="mt-1 text-xs text-warm-400">{item.count} completed</p>
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
