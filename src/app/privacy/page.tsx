export const metadata = {
  title: 'Privacy Policy | Context',
}

export default function PrivacyPage() {
  return (
    <main className="min-h-svh bg-cream-50 px-6 py-10">
      <article className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-3">
          <a href="/" className="text-sm font-medium text-terracotta-500 underline underline-offset-2">
            Context
          </a>
          <h1 className="font-serif text-3xl font-semibold text-warm-900">Privacy Policy</h1>
          <p className="text-sm text-warm-400">Last updated: May 24, 2026</p>
        </header>

        <section className="card space-y-5 p-6 text-warm-700">
          <p>
            Context is a cognitive continuity web app that helps users log daily activities,
            receive gentle reminders, and share activity summaries with a care partner.
          </p>

          <h2 className="font-serif text-xl font-semibold text-warm-900">Information We Collect</h2>
          <p>
            We may collect your name, email address, phone number, household information,
            activity logs, reminder settings, and app usage information needed to provide the
            Context service.
          </p>

          <h2 className="font-serif text-xl font-semibold text-warm-900">How We Use Information</h2>
          <p>
            We use this information to create and manage your account, connect household members,
            display activity history, generate context cards, send reminders, send daily summaries,
            provide support, and improve the reliability and safety of the app.
          </p>

          <h2 className="font-serif text-xl font-semibold text-warm-900">Text Messaging</h2>
          <p>
            If you provide a mobile phone number and opt in, Context may send reminder text
            messages and daily summary text messages related to your use of the app. Message and
            data rates may apply. Message frequency may vary based on your reminder settings and
            activity.
          </p>

          <h2 className="font-serif text-xl font-semibold text-warm-900">Sharing Information</h2>
          <p>
            We do not sell your personal information. We do not share mobile opt-in information,
            phone numbers, or SMS consent information with third parties or affiliates for marketing
            or promotional purposes.
          </p>
          <p>
            We may share information with service providers that help operate Context, such as
            hosting, authentication, email, SMS delivery, database, and AI service providers. These
            providers may use information only to provide services to Context and not for their own
            marketing.
          </p>

          <h2 className="font-serif text-xl font-semibold text-warm-900">Care Partner Access</h2>
          <p>
            If you join a household with a care partner, activity information may be visible to
            that care partner inside Context and may be included in daily summary messages.
          </p>

          <h2 className="font-serif text-xl font-semibold text-warm-900">Data Security</h2>
          <p>
            We use reasonable technical and organizational safeguards to protect information.
            However, no internet-based service can be guaranteed to be completely secure.
          </p>

          <h2 className="font-serif text-xl font-semibold text-warm-900">Contact</h2>
          <p>
            If you have questions about this policy, contact us at{' '}
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
