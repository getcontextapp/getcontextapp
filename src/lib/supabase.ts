import { createBrowserClient } from '@supabase/ssr'
import { createServerClient as _createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export function createClient() {
  return createBrowserClient(supabaseUrl, supabaseAnon)
}

export async function createServerClient() {
  const cookieStore = await cookies()
  return _createServerClient(supabaseUrl, supabaseAnon, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch {}
      },
    },
  })
}

export function createServiceClient() {
  return createSupabaseClient(
    supabaseUrl,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}
