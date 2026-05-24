export const metadata = {
  title: 'Terms and Conditions | Context',
}

export default function TermsPage() {
  return (
    <main className="min-h-svh bg-cream-50 px-6 py-10">
      <article className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-3">
          <a href="/" className="text-sm font-medium text-terracotta-500 underline underline-offset-2">
            Context
          </a>
          <h1 className="font-serif text-3xl font-semibold text-warm-900">Terms and Conditions</h1>
          <p className="text-sm text-warm-400">Last updated: May 24, 2026</p>
        </header>

        <section className="card space-y-5 p-6 text-warm-700">
          <p>
            These Terms and Conditions govern use of Context, a cognitive continuity web app for
            everyday activity logging, reminders, and care partner summaries.
          </p>

          <h2 className="font-serif text-xl font-semibold text-warm-900">Program Name</h2>
          <p>Context</p>

          <h2 className="font-serif text-xl font-semibold text-warm-900">Program Description</h2>
          <p>
            Context helps users record daily activities and helps care partners view activity
            summaries. If users opt in, Context may send text messages that include reminder cues,
            re-entry prompts, and daily activity summaries.
          </p>

          <h2 className="font-serif text-xl font-semibold text-warm-900">SMS Consent</h2>
          <p>
            By entering your mobile phone number in Context and continuing setup, you agree to
            receive text messages from Context related to reminders, activity summaries, and account
            use. Consent is not a condition of purchase.
          </p>

          <h2 className="font-serif text-xl font-semibold text-warm-900">Message Frequency</h2>
          <p>
            Message frequency varies. Reminder messages may be sent periodically based on user
            settings and activity. Care partner summary messages may be sent daily if enabled.
          </p>

          <h2 className="font-serif text-xl font-semibold text-warm-900">Message and Data Rates</h2>
          <p>Message and data rates may apply.</p>

          <h2 className="font-serif text-xl font-semibold text-warm-900">Opt Out and Help</h2>
          <p>
            You can opt out of SMS messages at any time by replying <strong>STOP</strong>. For help,
            reply <strong>HELP</strong> or contact us at{' '}
            <a className="text-terracotta-500 underline underline-offset-2" href="mailto:getcontextapp@gmail.com">
              getcontextapp@gmail.com
            </a>
            .
          </p>

          <h2 className="font-serif text-xl font-semibold text-warm-900">Privacy</h2>
          <p>
            Our Privacy Policy explains how we collect, use, and protect information. View it at{' '}
            <a className="text-terracotta-500 underline underline-offset-2" href="/privacy">
              https://getcontextapp.com/privacy
            </a>
            .
          </p>

          <h2 className="font-serif text-xl font-semibold text-warm-900">Appropriate Use</h2>
          <p>
            Context is not an emergency service and should not be used for urgent medical, safety,
            or crisis needs. If there is an emergency, contact local emergency services.
          </p>

          <h2 className="font-serif text-xl font-semibold text-warm-900">Contact</h2>
          <p>
            For support, contact{' '}
            <a className="text-terracotta-500 underline underline-offset-2" href="mailto:getcontextapp@gmail.com">
              getcontextapp@gmail.com
            </a>
            .
          </p>
        </section>
      </article>
    </main>
  )
}
