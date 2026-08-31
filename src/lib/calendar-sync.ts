import crypto from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase-server'
import { getLocalDateKey, getUtcRangeForLocalDateKey } from '@/lib/dates'
import { getLinkedMciProfile } from '@/lib/household-links'
import type { CalendarConnectionSummary, CalendarEvent, Profile } from '@/types'

export const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'
export const GOOGLE_TASKS_SCOPE = 'https://www.googleapis.com/auth/tasks.readonly'
const GOOGLE_OAUTH_SCOPES = [GOOGLE_CALENDAR_SCOPE, GOOGLE_TASKS_SCOPE].join(' ')
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

type GoogleCalendarListEntry = {
  id: string
  primary?: boolean
  selected?: boolean
  hidden?: boolean
  deleted?: boolean
  summary?: string
  summaryOverride?: string
}

type GoogleCalendarListResponse = {
  items?: GoogleCalendarListEntry[]
  error?: { message?: string }
}

type GoogleTaskList = {
  id: string
  title?: string
}

type GoogleTaskListResponse = {
  items?: GoogleTaskList[]
  error?: { message?: string }
}

type GoogleTask = {
  id: string
  title?: string
  notes?: string
  status?: string
  due?: string
  updated?: string
  deleted?: boolean
  hidden?: boolean
  webViewLink?: string
}

type GoogleTasksResponse = {
  items?: GoogleTask[]
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
  url.searchParams.set('scope', GOOGLE_OAUTH_SCOPES)
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
  // Calendar is part of the pilot baseline. An explicit false still supports a
  // household-level safety rollback, while households without a legacy flag
  // receive the same experience as new participants.
  return data?.enabled ?? true
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

function hasGoogleScope(scope: string | null | undefined, requiredScope: string) {
  return (scope ?? '').split(/\s+/).includes(requiredScope)
}

async function usableGoogleToken(service: SupabaseClient, connectionId: string) {
  const { data: tokenRow, error } = await service
    .from('calendar_connection_tokens')
    .select('*')
    .eq('connection_id', connectionId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  const token = tokenRow as TokenRow | null
  if (!token?.access_token) throw new Error('Calendar token is missing.')

  const expiresAt = token.token_expires_at ? Date.parse(token.token_expires_at) : 0
  if (expiresAt > Date.now() + 2 * 60 * 1000) return { accessToken: token.access_token, scope: token.scope }
  if (!token.refresh_token) return { accessToken: token.access_token, scope: token.scope }

  const refreshed = await refreshGoogleToken(token.refresh_token)
  const scope = refreshed.scope ?? token.scope
  await service
    .from('calendar_connection_tokens')
    .update({
      access_token: refreshed.access_token,
      scope,
      token_expires_at: tokenExpiry(refreshed.expires_in),
      updated_at: new Date().toISOString(),
    })
    .eq('connection_id', connectionId)
  return { accessToken: refreshed.access_token!, scope }
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

function parseGoogleDate(value: { dateTime?: string; date?: string } | undefined, allDay: boolean, timeZone?: string | null) {
  if (!value) return null
  if (value.dateTime) return value.dateTime
  if (value.date && allDay) return getUtcRangeForLocalDateKey(value.date, timeZone ?? 'UTC').start
  return null
}

function providerEventId(source: 'calendar' | 'task', containerId: string, itemId: string) {
  return `${source}:${base64url(containerId)}:${itemId}`
}

function isBirthdayCalendar(calendar: GoogleCalendarListEntry) {
  const label = `${calendar.summary ?? ''} ${calendar.summaryOverride ?? ''} ${calendar.id ?? ''}`.toLowerCase()
  return label.includes('birthday') || label.includes('#contacts@group.v.calendar.google.com')
}

async function googleCalendarList(accessToken: string) {
  const url = new URL('https://www.googleapis.com/calendar/v3/users/me/calendarList')
  url.searchParams.set('minAccessRole', 'reader')
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const result = await response.json() as GoogleCalendarListResponse
  if (!response.ok || result.error) throw new Error(result.error?.message || 'Google calendar list sync failed.')
  const calendars = (result.items ?? [])
    .filter(calendar => calendar.id && !calendar.deleted && !calendar.hidden && (calendar.primary || calendar.selected || isBirthdayCalendar(calendar)))
  if (calendars.length === 0) return [{ id: 'primary', primary: true }]
  return calendars
}

async function googleCalendarEvents(accessToken: string, calendarId: string, window: { start: string; end: string }) {
  const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`)
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
  return result.items ?? []
}

async function googleTaskLists(accessToken: string) {
  const response = await fetch('https://tasks.googleapis.com/tasks/v1/users/@me/lists', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const result = await response.json() as GoogleTaskListResponse
  if (!response.ok || result.error) throw new Error(result.error?.message || 'Google task list sync failed.')
  return (result.items ?? []).filter(list => list.id)
}

async function googleTasksForList(accessToken: string, taskListId: string, window: { start: string; end: string }) {
  const url = new URL(`https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(taskListId)}/tasks`)
  url.searchParams.set('dueMin', window.start)
  url.searchParams.set('dueMax', window.end)
  url.searchParams.set('showCompleted', 'false')
  url.searchParams.set('showDeleted', 'false')
  url.searchParams.set('showHidden', 'false')
  url.searchParams.set('maxResults', '30')

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const result = await response.json() as GoogleTasksResponse
  if (!response.ok || result.error) throw new Error(result.error?.message || 'Google tasks sync failed.')
  return result.items ?? []
}

function parseGoogleTaskDue(task: GoogleTask, ownerProfile: Profile) {
  if (!task.due) return null
  const due = new Date(task.due)
  if (Number.isNaN(due.getTime())) return null
  const dateKey = task.due.slice(0, 10)
  const todayKey = getLocalDateKey(new Date(), ownerProfile.timezone)

  // Google Tasks only exposes the due date through the public API, even when
  // the Calendar app displays a reminder time. Keep tasks as all-day evidence
  // so Context does not invent a time Google did not provide.
  if (dateKey === todayKey) return {
    startsAt: getUtcRangeForLocalDateKey(todayKey, ownerProfile.timezone).start,
    allDay: true,
  }

  return {
    startsAt: `${dateKey}T00:00:00.000Z`,
    allDay: true,
  }
}

async function markMissingCalendarEventsCancelled({
  service,
  connection,
  ownerProfile,
  window,
  activeProviderIds,
}: {
  service: SupabaseClient
  connection: CalendarConnectionSummary
  ownerProfile: Profile
  window: { start: string; end: string }
  activeProviderIds: Set<string>
}) {
  const { data: localEvents, error } = await service
    .from('calendar_events')
    .select('id, provider_event_id')
    .eq('connection_id', connection.id)
    .eq('owner_profile_id', ownerProfile.id)
    .eq('status', 'confirmed')
    .gte('starts_at', window.start)
    .lt('starts_at', window.end)

  if (error) throw new Error(error.message)

  const staleIds = (localEvents ?? [])
    .filter(event => !activeProviderIds.has(event.provider_event_id))
    .map(event => event.id)

  if (staleIds.length === 0) return

  const { error: updateError } = await service
    .from('calendar_events')
    .update({
      status: 'cancelled',
      synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .in('id', staleIds)

  if (updateError) throw new Error(updateError.message)
}

export async function syncGoogleCalendarConnection(ownerProfile: Profile, connection: CalendarConnectionSummary) {
  if (!googleCalendarConfigured()) return
  const service = createServiceClient()
  const token = await usableGoogleToken(service, connection.id)
  const window = dayWindowForProfile(ownerProfile)
  const rows: Array<Record<string, string | boolean | null>> = []
  const activeProviderIds = new Set<string>()

  const calendars = await googleCalendarList(token.accessToken)
  for (const calendar of calendars) {
    const items = await googleCalendarEvents(token.accessToken, calendar.id, window)
    for (const item of items) {
      if (!item.id || item.status === 'cancelled') continue
      const allDay = Boolean(item.start?.date)
      const startsAt = parseGoogleDate(item.start, allDay, ownerProfile.timezone)
      if (!startsAt) continue
      const id = providerEventId('calendar', calendar.id, item.id)
      activeProviderIds.add(id)
      rows.push({
        household_id: ownerProfile.household_id,
        owner_profile_id: ownerProfile.id,
        connection_id: connection.id,
        provider: 'google',
        provider_event_id: id,
        title: (item.summary || 'Calendar event').slice(0, 160),
        description: item.description ?? null,
        location: item.location ?? null,
        starts_at: startsAt,
        ends_at: parseGoogleDate(item.end, allDay, ownerProfile.timezone),
        all_day: allDay,
        status: 'confirmed',
        html_link: item.htmlLink ?? null,
        synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
    }
  }

  if (hasGoogleScope(token.scope, GOOGLE_TASKS_SCOPE)) {
    try {
      const taskLists = await googleTaskLists(token.accessToken)
      for (const taskList of taskLists) {
        const tasks = await googleTasksForList(token.accessToken, taskList.id, window)
        for (const task of tasks) {
          if (!task.id || !task.due || task.deleted || task.hidden || task.status === 'completed') continue
          const parsedDue = parseGoogleTaskDue(task, ownerProfile)
          if (!parsedDue) continue
          const id = providerEventId('task', taskList.id, task.id)
          activeProviderIds.add(id)
          rows.push({
            household_id: ownerProfile.household_id,
            owner_profile_id: ownerProfile.id,
            connection_id: connection.id,
            provider: 'google',
            provider_event_id: id,
            title: (task.title || 'Google task').slice(0, 160),
            description: task.notes ?? null,
            location: null,
            starts_at: parsedDue.startsAt,
            ends_at: null,
            all_day: parsedDue.allDay,
            status: 'confirmed',
            html_link: task.webViewLink ?? null,
            synced_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
        }
      }
    } catch (error) {
      console.error('[Calendar] Google Tasks sync skipped:', error instanceof Error ? error.message : error)
    }
  }

  if (rows.length > 0) {
    const { error } = await service
      .from('calendar_events')
      .upsert(rows, { onConflict: 'connection_id,provider_event_id' })
    if (error) throw new Error(error.message)
  }

  await markMissingCalendarEventsCancelled({
    service,
    connection,
    ownerProfile,
    window,
    activeProviderIds,
  })

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
