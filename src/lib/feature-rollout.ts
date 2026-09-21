import { cohortForHouseholdName } from '@/lib/pilot-cohorts'

// A participant reaches the post-trial rollout on study day 15. We use the
// earliest household/member creation timestamp as the onboarding proxy, which
// matches the study-day calculation used by the analytics dashboard.
export function hasCompletedInitialTrial(onboardingAt: string | Date, now = new Date()) {
  const started = new Date(onboardingAt).getTime()
  if (!Number.isFinite(started)) return false
  return now.getTime() - started >= 14 * 24 * 60 * 60 * 1000
}

export function latestFeatureRolloutEnabled(
  householdName: string,
  onboardingAt: string | Date,
  now = new Date(),
) {
  return cohortForHouseholdName(householdName).cohort === 'internal' || hasCompletedInitialTrial(onboardingAt, now)
}
