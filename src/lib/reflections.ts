import type { SupabaseClient } from '@supabase/supabase-js'
import { generateReflectionMemory } from '@/lib/anthropic'
import { getLocalDateKey } from '@/lib/dates'
import type { Reflection, ReflectionNodes } from '@/types'

const EMPTY_NODES: ReflectionNodes = {
  activities: [],
  people: [],
  places: [],
  feelings: [],
}

function normalizeNodes(value: unknown): ReflectionNodes {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const clean = (items: unknown) => Array.isArray(items)
    ? items.map(item => String(item ?? '').trim()).filter(Boolean)
    : []
  return {
    activities: clean(input.activities),
    people: clean(input.people),
    places: clean(input.places),
    feelings: clean(input.feelings),
  }
}

export function reflectionToClient(row: any): Reflection {
  return {
    id: row.id,
    user_id: row.user_id,
    household_id: row.household_id,
    raw_input: row.raw_input ?? '',
    ai_summary: row.ai_summary ?? '',
    nodes: normalizeNodes(row.nodes ?? EMPTY_NODES),
    source: row.source === 'sms' ? 'sms' : 'app',
    reflection_date: row.reflection_date,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export async function saveReflectionInput(
  supabase: SupabaseClient,
  profile: {
    id: string
    user_id: string
    household_id: string
    timezone: string
  },
  rawInput: string,
  source: 'app' | 'sms',
) {
  const newInput = rawInput.trim()
  if (!newInput) throw new Error('Reflection text is required')

  const reflectionDate = getLocalDateKey(new Date(), profile.timezone)
  const { data: existing, error: existingError } = await supabase
    .from('reflections')
    .select('*')
    .eq('user_id', profile.user_id)
    .eq('reflection_date', reflectionDate)
    .maybeSingle()

  if (existingError && existingError.code !== '42P01') {
    throw new Error(`Could not load reflection: ${existingError.message}`)
  }

  const combinedRaw = existing?.raw_input?.trim()
    ? `${existing.raw_input.trim()}\n\n${newInput}`
    : newInput

  const memory = await generateReflectionMemory(combinedRaw)
  const updatedAt = new Date().toISOString()

  if (existing?.id) {
    const { data, error } = await supabase
      .from('reflections')
      .update({
        raw_input: combinedRaw,
        ai_summary: memory.summary,
        nodes: memory.nodes,
        source: existing.source === 'sms' ? 'sms' : source,
        updated_at: updatedAt,
      })
      .eq('id', existing.id)
      .select()
      .single()

    if (error) throw new Error(`Could not update reflection: ${error.message}`)
    return reflectionToClient(data)
  }

  const { data, error } = await supabase
    .from('reflections')
    .insert({
      user_id: profile.user_id,
      household_id: profile.household_id,
      raw_input: combinedRaw,
      ai_summary: memory.summary,
      nodes: memory.nodes,
      source,
      reflection_date: reflectionDate,
      updated_at: updatedAt,
    })
    .select()
    .single()

  if (error) throw new Error(`Could not save reflection: ${error.message}`)
  return reflectionToClient(data)
}
