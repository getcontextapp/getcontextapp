import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()

function read(path: string) {
  return readFileSync(join(root, path), 'utf8')
}

function expectIncludes(source: string, token: string, label: string) {
  assert.ok(source.includes(token), `${label} is missing ${token}`)
}

function expectExcludes(source: string, token: string, label: string) {
  assert.ok(!source.includes(token), `${label} still contains ${token}`)
}

const analytics = read('src/lib/pilot-analytics.ts')
for (const token of ['NEUTRAL_LABELS', 'Cedar', 'Harbor', 'Juniper']) {
  expectExcludes(analytics, token, 'pilot analytics')
}
for (const token of [
  'pilotReadiness',
  'calendar_connections',
  'calendar_events',
  'pilot_preview',
  'INTERNAL_PREVIEW_NAMES',
  'calendarItem',
  'STUDY_DAYS',
]) {
  expectIncludes(analytics, token, 'pilot analytics')
}
for (const token of [
  "name.includes('demo')",
  "name.includes('internal')",
]) {
  expectExcludes(analytics, token, 'pilot analytics cohort rules')
}

const dashboard = read('src/app/admin/analytics/AnalyticsDashboard.tsx')
for (const token of [
  'Pilot monitoring',
  'Silent dyad alert',
  'Outcome scores',
  'Study arc timeline',
  'Pilot readiness',
  'Export center',
  'Dyad health panel',
]) {
  expectIncludes(dashboard, token, 'admin dashboard')
}

const privacy = read('src/app/privacy/page.tsx')
for (const token of ['Calendar Access', 'Pilot Feature Rollout', 'read-only']) {
  expectIncludes(privacy, token, 'privacy policy')
}

const migration = read('supabase/pilot-readiness.sql')
for (const token of ['study_outcomes', 'household_feature_flags', 'pilot_preview', 'calendar_sync', 'bilau', 'baru', 'davis']) {
  expectIncludes(migration, token, 'pilot readiness migration')
}

console.log('Pilot readiness checks passed.')
