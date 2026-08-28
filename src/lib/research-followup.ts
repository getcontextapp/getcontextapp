export const RESEARCH_FOLLOWUP_DAYS = [2, 5, 10, 14] as const

export function isResearchFollowupDay(day: number) {
  return (RESEARCH_FOLLOWUP_DAYS as readonly number[]).includes(day)
}

export function firstName(displayName: string) {
  return displayName.trim().split(/\s+/)[0] || 'there'
}

export function researchStudyDay(onboardingAt: string | Date, now: string | Date = new Date()) {
  const start = new Date(onboardingAt)
  const end = new Date(now)
  start.setUTCHours(0, 0, 0, 0)
  end.setUTCHours(0, 0, 0, 0)
  return Math.max(1, Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1)
}

export function buildResearchFollowupMessage(carePartnerName: string, day: number) {
  return `Hi ${firstName(carePartnerName)}, this is Ibrahim from the Context memory-support app research team. You’ve reached Day ${day} of the pilot, and I’d like to briefly check how things are going. Would you be available for a quick text chat or short phone call at a convenient time today? Reply with what works best for you.`
}
