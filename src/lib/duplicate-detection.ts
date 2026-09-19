export type DuplicateCandidate = {
  id: string
  title: string
  source: 'Context' | 'Google Calendar'
  planned_for: string
  expected_time: string | null
}

export function normalizeDuplicateTitle(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ')
}

function similarity(left: string, right: string) {
  const a = new Set(normalizeDuplicateTitle(left).split(' ').filter(word => word.length > 2))
  const b = new Set(normalizeDuplicateTitle(right).split(' ').filter(word => word.length > 2))
  if (!a.size || !b.size) return 0
  const intersection = [...a].filter(word => b.has(word)).length
  return intersection / new Set([...a, ...b]).size
}

export function isLikelyDuplicate(input: { title: string; planned_for: string; expected_time: string | null }, candidate: DuplicateCandidate) {
  if (input.planned_for !== candidate.planned_for) return false
  const left = normalizeDuplicateTitle(input.title)
  const right = normalizeDuplicateTitle(candidate.title)
  const titleMatches = left === right || similarity(left, right) >= 0.6
  if (!titleMatches) return false
  // If either side is untimed, warn rather than silently creating a second
  // same-day item. The user can still explicitly keep both.
  if (!input.expected_time || !candidate.expected_time) return true
  return input.expected_time.slice(0, 5) === candidate.expected_time.slice(0, 5)
}
