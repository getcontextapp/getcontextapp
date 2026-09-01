import { createClient } from '@supabase/supabase-js'

const DEMO_EMAILS = {
  solo: 'solo.demo@getcontextapp.com',
  shared: 'shared.demo@getcontextapp.com',
  cp: 'cp.demo@getcontextapp.com',
}
const DEMO_HOUSEHOLDS = ['Demo Solo Home', 'Demo Shared Home']

function required(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required.`)
  return value
}

function assertStaging() {
  if (process.env.CONTEXT_ENV?.trim().toLowerCase() !== 'staging') {
    throw new Error('Refusing to modify data: CONTEXT_ENV must be staging.')
  }
  const url = required('NEXT_PUBLIC_SUPABASE_URL')
  const expectedRef = required('STAGING_PROJECT_REF')
  if (!url.includes(expectedRef)) {
    throw new Error('Refusing to modify data: Supabase URL does not match STAGING_PROJECT_REF.')
  }
  return url
}

async function listDemoUsers(client) {
  const wanted = new Set(Object.values(DEMO_EMAILS))
  const found = []
  for (let page = 1; page <= 10 && found.length < wanted.size; page++) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 100 })
    if (error) throw error
    for (const user of data.users) {
      if (wanted.has((user.email ?? '').toLowerCase())) found.push(user)
    }
    if (data.users.length < 100) break
  }
  return found
}

async function reset(client) {
  const { error: householdError } = await client
    .from('households')
    .delete()
    .in('name', DEMO_HOUSEHOLDS)
  if (householdError) throw householdError

  for (const user of await listDemoUsers(client)) {
    const { error } = await client.auth.admin.deleteUser(user.id)
    if (error) throw error
  }
}

async function createDemoUser(client, email, password) {
  const { data, error } = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error || !data.user) throw error ?? new Error(`Could not create ${email}.`)
  return data.user
}

function localDate(offset = 0) {
  const value = new Date()
  value.setDate(value.getDate() + offset)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(value)
}

function atLocalTime(hour, minute = 0, offset = 0) {
  const [year, month, day] = localDate(offset).split('-').map(Number)
  const utc = new Date(Date.UTC(year, month - 1, day, hour + 4, minute))
  return utc.toISOString()
}

async function seed(client) {
  const password = required('STAGING_DEMO_PASSWORD')
  await reset(client)

  const [soloUser, sharedUser, cpUser] = await Promise.all([
    createDemoUser(client, DEMO_EMAILS.solo, password),
    createDemoUser(client, DEMO_EMAILS.shared, password),
    createDemoUser(client, DEMO_EMAILS.cp, password),
  ])

  const { data: households, error: householdError } = await client
    .from('households')
    .insert(DEMO_HOUSEHOLDS.map(name => ({ name })))
    .select('id,name')
  if (householdError) throw householdError
  const soloHome = households.find(item => item.name === DEMO_HOUSEHOLDS[0])
  const sharedHome = households.find(item => item.name === DEMO_HOUSEHOLDS[1])
  if (!soloHome || !sharedHome) throw new Error('Could not create demo households.')

  const testPhone = process.env.STAGING_TEST_PHONE?.trim() || null
  const { data: profiles, error: profileError } = await client.from('profiles').insert([
    { user_id: soloUser.id, role: 'mci_user', display_name: 'Demo Solo', phone_e164: testPhone, household_id: soloHome.id },
    { user_id: sharedUser.id, role: 'mci_user', display_name: 'Demo Participant', household_id: sharedHome.id },
    { user_id: cpUser.id, role: 'care_partner', display_name: 'Demo Care Partner', household_id: sharedHome.id },
  ]).select('id,user_id,household_id,role')
  if (profileError) throw profileError

  const soloProfile = profiles.find(item => item.user_id === soloUser.id)
  const sharedProfile = profiles.find(item => item.user_id === sharedUser.id)
  const cpProfile = profiles.find(item => item.user_id === cpUser.id)
  if (!soloProfile || !sharedProfile || !cpProfile) throw new Error('Could not create demo profiles.')

  const flags = [
    { household_id: soloHome.id, feature_key: 'pilot_preview', enabled: true },
    { household_id: soloHome.id, feature_key: 'calendar_sync', enabled: true },
    { household_id: soloHome.id, feature_key: 'solo_account', enabled: true },
    { household_id: sharedHome.id, feature_key: 'pilot_preview', enabled: true },
    { household_id: sharedHome.id, feature_key: 'calendar_sync', enabled: true },
    { household_id: sharedHome.id, feature_key: 'solo_account', enabled: false },
  ]
  const { error: flagError } = await client.from('household_feature_flags').insert(flags)
  if (flagError) throw flagError

  const plans = [
    { household_id: soloHome.id, created_by: soloProfile.id, assigned_to: soloProfile.id, category: 'health', label: 'Morning medication', note: 'Take with breakfast', expected_period: 'morning', expected_time: '09:00', planned_for: localDate() },
    { household_id: soloHome.id, created_by: soloProfile.id, assigned_to: soloProfile.id, category: 'errand', label: 'Pick up groceries', note: 'Milk, fruit, and bread', expected_period: 'afternoon', expected_time: '14:00', planned_for: localDate() },
    { household_id: sharedHome.id, created_by: cpProfile.id, assigned_to: sharedProfile.id, category: 'appointment', label: 'Memory clinic appointment', note: 'Bring the medication list', expected_period: 'morning', expected_time: '10:30', planned_for: localDate(1) },
  ]
  const { error: planError } = await client.from('planned_activities').insert(plans)
  if (planError) throw planError

  const { error: activityError } = await client.from('activity_logs').insert([
    { household_id: soloHome.id, logged_by: soloProfile.id, category: 'meal', label: 'Had breakfast', note: 'Oatmeal and tea', occurred_at: atLocalTime(8, 15) },
    { household_id: sharedHome.id, logged_by: sharedProfile.id, category: 'social', label: 'Called my daughter', occurred_at: atLocalTime(9, 30) },
  ])
  if (activityError) throw activityError

  const { data: connection, error: connectionError } = await client.from('calendar_connections').insert({
    household_id: soloHome.id,
    owner_profile_id: soloProfile.id,
    connected_by_profile_id: soloProfile.id,
    provider: 'google',
    provider_account_email: 'demo-calendar@getcontextapp.com',
    status: 'active',
    last_synced_at: new Date().toISOString(),
  }).select('id').single()
  if (connectionError) throw connectionError

  const { error: calendarError } = await client.from('calendar_events').insert({
    household_id: soloHome.id,
    owner_profile_id: soloProfile.id,
    connection_id: connection.id,
    provider: 'google',
    provider_event_id: 'staging-demo-memory-clinic',
    title: 'Demo memory clinic appointment',
    description: 'Sample calendar data for staging QA.',
    location: 'Community Health Center',
    starts_at: atLocalTime(10, 30, 1),
    ends_at: atLocalTime(11, 30, 1),
  })
  if (calendarError) throw calendarError

  const preferences = profiles.map(profile => ({
    profile_id: profile.id,
    user_id: profile.user_id,
    household_id: profile.household_id,
    push_enabled: false,
    sms_enabled: profile.user_id === soloUser.id && Boolean(testPhone),
    detailed_content: true,
  }))
  const { error: preferenceError } = await client.from('notification_preferences').insert(preferences)
  if (preferenceError) throw preferenceError

  return {
    accounts: DEMO_EMAILS,
    pushAllowlist: [soloUser.id, sharedUser.id, cpUser.id].join(','),
    smsTestPhone: testPhone,
  }
}

const url = assertStaging()
const client = createClient(url, required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
})
const command = process.argv[2]
if (!['seed', 'reset'].includes(command)) throw new Error('Use `seed` or `reset`.')

if (command === 'reset') {
  await reset(client)
  console.log('Staging demo data removed.')
} else {
  const result = await seed(client)
  console.log(JSON.stringify(result, null, 2))
}
