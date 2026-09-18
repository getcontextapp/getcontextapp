'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function ReviewerLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    })

    if (signInError) {
      setError('The reviewer email or password is incorrect.')
      setLoading(false)
      return
    }

    router.replace('/mci-user')
    router.refresh()
  }

  return (
    <main className="min-h-svh bg-cream-50 px-6 py-12">
      <div className="mx-auto flex min-h-[calc(100svh-6rem)] w-full max-w-sm items-center">
        <section className="card w-full space-y-6 p-8" aria-labelledby="reviewer-login-title">
          <header className="space-y-2 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-cream-200 text-3xl" aria-hidden="true">
              🌿
            </div>
            <h1 id="reviewer-login-title" className="font-serif text-2xl font-semibold text-warm-900">
              Context reviewer access
            </h1>
            <p className="text-sm leading-5 text-warm-400">
              Sign in with the test credentials supplied by the Context team.
            </p>
          </header>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-warm-600" htmlFor="reviewer-email">
                Reviewer email
              </label>
              <input
                id="reviewer-email"
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={event => setEmail(event.target.value)}
                className="w-full rounded-xl border border-cream-300 bg-cream-50 px-4 py-3 text-base text-warm-900 focus:border-terracotta-400 focus:outline-none focus:ring-2 focus:ring-terracotta-100"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-warm-600" htmlFor="reviewer-password">
                Password
              </label>
              <input
                id="reviewer-password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                className="w-full rounded-xl border border-cream-300 bg-cream-50 px-4 py-3 text-base text-warm-900 focus:border-terracotta-400 focus:outline-none focus:ring-2 focus:ring-terracotta-100"
              />
            </div>

            {error && (
              <p className="rounded-lg bg-terracotta-50 px-3 py-2 text-sm text-terracotta-500" role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !email.trim() || !password}
              className="w-full rounded-xl bg-warm-700 py-3.5 text-base font-medium text-cream-100 transition-all hover:bg-warm-900 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Signing in…' : 'Sign in to Context'}
            </button>
          </form>

          <p className="text-center text-xs leading-5 text-warm-300">
            This access is reserved for authorized application review.
          </p>
        </section>
      </div>
    </main>
  )
}
