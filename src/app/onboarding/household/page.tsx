'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

type Mode = 'choose' | 'create' | 'join'

export default function HouseholdPage() {
  const router = useRouter()
  const supabase = createClient()

  const [mode, setMode] = useState<Mode>('choose')
  const [householdName, setHouseholdName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function getMyProfile() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not logged in')
    const { data } = await supabase.from('profiles').select('id').eq('user_id', user.id).single()
    return data
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError(null)
    try {
      const profile = await getMyProfile()
      if (!profile) throw new Error('Profile not found')

      // Create household
      const { data: household, error: hErr } = await supabase
        .from('households')
        .insert({ name: householdName.trim() })
        .select()
        .single()

      if (hErr || !household) throw new Error(hErr?.message ?? 'Failed to create household')

      // Link profile
      await supabase.from('profiles').update({ household_id: household.id }).eq('id', profile.id)

      router.push('/')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError(null)
    try {
      const profile = await getMyProfile()
      if (!profile) throw new Error('Profile not found')

      const code = joinCode.trim().toUpperCase()
      const { data: household, error: hErr } = await supabase
        .from('households')
        .select('id')
        .eq('join_code', code)
        .single()

      if (hErr || !household) throw new Error('No household found with that code. Double-check and try again.')

      await supabase.from('profiles').update({ household_id: household.id }).eq('id', profile.id)

      router.push('/')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-svh bg-cream-50 flex flex-col px-6 py-12">
      <div className="max-w-sm mx-auto w-full space-y-8">

        <div className="animate-fade-up">
          <div className="text-3xl mb-3">🏡</div>
          <h1 className="font-serif text-2xl font-semibold text-warm-900">Your household</h1>
          <p className="text-warm-400 text-sm mt-1">Connect with the people who share your day.</p>
        </div>

        {mode === 'choose' && (
          <div className="space-y-4 animate-fade-up delay-100">
            <button
              onClick={() => setMode('create')}
              className="w-full card p-5 text-left hover:shadow-float active:scale-[0.98] transition-all border-2 border-transparent hover:border-sage-300"
            >
              <div className="flex items-center gap-4">
                <span className="text-2xl">✨</span>
                <div>
                  <p className="font-medium text-warm-900">Create a new household</p>
                  <p className="text-sm text-warm-400 mt-0.5">Get a code to share with your care partner</p>
                </div>
              </div>
            </button>

            <button
              onClick={() => setMode('join')}
              className="w-full card p-5 text-left hover:shadow-float active:scale-[0.98] transition-all border-2 border-transparent hover:border-sage-300"
            >
              <div className="flex items-center gap-4">
                <span className="text-2xl">🔗</span>
                <div>
                  <p className="font-medium text-warm-900">Join an existing household</p>
                  <p className="text-sm text-warm-400 mt-0.5">Enter the 6-character code from your household member</p>
                </div>
              </div>
            </button>
          </div>
        )}

        {mode === 'create' && (
          <form onSubmit={handleCreate} className="space-y-5 animate-fade-up">
            <p className="text-warm-600 text-sm">Give your household a name — this is just for you to recognize it.</p>
            <div>
              <label className="block text-sm font-medium text-warm-600 mb-1.5">Household name</label>
              <input
                type="text"
                required
                value={householdName}
                onChange={e => setHouseholdName(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-cream-300 bg-cream-50 text-warm-900 text-base
                           focus:outline-none focus:border-terracotta-400 focus:ring-2 focus:ring-terracotta-100"
                placeholder="e.g. The Johnson Home"
              />
            </div>

            {error && <p className="text-terracotta-500 text-sm bg-terracotta-50 px-3 py-2 rounded-lg">{error}</p>}

            <div className="flex gap-3">
              <button type="button" onClick={() => setMode('choose')}
                className="px-4 py-3 rounded-xl border border-cream-300 text-warm-500 font-medium text-sm hover:bg-cream-100 transition-colors">
                Back
              </button>
              <button type="submit" disabled={loading || !householdName.trim()}
                className="flex-1 py-3 rounded-xl bg-warm-700 text-cream-100 font-medium disabled:opacity-50 hover:bg-warm-900 active:scale-[0.98] transition-all">
                {loading ? 'Creating…' : 'Create household'}
              </button>
            </div>
          </form>
        )}

        {mode === 'join' && (
          <form onSubmit={handleJoin} className="space-y-5 animate-fade-up">
            <p className="text-warm-600 text-sm">Ask your household member for their 6-character join code and enter it below.</p>
            <div>
              <label className="block text-sm font-medium text-warm-600 mb-1.5">Join code</label>
              <input
                type="text"
                required
                value={joinCode}
                onChange={e => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
                className="w-full px-4 py-3 rounded-xl border border-cream-300 bg-cream-50 text-warm-900 text-2xl
                           font-mono tracking-[0.3em] text-center
                           focus:outline-none focus:border-terracotta-400 focus:ring-2 focus:ring-terracotta-100"
                placeholder="ABC123"
                maxLength={6}
                autoCapitalize="characters"
              />
            </div>

            {error && <p className="text-terracotta-500 text-sm bg-terracotta-50 px-3 py-2 rounded-lg">{error}</p>}

            <div className="flex gap-3">
              <button type="button" onClick={() => setMode('choose')}
                className="px-4 py-3 rounded-xl border border-cream-300 text-warm-500 font-medium text-sm hover:bg-cream-100 transition-colors">
                Back
              </button>
              <button type="submit" disabled={loading || joinCode.length !== 6}
                className="flex-1 py-3 rounded-xl bg-warm-700 text-cream-100 font-medium disabled:opacity-50 hover:bg-warm-900 active:scale-[0.98] transition-all">
                {loading ? 'Joining…' : 'Join household'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
