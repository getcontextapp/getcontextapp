import crypto from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase-server'
import { getLocalDateKey, getUtcRangeForLocalDateKey } from '@/lib/dates'
import { getLinkedMciProfile } from '@/lib/household-links'
import type { CalendarConnectionSummary, CalendarEvent, Profile } from '@/types'

export const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'
const STATE_MAX_AGE_MS = 15 * 60 * 1000

type CalendarState = {
  ownerProfileId: string
  connectedByProfileId: string
  householdId: string
  returnTo: '/mci-user' | '/care-partner'
  issuedAt: number
  nonce: string
}

type TokenRow = {
  connection_id: string
  access_token: string | null
  refresh_token: string | null
  scope: string | null
  token_expires_at: string | null
}

type GoogleTokenResponse = {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  scope?: string
  token_type?: string
  error?: string
  error_description?: string
}

type GoogleEvent = {
  id: string
  status?: string
  summary?: string
  description?: string
  location?: string
  htmlLink?: string
  start?: { dateTime?: string; date?: string; timeZone?: string }
  end?: { dateTime?: string; date?: string; timeZone?: string }
}

type GoogleEventsResponse = {
  items?: GoogleEvent[]
  error?: { message?: string }
}

export type CalendarDashboardData = {
  enabled: boolean
  connection: CalendarConnectionSummary | null
  events: CalendarEvent[]
}

function base64url(value: string | Buffer) {
  return Buffer.from(value).toString('base64url')
}

function stateSecret() {
  return process.env.CALENDAR_OAUTH_STATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'local-calendar-state'
}

function signState(payload: string) {
  return crypto.createHmac('sha256', stateSecret()).update(payload).digest('base64url')
}

export function createCalendarOAuthState(input: Omit<CalendarState, 'issuedAt' | 'nonce'>) {
  const payload = base64url(JSON.stringify({
    ...input,
    issuedAt: Date.now(),
    nonce: crypto.randomBytes(12).toString('hex'),
  }))
  return `${payload}.${signState(payload)}`
}

export function verifyCalendarOAuthState(state: string): CalendarState | null {
  const [payload, signature] = state.split('.')
  if (!payload || !signature) return null
  const expected = signState(payload)
  const actualBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expected)
  if (actualBuffer.length !== expectedBuffer.length) return null
  if (!crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return null
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as CalendarState
    if (!parsed.issuedAt || Date.now() - parsed.issuedAt > STATE_MAX_AGE_MS) return null
    return parsed
  } catch {
    return null
  }
}

export function googleCalendarConfigured() {
  return Boolean(process.env.GOOGLE_CALENDAR_CLIENT_ID && process.env.GOOGLE_CALENDAR_CLIENT_SECRET)
}

export function googleAuthUrl({ state, redirectUri }: { state: string; redirectUri: string }) {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', process.env.GOOGLE_CALENDAR_CLIENT_ID!)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', GOOGLE_CALENDAR_SCOPE)
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'consent')
  url.searchParams.set('include_granted_scopes', 'true')
  url.searchParams.set('state', state)
  return url.toString()
}

function isMissingTableError(error: { code?: string; message?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? ''
  return error?.code === '42P01' ||
    error?.code === 'PGRST205' ||
    error?.code === 'PGRST204' ||
    message.includes('does not exist') ||
    message.includes('could not find the table')
}

export async function isCalendarEnabledForHousehold(supabase: SupabaseClient, householdId: string | null) {
  if (!householdId) return false
  if (process.env.NEXT_PUBLIC_CALENDAR_SYNC_ENABLED === 'true') return true
  const { data, error } = await supabase
    .from('household_feature_flags')
    .select('enabled')
    .eq('household_id', householdId)
    .eq('feature_key', 'calendar_sync')
    .maybeSingle()
  if (isMissingTableError(error)) return false
  if (error) {
    console.error('[Calendar] Feature flag lookup failed:', error.message)
    return false
  }
  return Boolean(data?.enabled)
}

export async function resolveCalendarOwnerProfile(
  supabase: SupabaseClient,
  currentProfile: Profile,
  ownerProfileId?: string | null,
) {
  if (currentProfile.role === 'mci_user') return currentProfile
  const linked = await getLinkedMciProfile(supabase, currentProfile.household_id, currentProfile.id)
  if (!linked) return null
  if (ownerProfileId && ownerProfileId !== linked.id) return null
  return linked
}

function dayWindowForProfile(profile: Profile) {
  const todayKey = getLocalDateKey(new Date(), profile.timezone)
  const tomorrowDate = new Date(`${todayKey}T12:00:00.000Z`)
  tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 2)
  const endKey = tomorrowDate.toISOString().slice(0, 10)
  return {
    start: getUtcRangeForLocalDateKey(todayKey, profile.timezone).start,
    end: getUtcRangeForLocalDateKey(endKey, profile.timezone).start,
  }
}

async function exchangeCodeForTokens(code: string, redirectUri: string) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })
  const result = await response.json() as GoogleTokenResponse
  if (!response.ok || result.error || !result.access_token) {
    throw new Error(result.error_description || result.error || 'Google did not return a calendar token.')
  }
  return result
}

async function refreshGoogleToken(refreshToken: string) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  const result = await response.json() as GoogleTokenResponse
  if (!response.ok || result.error || !result.access_token) {
    throw new Error(result.error_description || result.error || 'Google calendar token refresh failed.')
  }
  return result
}

async function googleAccountEmail(accessToken: string) {
  const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) return null
  const result = await response.json().catch(() => ({})) as { email?: string }
  return result.email ?? null
}

function tokenExpiry(expiresInSeconds?: number) {
  const seconds = Math.max(60, expiresInSeconds ?? 3600)
  return new Date(Date.now() + seconds * 1000).toISOString()
}

async function usableAccessToken(service: SupabaseClient, connectionId: string) {
  const { data: tokenRow, error } = await service
    .from('calendar_connection_tokens')
    .select('*')
    .eq('connection_id', connectionId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  const token = tokenRow as TokenRow | null
  if (!token?.access_token) throw new Error('Calendar token is missing.')

  const expiresAt = token.token_expires_at ? Date.parse(token.token_expires_at) : 0
  if (expiresAt > Date.now() + 2 * 60 * 1000) return token.access_token
  if (!token.refresh_token) return token.access_token

  const refreshed = await refreshGoogleToken(token.refresh_token)
  await service
    .from('calendar_connection_tokens')
    .update({
      access_token: refreshed.access_token,
      scope: refreshed.scope ?? token.scope,
      token_expires_at: tokenExpiry(refreshed.expires_in),
      updated_at: new Date().toISOString(),
    })
    .eq('connection_id', connectionId)
  return refreshed.access_token!
}

export async function saveGoogleCalendarConnection({
  ownerProfile,
  connectedByProfile,
  code,
  redirectUri,
}: {
  ownerProfile: Profile
  connectedByProfile: Profile
  code: string
  redirectUri: string
}) {
  if (!ownerProfile.household_id) throw new Error('No household linked.')
  const service = createServiceClient()
  const tokens = await exchangeCodeForTokens(code, redirectUri)
  const accountEmail = await googleAccountEmail(tokens.access_token!)

  const { data: existing } = await service
    .from('calendar_connections')
    .select('id')
    .eq('owner_profile_id', ownerProfile.id)
    .eq('provider', 'google')
    .maybeSingle()

  const connectionValues = {
    household_id: ownerProfile.household_id,
    owner_profile_id: ownerProfile.id,
    connected_by_profile_id: connectedByProfile.id,
    provider: 'google',
    provider_account_email: accountEmail,
    status: 'active',
    updated_at: new Date().toISOString(),
  }

  const { data: connection, error: connectionError } = existing?.id
    ? await service
      .from('calendar_connections')
      .update(connectionValues)
      .eq('id', existing.id)
      .select('*')
      .single()
    : await service
      .from('calendar_connections')
      .insert(connectionValues)
      .select('*')
      .single()

  if (connectionError || !connection) throw new Error(connectionError?.message ?? 'Could not save calendar connection.')

  const currentRefreshToken = existing?.id
    ? ((await service
      .from('calendar_connection_tokens')
      .select('refresh_token')
      .eq('connection_id', existing.id)
      .maybeSingle()).data as { refresh_token?: string | null } | null)?.refresh_token
    : null

  const { error: tokenError } = await service
    .from('calendar_connection_tokens')
    .upsert({
      connection_id: connection.id,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? currentRefreshToken,
      scope: tokens.scope ?? GOOGLE_CALENDAR_SCOPE,
      token_expires_at: tokenExpiry(tokens.expires_in),
      updated_at: new Date().toISOString(),
    })

  if (tokenError) throw new Error(tokenError.message)
  await syncGoogleCalendarConnection(ownerProfile, connection as CalendarConnectionSummary)
  return connection as CalendarConnectionSummary
}

function parseGoogleDate(value: { dateTime?: string; date?: string } | undefined, allDay: boolean) {
  if (!value) return null
  if (value.dateTime) return value.dateTime
  if (value.date && allDay) return `${value.date}T00:00:00.000Z`
  return null
}

export async function syncGoogleCalendarConnection(ownerProfile: Profile, connection: CalendarConnectionSummary) {
  if (!googleCalendarConfigured()) return
  const service = createServiceClient()
  const accessToken = await usableAccessToken(service, connection.id)
  const window = dayWindowForProfile(ownerProfile)
  const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events')
  url.searchParams.set('timeMin', window.start)
  url.searchParams.set('timeMax', window.end)
  url.searchParams.set('singleEvents', 'true')
  url.searchParams.set('orderBy', 'startTime')
  url.searchParams.set('maxResults', '30')

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const result = await response.json() as GoogleEventsResponse
  if (!response.ok || result.error) throw new Error(result.error?.message || 'Google calendar sync failed.')

  const rows = (result.items ?? [])
    .filter(item => item.id && item.status !== 'cancelled')
    .map(item => {
      const allDay = Boolean(item.start?.date)
      return {
        household_id: ownerProfile.household_id,
        owner_profile_id: ownerProfile.id,
        connection_id: connection.id,
        provider: 'google',
        provider_event_id: item.id,
        title: (item.summary || 'Calendar event').slice(0, 160),
        description: item.description ?? null,
        location: item.location ?? null,
        starts_at: parseGoogleDate(item.start, allDay),
        ends_at: parseGoogleDate(item.end, allDay),
        all_day: allDay,
        status: 'confirmed',
        html_link: item.htmlLink ?? null,
        synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
    })
    .filter(row => row.starts_at)

  if (rows.length > 0) {
    const { error } = await service
      .from('calendar_events')
      .upsert(rows, { onConflict: 'connection_id,provider_event_id' })
    if (error) throw new Error(error.message)
  }

  await service
    .from('calendar_connections')
    .update({ last_synced_at: new Date().toISOString(), status: 'active', updated_at: new Date().toISOString() })
    .eq('id', connection.id)
}

export async function getCalendarDashboardData(
  supabase: SupabaseClient,
  ownerProfile: Profile | null,
): Promise<CalendarDashboardData> {
  if (!ownerProfile?.household_id) return { enabled: false, connection: null, events: [] }
  const enabled = await isCalendarEnabledForHousehold(supabase, ownerProfile.household_id)
  if (!enabled) return { enabled: false, connection: null, events: [] }

  const { data: connection, error: connectionError } = await supabase
    .from('calendar_connections')
    .select('*')
    .eq('owner_profile_id', ownerProfile.id)
    .eq('provider', 'google')
    .eq('status', 'active')
    .maybeSingle()

  if (isMissingTableError(connectionError)) return { enabled: false, connection: null, events: [] }
  if (connectionError) {
    console.error('[Calendar] Connection lookup failed:', connectionError.message)
    return { enabled, connection: null, events: [] }
  }

  if (connection && googleCalendarConfigured()) {
    try {
      await syncGoogleCalendarConnection(ownerProfile, connection as CalendarConnectionSummary)
    } catch (error) {
      console.error('[Calendar] Sync failed:', error instanceof Error ? error.message : error)
    }
  }

  const window = dayWindowForProfile(ownerProfile)
  const { data: events, error: eventError } = await supabase
    .from('calendar_events')
    .select('*')
    .eq('owner_profile_id', ownerProfile.id)
    .eq('status', 'confirmed')
    .gte('starts_at', window.start)
    .lt('starts_at', window.end)
    .order('starts_at', { ascending: true })
    .limit(12)

  if (isMissingTableError(eventError)) return { enabled: false, connection: null, events: [] }
  if (eventError) {
    console.error('[Calendar] Event lookup failed:', eventError.message)
  }

  return {
    enabled,
    connection: (connection as CalendarConnectionSummary | null) ?? null,
    events: ((events ?? []) as CalendarEvent[]).filter(event => !event.hidden_at),
  }
}
