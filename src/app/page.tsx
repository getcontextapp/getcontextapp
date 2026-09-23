import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase-server'
import { linkSavedPhoneToAuth } from '@/lib/auth-phone'
import styles from './landing.module.css'

export const metadata: Metadata = {
  title: 'Context — Stay on top of your day',
  description:
    "Context helps you remember what matters, know what's next, and find your way back when you lose your place.",
}

const Arrow = () => (
  <svg viewBox="0 0 34 18" aria-hidden="true">
    <path d="M1 9h30M25 3l6 6-6 6" />
  </svg>
)

const CalendarIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="3" y="5" width="18" height="16" rx="3" />
    <path d="M8 3v4M16 3v4M3 11h18" />
  </svg>
)

const PhoneIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="6" y="2" width="12" height="20" rx="3" />
    <path d="M11 18h2" />
  </svg>
)

const VoiceIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </svg>
)

const PeopleIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M16 19a4 4 0 0 0-8 0" />
    <circle cx="12" cy="10" r="3" />
    <path d="M20 19a4 4 0 0 0-3-3.9M4 19a4 4 0 0 1 3-3.9" />
  </svg>
)

export default async function RootPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return <LandingPage />

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, household_id, phone_e164')
    .eq('user_id', user.id)
    .single()

  if (!profile) redirect('/onboarding')

  await linkSavedPhoneToAuth(user.id, user.phone, profile.phone_e164)

  if (!profile.household_id) redirect('/onboarding/household')
  if (profile.role === 'care_partner') redirect('/care-partner')
  redirect('/mci-user')
}

export function LandingPage() {
  return (
    <div className={styles.page}>
      <a className={styles.skip} href="#main-content">Skip to main content</a>

      <header className={styles.header}>
        <a className={styles.brand} href="#top" aria-label="Context home">Context</a>
        <nav className={styles.nav} aria-label="Main navigation">
          <a href="#how">How it works</a>
          <a href="#science">The science</a>
          <a href="#together">Family</a>
          <a href="#privacy">Privacy</a>
        </nav>
        <Link className={styles.pillPrimary} href="/auth/login">Login / Sign Up</Link>
      </header>

      <main id="main-content">
        <section className={styles.hero} id="top">
          <h1>Stay on top of your day.<br />Stay <em>independent</em>.</h1>
          <p className={styles.heroCopy}>Context helps you remember what matters, know what&apos;s next, and find your way back when you lose your place.</p>
          <div className={styles.ctaRow}>
            <Link className={styles.pillPrimaryLarge} href="/auth/login">Get Context</Link>
            <a className={styles.pillSecondaryLarge} href="#how">See how it works</a>
          </div>
          <p className={styles.heroNote}>Designed around the science of memory and cognitive aging.</p>

          <div className={styles.threadCard}>
            <svg className={styles.threadGraphic} viewBox="0 0 1000 220" fill="none" aria-hidden="true">
              <path d="M20 150 C 140 150, 190 60, 300 60 L 400 60" className={styles.inkStroke} />
              <path d="M430 60 L 470 60M500 60 L 560 60" className={styles.mutedDash} />
              <path d="M590 60 L 700 60 C 810 60, 860 150, 980 150" className={styles.accentStroke} />
              <circle cx="20" cy="150" r="7" className={styles.inkFill} />
              <circle cx="980" cy="150" r="7" className={styles.accentFill} />
              <circle cx="415" cy="60" r="6" className={styles.mutedFill} />
              <circle cx="585" cy="60" r="6" className={styles.accentFill} />
              <path d="M585 60 L585 130" className={styles.accentVertical} />
              <path d="M415 60 L415 130" className={styles.mutedVertical} />
            </svg>
            <div className={styles.threadLabels}>
              <ThreadLabel title="You start something">The day is going the way you meant it to.</ThreadLabel>
              <ThreadLabel title="Something interrupts">The way back to it goes quiet.</ThreadLabel>
              <ThreadLabel title="Context picks it up" accent>You carry on from where you were.</ThreadLabel>
            </div>
          </div>
        </section>

        <section className={styles.problem}>
          <h2>When memory changes, everyday life changes too.</h2>
          <div className={styles.problemContent}>
            <div className={styles.questionGrid}>
              <blockquote>What was I about to do?</blockquote>
              <blockquote>Did I already take care of that?</blockquote>
              <blockquote>What do I have this afternoon?</blockquote>
              <blockquote>There was something I needed to remember.</blockquote>
            </div>
            <p>Context gives those moments one dependable place to go.</p>
          </div>
        </section>

        <FeatureSection
          id="how"
          label="Remember"
          title="Tell Context once."
          copy="Say it out loud or type a line. An appointment, a name, a thing you promised to do later. It is held for you, and you do not have to hold it yourself."
          art={<RememberGraphic />}
          light
        />

        <FeatureSection
          label="Stay on track"
          title="One simple day."
          copy="What matters now, and what is coming next. Everything in one place, in the order it will happen, with nothing else competing for your attention."
          art={<TrackGraphic />}
          reverse
        />

        <FeatureSection
          label="Find your way back"
          title="Just ask."
          copy="Lost the thread of what you were doing? Ask Context, and it tells you where you were. This is the part other tools leave out, and it is the reason Context exists."
          art={<WayBackGraphic />}
          light
        />

        <section className={styles.personal}>
          <h2>Help that gets more personal over time.</h2>
          <p>Context learns which reminders reach you, when you tend to need a little more support, and what you already handle easily on your own. There is no system to set up and nothing to maintain.</p>
          <div className={styles.personalGrid}>
            <InfoCard title="It fits your morning">Support arrives when your day actually starts, not when a clock says so.</InfoCard>
            <InfoCard title="It reaches you your way">Some people answer a message. Some answer a voice. Context uses the one you answer.</InfoCard>
            <InfoCard title="It stays out of the way">The things you never forget stop being mentioned. Less noise, over time.</InfoCard>
          </div>
        </section>

        <section className={styles.together} id="together">
          <div className={styles.togetherCopy}>
            <span className={styles.eyebrow}>Family and care partners</span>
            <h2>Independent doesn&apos;t have to mean alone.</h2>
            <p>Manage your own day, and keep someone you trust close enough to help when you want them. They can lend a hand without taking over, and you decide what they see.</p>
          </div>
          <TogetherGraphic />
        </section>

        <section className={styles.worksWith}>
          <div>
            <h2>Your life doesn&apos;t need another complicated system.</h2>
            <p>Context brings the important parts of what you already use into one simpler place.</p>
          </div>
          <div className={styles.integrationGrid}>
            <Integration icon={<CalendarIcon />} label="Your calendar" />
            <Integration icon={<PhoneIcon />} label="Your phone" />
            <Integration icon={<VoiceIcon />} label="Your voice" />
            <Integration icon={<PeopleIcon />} label="Your people" />
          </div>
        </section>

        <section className={styles.science} id="science">
          <div className={styles.scienceIntro}>
            <h2>Built on the science of how memory works.</h2>
            <p>Context is informed by research on cognitive aging, on how people compensate for memory change, and on how much a person should have to hold in mind at once.</p>
          </div>
          <div className={styles.scienceRows}>
            <ScienceRow title="Remembering to do something later">Context keeps what you intend to do visible, and brings it back at the moment it is useful rather than the moment you said it.</ScienceRow>
            <ScienceRow title="Remembering what you were doing">Context holds the recent thread of your day, so the answer to &ldquo;where was I&rdquo; is somewhere you can go and look.</ScienceRow>
            <ScienceRow title="Carrying less in your head">One dependable place for plans, reminders and the things that matter, instead of several places you have to remember to check.</ScienceRow>
          </div>
        </section>

        <section className={styles.privacy} id="privacy">
          <h2>Your life is personal. Context treats it that way.</h2>
          <div className={styles.privacyList}>
            <p>You choose what Context can see.</p>
            <p>You choose what your family can see.</p>
            <p>You can change either of those any time you like.</p>
          </div>
        </section>

        <section className={styles.audiences}>
          <h2>Who Context is for.</h2>
          <div className={styles.audienceGrid}>
            <InfoCard title="For me">I want help remembering without giving up control of my day.</InfoCard>
            <InfoCard title="For someone I love">I want to help without checking in every hour, and without taking over.</InfoCard>
            <InfoCard title="For organizations">I want to help people keep their independence for longer.</InfoCard>
          </div>
        </section>

        <section className={styles.closing}>
          <h2>Keep living your life. Let Context help you keep track of it.</h2>
          <div className={styles.ctaRow}>
            <Link className={styles.pillPrimaryLarge} href="/auth/login">Get Context</Link>
            <Link className={styles.pillDarkOutline} href="/auth/login">Log in</Link>
          </div>
          <p>Made for people living with changes in memory, and the people who support them.</p>
          <small>By creating an account you agree to our <Link href="/terms">terms and conditions</Link> and <Link href="/privacy">privacy policy</Link>.</small>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerTop}>
          <div className={styles.footerBrand}>
            <span>Context</span>
            <a href="mailto:getcontextapp@gmail.com">getcontextapp@gmail.com</a>
          </div>
          <div className={styles.footerLinks}>
            <FooterColumn title="Product" links={[["How it works", "#how"], ["Family", "#together"], ["The science", "#science"]]} />
            <FooterColumn title="Account" links={[["Get Context", "/auth/login"], ["Log in", "/auth/login"]]} />
            <FooterColumn title="Legal" links={[["Terms and conditions", "/terms"], ["Privacy policy", "/privacy"], ["Accessibility", "mailto:getcontextapp@gmail.com?subject=Accessibility%20at%20Context"]]} />
          </div>
        </div>
        <div className={styles.footerBottom}>
          <span>© 2026 Context. A support tool, not a medical device.</span>
          <span><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link><span>getcontextapp.com</span></span>
        </div>
      </footer>
    </div>
  )
}

function ThreadLabel({ title, accent = false, children }: { title: string; accent?: boolean; children: React.ReactNode }) {
  return <div><span className={accent ? styles.accentText : ''}>{title}</span><p>{children}</p></div>
}

function FeatureSection({ id, label, title, copy, art, reverse = false, light = false }: { id?: string; label: string; title: string; copy: string; art: React.ReactNode; reverse?: boolean; light?: boolean }) {
  return (
    <section className={`${styles.feature} ${reverse ? styles.reverse : ''} ${light ? styles.light : ''}`} id={id}>
      <div className={styles.featureCopy}><span className={styles.eyebrow}>{label}</span><h2>{title}</h2><p>{copy}</p></div>
      <div className={styles.featureArt}>{art}</div>
    </section>
  )
}

function RememberGraphic() {
  return (
    <svg viewBox="0 0 640 360" aria-hidden="true">
      <circle cx="320" cy="180" r="150" className={styles.ringOne} />
      <circle cx="320" cy="180" r="112" className={styles.ringTwo} />
      <circle cx="320" cy="180" r="74" className={styles.ringThree} />
      <circle cx="320" cy="180" r="36" className={styles.accentFill} />
      <path d="M320 40v-2" className={styles.topTick} />
      <path d="M320 168a8 8 0 0 1 8 8v12a8 8 0 0 1-16 0v-12a8 8 0 0 1 8-8Z" fill="#fff" />
      <path d="M304 186a16 16 0 0 0 32 0M320 202v8" className={styles.whiteStroke} />
      <path d="M40 180h94M506 180h94" className={styles.rememberDash} />
      <rect x="24" y="150" width="128" height="60" rx="16" className={styles.softBox} />
      <text x="88" y="176" textAnchor="middle">Spoken</text><text x="88" y="194" textAnchor="middle">or typed</text>
      <rect x="488" y="150" width="128" height="60" rx="16" className={styles.softBox} />
      <text x="552" y="176" textAnchor="middle">Kept until</text><text x="552" y="194" textAnchor="middle">it matters</text>
    </svg>
  )
}

function TrackGraphic() {
  return (
    <svg viewBox="0 0 640 360" aria-hidden="true">
      <path d="M60 60h520M60 180h520M60 300h520" className={styles.gridLine} />
      <rect x="60" y="34" width="230" height="52" rx="16" className={styles.accentFill} />
      <text x="86" y="66" className={`${styles.whiteText} ${styles.trackText}`}>Now</text>
      <rect x="60" y="154" width="330" height="52" rx="16" className={styles.softBoxStrong} /><text x="86" y="186" className={styles.trackText}>Next</text>
      <rect x="60" y="274" width="180" height="52" rx="16" className={styles.softBox} /><text x="86" y="306" className={styles.trackText}>Later</text>
      <circle cx="580" cy="60" r="6" className={styles.accentFill} /><circle cx="580" cy="180" r="6" className={styles.mutedFill} /><circle cx="580" cy="300" r="6" className={styles.paleFill} />
      <path d="M320 60 L560 60" className={styles.accentDash} /><path d="M420 180 L560 180" className={styles.mutedDashThin} /><path d="M270 300 L560 300" className={styles.paleDash} />
    </svg>
  )
}

function WayBackGraphic() {
  return (
    <svg viewBox="0 0 640 360" fill="none" aria-hidden="true">
      <path d="M70 120 C200 60 300 60 380 120" className={styles.inkStroke} />
      <path d="M380 120 C470 180 400 260 300 250" className={styles.wayBackDash} />
      <path d="M300 250 C180 236 120 190 76 132M76 132l16-6M76 132l2 17" className={styles.accentStroke} />
      <circle cx="70" cy="120" r="8" className={styles.inkFill} /><circle cx="380" cy="120" r="7" className={styles.mutedFill} />
      <rect x="404" y="88" width="196" height="66" rx="18" className={styles.softBox} />
      <text x="428" y="116" className={styles.wayAnnotation}>You lose the place</text><text x="428" y="138" className={styles.wayAnnotation}>somewhere here</text>
      <rect x="150" y="288" width="244" height="46" rx="16" className={styles.accentFill} /><text x="272" y="317" textAnchor="middle" className={styles.whiteText}>Where was I?</text>
    </svg>
  )
}

function TogetherGraphic() {
  return (
    <svg className={styles.togetherGraphic} viewBox="0 0 560 300" aria-hidden="true">
      <circle cx="180" cy="150" r="104" /><text x="180" y="144" textAnchor="middle" className={styles.togetherTitle}>Your day</text><text x="180" y="174" textAnchor="middle">Yours to run</text>
      <circle cx="400" cy="150" r="78" className={styles.trustedCircle} /><text x="400" y="146" textAnchor="middle" className={styles.trustedTitle}>Someone</text><text x="400" y="172" textAnchor="middle" className={styles.trustedTitle}>you trust</text>
      <path d="M296 150h20" />
    </svg>
  )
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return <article className={styles.infoCard}><h3>{title}</h3><p>{children}</p></article>
}

function Integration({ icon, label }: { icon: React.ReactNode; label: string }) {
  return <div className={styles.integration}><span>{icon}</span><strong>{label}</strong></div>
}

function ScienceRow({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className={styles.scienceRow}><h3>{title}</h3><span className={styles.arrow}><Arrow /></span><p>{children}</p></div>
}

function FooterColumn({ title, links }: { title: string; links: [string, string][] }) {
  return <nav aria-label={title}><strong>{title}</strong>{links.map(([label, href]) => href.startsWith('/') ? <Link key={label} href={href}>{label}</Link> : <a key={label} href={href}>{label}</a>)}</nav>
}
