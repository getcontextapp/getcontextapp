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
          <p className="text-sm text-warm-400">Last updated: August 24, 2026</p>
        </header>

        <section className="card space-y-5 p-6 text-warm-700">
          <p>
            Context is a cognitive continuity web app that helps people remember daily
            activities, keep track of plans, receive gentle reminders, connect read-only
            calendar information, and share a calm view of the day with a care partner.
          </p>

          <h2 className="font-serif text-xl font-semibold text-warm-900">Information We Collect</h2>
          <p>
            We may collect your name, email address, phone number, account role, household
            information, care partner information, app settings, plans, completed activities,
            moved or deleted tasks, repeat rules, daily reflections, reflection tags, calendar
            items you connect, SMS messages sent to or from Context, recovery confirmations and
            rejections, support requests, pilot form entries, and app usage information needed
            to provide the service.
          </p>

          <h2 className="font-serif text-xl font-semibold text-warm-900">How We Use Information</h2>
          <p>
            We use information to create and manage accounts, link households, show daily plans,
            support recall and re-entry, generate ContextRank suggestions, send reminders, process
            SMS commands, prepare daily summaries, show care partner views, provide support, monitor
            pilot reliability, prevent duplicate tasks, and improve safety and usability.
          </p>
          <p>
            Context uses AI services to help parse natural-language plans, summarize reflections,
            and phrase recall support in plain language. AI output is supportive and informational.
            It is not a medical diagnosis, treatment, emergency service, or substitute for a care
            professional.
          </p>

          <h2 className="font-serif text-xl font-semibold text-warm-900">Text Messaging</h2>
          <p>
            If you provide a mobile phone number and opt in, Context may send reminder text
            messages and daily summary text messages related to your use of the app. Message and
            data rates may apply. Message frequency may vary based on your reminder settings and
            activity.
          </p>
          <p>
            Context may also receive SMS replies such as DONE, MOVE, DELETE, HELP, and STOP so it
            can update plans or stop messages. We do not share SMS opt-in data or consent records
            for marketing.
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
          <p>
            Service providers may include hosting, database, authentication, SMS delivery, email,
            analytics, calendar connection, and AI processing providers. We may also disclose
            information if required by law, to protect safety, or with your consent.
          </p>

          <h2 className="font-serif text-xl font-semibold text-warm-900">Care Partner Access</h2>
          <p>
            If you join a household with a care partner, your plans, completed items, calendar
            previews, reflections, tags, and reassurance summaries may be visible to that care
            partner inside Context and may be included in care partner messages. Care partners do
            not receive a live location feed from Context.
          </p>

          <h2 className="font-serif text-xl font-semibold text-warm-900">Calendar Access</h2>
          <p>
            If you connect Google Calendar, Context asks for read-only access so it can show helpful
            calendar items inside Context. Context can see calendar events and Google Tasks you
            choose to sync. Context cannot edit or delete anything in your Google Calendar or Google
            Tasks.
          </p>
          <p>
            Calendar data is used only to provide and improve visible Context features, including
            the calendar card, care partner calendar preview, and ContextRank suggestions. We do not
            sell Google user data, use it for advertising, or use it to train general-purpose AI
            models. You can disconnect calendar access in Context settings or in your Google Account.
          </p>

          <h2 className="font-serif text-xl font-semibold text-warm-900">Research and Pilot Use</h2>
          <p>
            Context is currently used in a pilot setting. Pilot data may be reviewed by the Context
            team to provide support, understand reliability, and improve the product. Any separate
            research consent materials provided to participants control the research use described
            in those materials.
          </p>

          <h2 className="font-serif text-xl font-semibold text-warm-900">Pilot Feature Rollout</h2>
          <p>
            During the pilot, some new features may be tested first with internal households before
            participant rollout. This helps us check safety, usability, and reliability before
            introducing changes to older adults and care partners.
          </p>

          <h2 className="font-serif text-xl font-semibold text-warm-900">Your Choices</h2>
          <p>
            You can ask us to access, correct, export, or delete information associated with your
            account, subject to legal, security, backup, and research record requirements. You can
            disconnect Google Calendar in Context or from your Google Account. You can opt out of
            SMS messages by replying STOP.
          </p>

          <h2 className="font-serif text-xl font-semibold text-warm-900">Data Security</h2>
          <p>
            We use reasonable technical and organizational safeguards to protect information.
            However, no internet-based service can be guaranteed to be completely secure.
          </p>
          <p>
            If a security incident occurs, we will assess our obligations under applicable law,
            including federal and state privacy and breach-notification requirements.
          </p>

          <h2 className="font-serif text-xl font-semibold text-warm-900">Children</h2>
          <p>
            Context is not intended for children under 18.
          </p>

          <h2 className="font-serif text-xl font-semibold text-warm-900">U.S. State Privacy Rights</h2>
          <p>
            Depending on where you live, you may have rights to request access, correction,
            deletion, portability, or information about how personal information is used. We do not
            sell personal information or share it for cross-context behavioral advertising.
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
