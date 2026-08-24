'use client'

import type { Reflection, ReflectionNodes } from '@/types'

const EMPTY_NODES: ReflectionNodes = {
  activities: [],
  people: [],
  places: [],
  feelings: [],
}

function possessiveName(name: string) {
  return name.endsWith('s') ? `${name}'` : `${name}'s`
}

function reflectionForReader(summary: string | null | undefined, ownerName?: string | null) {
  if (!summary) return ''
  const name = ownerName?.trim()
  if (!name) return summary

  return summary
    .replace(/\bYou\b/g, name)
    .replace(/\byou\b/g, name)
    .replace(/\bYour\b/g, possessiveName(name))
    .replace(/\byour\b/g, possessiveName(name))
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

export default function ReadOnlyDailyReflection({
  reflection,
  ownerName,
}: {
  reflection: Reflection | null
  ownerName?: string | null
}) {
  if (!reflection) return null

  const nodes = reflection.nodes ?? EMPTY_NODES
  const summary = reflectionForReader(reflection.ai_summary, ownerName)

  return (
    <section className="rounded-[20px] border border-[#DDD0B8] bg-[#F5EFE6] p-4 animate-fade-up" aria-label="Daily Reflection">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-bold text-warm-900">🌿 Daily Reflection</h2>
        <span className="rounded-pill bg-white/70 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-warm-500">
          Read only
        </span>
      </div>
      <p className="font-serif text-[17px] font-medium leading-7 text-warm-900">
        {summary}
      </p>
      <div className="mt-4 space-y-2">
        <TagRow label="Activities" items={nodes.activities} tagClass="bg-sage-100 text-sage-600" />
        <TagRow label="People" items={nodes.people} tagClass="bg-[#E8F0F8] text-[#2A5080]" />
        <TagRow label="Places" items={nodes.places} tagClass="bg-[#F6ECD7] text-[#7C5616]" />
        <TagRow label="Feelings" items={nodes.feelings} tagClass="bg-[#F5E6F0] text-[#7A2F68]" />
      </div>
    </section>
  )
}
