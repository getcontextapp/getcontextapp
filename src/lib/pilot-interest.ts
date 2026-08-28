export const PILOT_INTEREST_ROLES = [
  'person_with_memory_changes',
  'care_partner',
  'clinician',
] as const

export type PilotInterestRole = typeof PILOT_INTEREST_ROLES[number]

export type PilotInterestSubmission = {
  name: string
  email: string
  phone: string | null
  role: PilotInterestRole
  source: string
}

export type PilotInterestRow = PilotInterestSubmission & {
  id: string
  user_agent: string | null
  created_at: string
}

const ROLE_SET = new Set<string>(PILOT_INTEREST_ROLES)

export const PILOT_INTEREST_ROLE_LABELS: Record<PilotInterestRole, string> = {
  person_with_memory_changes: 'Person with memory changes',
  care_partner: 'Care partner',
  clinician: 'Clinician or program staff',
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function isEmail(value: string) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)
}

export function parsePilotInterestSubmission(body: Record<string, unknown>):
  | { ok: true; submission: PilotInterestSubmission }
  | { ok: false } {
  const name = cleanText(body.name, 120)
  const email = cleanText(body.email, 180).toLowerCase()
  const phone = cleanText(body.phone, 60)
  const role = cleanText(body.role, 80)

  if (!name || !isEmail(email) || !ROLE_SET.has(role)) return { ok: false }

  return {
    ok: true,
    submission: {
      name,
      email,
      phone: phone || null,
      role: role as PilotInterestRole,
      source: cleanText(body.source, 80) || 'landing_home',
    },
  }
}
