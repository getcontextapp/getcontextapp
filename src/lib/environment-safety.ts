export function contextEnvironment() {
  return process.env.CONTEXT_ENV?.trim().toLowerCase() || 'production'
}

function normalizePhone(value: string) {
  const trimmed = value.trim()
  if (trimmed.startsWith('+')) return `+${trimmed.slice(1).replace(/\D/g, '')}`
  const digits = trimmed.replace(/\D/g, '')
  return digits.length === 10 ? `+1${digits}` : `+${digits}`
}

export function isStagingEnvironment() {
  return contextEnvironment() === 'staging'
}

function values(name: string) {
  return (process.env[name] ?? '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
}

export function stagingSmsAllowed(phone: string) {
  if (!isStagingEnvironment()) return true
  const allowed = new Set(values('STAGING_SMS_ALLOWLIST').map(normalizePhone))
  return allowed.has(normalizePhone(phone))
}

export function stagingPushAllowed(userId: string) {
  if (!isStagingEnvironment()) return true
  return new Set(values('STAGING_PUSH_USER_ALLOWLIST')).has(userId)
}
