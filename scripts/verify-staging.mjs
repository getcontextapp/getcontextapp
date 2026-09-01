import { createClient } from '@supabase/supabase-js'

if (process.env.CONTEXT_ENV !== 'staging') throw new Error('CONTEXT_ENV must be staging.')

const client = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
)

const accounts = [
  ['solo', 'solo.demo@getcontextapp.com'],
  ['shared', 'shared.demo@getcontextapp.com'],
  ['carePartner', 'cp.demo@getcontextapp.com'],
]
const results = {}

for (const [name, email] of accounts) {
  const { data: auth, error: authError } = await client.auth.signInWithPassword({
    email,
    password: process.env.STAGING_DEMO_PASSWORD,
  })
  if (authError) throw authError

  const [profiles, plans, calendarEvents] = await Promise.all([
    client.from('profiles').select('id,role,household_id'),
    client.from('planned_activities').select('id'),
    client.from('calendar_events').select('id'),
  ])
  const errors = [profiles.error, plans.error, calendarEvents.error].filter(Boolean)
  if (errors.length) throw new Error(errors.map(error => error.message).join('; '))

  results[name] = {
    login: Boolean(auth.user),
    visibleProfiles: profiles.data.length,
    visiblePlans: plans.data.length,
    visibleCalendarEvents: calendarEvents.data.length,
  }
  await client.auth.signOut()
}

console.log(JSON.stringify(results))
