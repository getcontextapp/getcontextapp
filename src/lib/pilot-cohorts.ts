const INTERNAL_PREVIEW_HOUSEHOLDS = new Set([
  'my home',
  'the odu household',
  'baru home',
])

const ANALYTICS_EXCLUDED_HOUSEHOLDS = new Set([
  'go stroh',
  'google oauth review',
])

function normalizedHouseholdName(name: string) {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

export function isHouseholdExcludedFromPilotAnalytics(name: string) {
  return ANALYTICS_EXCLUDED_HOUSEHOLDS.has(normalizedHouseholdName(name))
}

export function cohortForHouseholdName(name: string) {
  if (INTERNAL_PREVIEW_HOUSEHOLDS.has(normalizedHouseholdName(name))) {
    return { cohort: 'internal' as const, prefix: 'I' as const }
  }

  return { cohort: 'pilot-1' as const, prefix: 'P' as const }
}
