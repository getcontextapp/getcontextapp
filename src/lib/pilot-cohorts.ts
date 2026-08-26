const INTERNAL_PREVIEW_HOUSEHOLDS = new Set([
  'my home',
  'the odu household',
  'baru home',
])

function normalizedHouseholdName(name: string) {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

export function cohortForHouseholdName(name: string) {
  if (INTERNAL_PREVIEW_HOUSEHOLDS.has(normalizedHouseholdName(name))) {
    return { cohort: 'internal' as const, prefix: 'I' as const }
  }

  return { cohort: 'pilot-1' as const, prefix: 'P' as const }
}
