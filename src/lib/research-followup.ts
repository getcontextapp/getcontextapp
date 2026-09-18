export const RESEARCH_FOLLOWUP_DAYS = [2, 5, 10, 14] as const

export function isResearchFollowupDay(day: number) {
  return (RESEARCH_FOLLOWUP_DAYS as readonly number[]).includes(day)
}

export function firstName(displayName: string) {
  return displayName.trim().split(/\s+/)[0] || 'there'
}

export function chooseResearchFollowupRecipient<T extends { role: string }>(profiles: T[]) {
  return profiles.find(profile => profile.role === 'care_partner')
    ?? profiles.find(profile => profile.role === 'mci_user')
    ?? null
}

export function researchStudyDay(onboardingAt: string | Date, now: string | Date = new Date()) {
  const start = new Date(onboardingAt)
  const end = new Date(now)
  start.setUTCHours(0, 0, 0, 0)
  end.setUTCHours(0, 0, 0, 0)
  return Math.max(1, Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1)
}

export function buildResearchFollowupMessage(recipientName: string, day: number) {
  return `Hi ${firstName(recipientName)}, this is Ibrahim from the Context memory-support app research team. You’ve reached Day ${day} of the pilot, and I’d like to briefly check how things are going. Would you be available for a quick text chat or short phone call at a convenient time today? Reply with what works best for you.`
}

export function buildSmsComposeHref(phone: string, message: string, appleDevice: boolean) {
  const separator = appleDevice ? '&' : '?'
  return `sms:${phone}${separator}body=${encodeURIComponent(message)}`
}
