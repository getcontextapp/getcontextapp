import type { Metadata } from 'next'
import PilotForm from './PilotForm'

export const metadata: Metadata = {
  title: 'Context | Helping you pick up where you left off',
  description: 'Context is a simple, supportive way for people with mild memory changes and their care partners to stay connected to the day. Join the invitation-only pilot.',
}

export default function HomePage() {
  return (
    <>
      <a className="landing-skip" href="#main">Skip to main content</a>
      <header className="landing-header">
        <div className="landing-wrap landing-nav">
          <a className="landing-logo" href="#top" aria-label="Context home">
            <span className="landing-logo-mark" aria-hidden="true">c</span>
            <span className="landing-logo-name">context</span>
          </a>
          <ul className="landing-nav-links">
            <li><a href="#how">How it works</a></li>
            <li><a href="#pilot">Pilot</a></li>
            <li><a href="#care-partners">For care partners</a></li>
            <li><a href="#faq">FAQ</a></li>
          </ul>
          <a className="landing-btn landing-btn-dark" href="#pilot">Join the pilot</a>
        </div>
      </header>

      <main id="main" className="landing-page">
        <section className="landing-hero" id="top">
          <div className="landing-hero-bg" aria-hidden="true" />
          <div className="landing-wrap landing-hero-grid">
            <div>
              <span className="landing-pill">Invitation-only pilot</span>
              <h1>Helping you pick up where you left off.</h1>
              <p className="landing-sub">Context is a simple, supportive way to stay connected to your day, together.</p>
              <a className="landing-btn landing-btn-dark" href="#pilot">Join the pilot <span className="landing-arr">→</span></a>
              <div className="landing-assure">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#44603C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></svg>
                <p><strong>Secure. Private. You&apos;re in control.</strong> Built with researchers at Georgia Tech and Emory.</p>
              </div>
            </div>

            <div className="landing-hero-visual">
              <svg className="landing-dash" width="220" height="120" viewBox="0 0 220 120" fill="none" aria-hidden="true">
                <path d="M6 110 C 60 100, 120 60, 214 8" stroke="#8a8371" strokeWidth="1.5" strokeDasharray="5 7" />
              </svg>
              <div className="landing-float landing-float-one" aria-hidden="true">🚶</div>
              <div className="landing-float landing-float-two" aria-hidden="true">⛅</div>
              <div className="landing-float landing-float-three" aria-hidden="true">💊</div>
              <PhoneMockup />
            </div>
          </div>
        </section>

        <section className="landing-strip" aria-label="Context benefits">
          <div className="landing-wrap">
            <div className="landing-strip-inner">
              <FeatureItem title="Understand your day" text="Get gentle help recalling what you were doing." icon="spark" />
              <FeatureItem title="Stay on track" text="See what's next and what matters most." icon="list" />
              <FeatureItem title="Share with confidence" text="Care partners stay informed and involved." icon="people" />
              <FeatureItem title="Privacy first" text="Your data is private and always under your control." icon="lock" />
            </div>
          </div>
        </section>

        <section className="landing-how" id="how">
          <div className="landing-wrap">
            <h2>How Context helps</h2>
            <p className="landing-lede">Simple support for everyday moments.</p>
            <div className="landing-flow">
              <StepOne />
              <span className="landing-flow-arrow" aria-hidden="true">→</span>
              <StepTwo />
              <span className="landing-flow-arrow" aria-hidden="true">→</span>
              <StepThree />
              <span className="landing-flow-arrow" aria-hidden="true">→</span>
              <StepFour />
            </div>
          </div>
        </section>

        <section className="landing-care" id="care-partners">
          <div className="landing-wrap">
            <div className="landing-care-inner">
              <div>
                <p className="landing-eyebrow">For care partners</p>
                <h2>Support without hovering.</h2>
                <p>You want to help without taking over. Context was designed around that exact balance, with families who live it every day.</p>
              </div>
              <ul className="landing-care-list">
                <CareItem title="Add plans from anywhere" text="Send tomorrow's appointments and reminders into their day in seconds, from your own phone." />
                <CareItem title="A daily summary, not a feed" text="One short reflection each evening tells you how the day went. No pings, no live tracking." />
                <CareItem title="Fewer repeated questions" text="When Context answers what was I doing, you get to be the spouse, the daughter, the friend again." />
              </ul>
            </div>
          </div>
        </section>

        <section className="landing-pilot" id="pilot">
          <div className="landing-wrap">
            <div className="landing-pilot-inner">
              <div className="landing-pilot-copy">
                <h2>Join our pilot</h2>
                <p>We&apos;re inviting a small number of older adults with mild memory changes and their care partners to help shape Context.</p>
                <ul className="landing-checks">
                  <CheckItem text="2-week pilot" />
                  <CheckItem text="Simple to use" />
                  <CheckItem text="Support from our team" />
                  <CheckItem text="Your feedback shapes the future" />
                </ul>
              </div>
              <div className="landing-pilot-form">
                <div className="landing-form-card">
                  <h3>Tell us about you</h3>
                  <p className="landing-soon">We&apos;ll be in touch soon.</p>
                  <PilotForm />
                </div>
              </div>
              <div className="landing-pilot-photo" aria-hidden="true">
                <div className="landing-photo-person">
                  <span className="landing-photo-head" />
                  <span className="landing-photo-body" />
                  <span className="landing-photo-phone" />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-faq" id="faq">
          <div className="landing-wrap landing-faq-wrap">
            <h2>Common questions</h2>
            <FaqItem question="How much does Context cost?">
              Context is free for everyone in the pilot. When it opens more widely, care partners will be able to choose a simple monthly plan. Pilot participants keep their access.
            </FaqItem>
            <FaqItem question="What do we need to use it?">
              Just a smartphone with a web browser. Context runs on the phone you already own. There&apos;s nothing to download, and setup takes a few minutes with our help.
            </FaqItem>
            <FaqItem question="Is our information private?">
              Yes. Your daily notes and plans belong to you. Care partners see only what is shared with them, and we handle all data with healthcare-grade care. We never sell personal information.
            </FaqItem>
            <FaqItem question="Who is Context for?">
              Context is designed for older adults living with mild memory changes, together with a spouse, family member, or friend who supports them. Clinicians and memory programs are welcome to reach out about referring participants.
            </FaqItem>
            <FaqItem question="Is Context a medical treatment?">
              No. Context is a daily support tool, not a medical device or treatment. It works alongside, never instead of, the guidance of your care team.
            </FaqItem>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-wrap">
          <a className="landing-logo" href="#top">
            <span className="landing-logo-mark" aria-hidden="true">c</span>
            <span className="landing-logo-name">context</span>
          </a>
          <p>An Ajao Labs product. Context is a memory support tool and is not a medical device. Questions? Write to <a href="mailto:getcontextapp@gmail.com">getcontextapp@gmail.com</a>.</p>
        </div>
      </footer>

      <LandingStyles />
    </>
  )
}

function PhoneMockup() {
  return (
    <div className="landing-phone" role="img" aria-label="The Context home screen on a phone">
      <div className="landing-screen">
        <div className="landing-statusbar"><span>9:41</span><span className="landing-notch" aria-hidden="true" /><span className="landing-icons">▪▪▪</span></div>
        <div className="landing-greeting"><span>Good morning, Margaret</span><span>🏠 ⚙️</span></div>
        <p className="landing-clock">It&apos;s 9:15 AM,<br />Tuesday morning.</p>
        <div className="landing-input-pill"><span>Tell Context your plans for today...</span><span className="landing-go">→</span></div>
        <div className="landing-tasklist">
          <div className="landing-task"><span className="landing-tick done">✓</span><span className="landing-task-name">Morning walk with Frank</span><span className="landing-task-time">Earlier</span></div>
          <div className="landing-task"><span className="landing-tick wait">→</span><span className="landing-task-name">Pick up prescription</span><span className="landing-task-time">Anytime</span></div>
        </div>
        <div className="landing-app-btn primary">What was I doing?</div>
        <div className="landing-app-btn soft">☎ Call Susan</div>
        <div className="landing-screen-foot"><span>Today&apos;s plan</span><span>2 waiting</span></div>
      </div>
    </div>
  )
}

function FeatureItem({ title, text, icon }: { title: string; text: string; icon: 'spark' | 'list' | 'people' | 'lock' }) {
  return (
    <div className="landing-strip-item">
      <span className="landing-strip-icon" aria-hidden="true"><Icon name={icon} /></span>
      <div><strong>{title}</strong><p>{text}</p></div>
    </div>
  )
}

function Icon({ name }: { name: 'spark' | 'list' | 'people' | 'lock' }) {
  if (name === 'list') return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M8 6h13M8 12h13M8 18h13" /><circle cx="3.5" cy="6" r="1.2" fill="currentColor" /><circle cx="3.5" cy="12" r="1.2" fill="currentColor" /><circle cx="3.5" cy="18" r="1.2" fill="currentColor" /></svg>
  if (name === 'people') return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>
  if (name === 'lock') return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3.5" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" /></svg>
}

function StepShell({ number, title, text, children }: { number: string; title: string; text: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="landing-step-head"><span className="landing-step-num">{number}</span><div><h3>{title}</h3><p>{text}</p></div></div>
      {children}
    </div>
  )
}

function StepOne() {
  return (
    <StepShell number="1" title="Start your day" text="Tell Context your plans, or let us help.">
      <div className="landing-mini">
        <p className="landing-mini-soft">Good morning, Margaret</p>
        <p className="landing-mini-serif">It&apos;s 9:15 AM,<br />Tuesday morning.</p>
        <div className="landing-input-pill mini-input"><span>Tell Context your plans...</span><span className="landing-go">→</span></div>
        <MiniTask emoji="✅" title="Morning walk with Frank" meta="Earlier" />
        <MiniTask emoji="🕘" title="Pick up prescription" meta="Anytime" />
        <div className="landing-app-btn primary mini-primary">What was I doing?</div>
      </div>
    </StepShell>
  )
}

function StepTwo() {
  return (
    <StepShell number="2" title="Get gentle guidance" text="When you're unsure, Context helps you reconnect.">
      <div className="landing-mini">
        <p className="landing-back">‹ Back to home</p>
        <p className="landing-mini-eyebrow">What was I doing?</p>
        <p className="landing-mini-serif">You were watering the plants on the porch. <span className="landing-badge">Best guess</span></p>
        <div className="landing-mini-block"><b>Here&apos;s why</b><br />I&apos;m basing this on your morning note and the watering can reminder you checked off.</div>
        <div className="landing-mini-block plain"><b>Is that right?</b></div>
        <div className="landing-mini-actions"><span className="yes">Yes</span><span className="no">No</span></div>
        <span className="landing-mini-link">Let me fix it</span>
      </div>
    </StepShell>
  )
}

function StepThree() {
  return (
    <StepShell number="3" title="Stay on track" text="See your plan, check things off, and move forward.">
      <div className="landing-mini">
        <div className="landing-mini-top"><b>Today&apos;s plan</b><span>2 waiting</span></div>
        <MiniTask emoji="🚶" title="Morning walk" meta="Movement · Every day" chip="Done" done />
        <MiniButtons />
        <MiniTask emoji="💊" title="Pick up prescription" meta="Errand · Anytime" chip="Planned" />
        <MiniButtons />
        <MiniTask emoji="🍽️" title="Lunch with Carol" meta="12:30 today" chip="Planned" />
      </div>
    </StepShell>
  )
}

function StepFour() {
  return (
    <StepShell number="4" title="Care partners stay in the loop" text="They see what matters, when it matters.">
      <div className="landing-mini">
        <div className="landing-mini-top"><b>Care partner view</b><span>Updated just now</span></div>
        <MiniTask emoji="🚶" title="Morning walk" meta="Completed · 8:40 AM" />
        <MiniTask emoji="💊" title="Pick up prescription" meta="Planned · Anytime" />
        <MiniTask emoji="🍽️" title="Lunch with Carol" meta="Planned · 12:30 PM" />
        <div className="landing-heart">♡ Send encouragement</div>
      </div>
    </StepShell>
  )
}

function MiniTask({ emoji, title, meta, chip, done }: { emoji: string; title: string; meta: string; chip?: string; done?: boolean }) {
  return <div className="landing-mini-task"><span>{emoji}</span><div><p>{title}</p><small>{meta}</small></div>{chip && <em className={done ? 'done' : ''}>{chip}</em>}</div>
}

function MiniButtons() {
  return <div className="landing-row-btns"><span className="filled">Done</span><span>Move</span><span>More</span></div>
}

function CareItem({ title, text }: { title: string; text: string }) {
  return (
    <li>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
      <span><b>{title}</b>{text}</span>
    </li>
  )
}

function CheckItem({ text }: { text: string }) {
  return (
    <li><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#E7EDE2" stroke="none" /><path d="m8.5 12.5 2.5 2.5 5-5" stroke="#44603C" /></svg>{text}</li>
  )
}

function FaqItem({ question, children }: { question: string; children: React.ReactNode }) {
  return <details><summary>{question}</summary><p>{children}</p></details>
}

function LandingStyles() {
  return (
    <style>{`
      .landing-page, .landing-header, .landing-footer { --cream:#F7F3EB; --cream-2:#F1EBDF; --card:#FFFFFF; --ink:#1E1B16; --ink-soft:#5A554B; --green:#44603C; --green-dark:#2F4529; --green-tint:#E7EDE2; --gold:#C9920A; --line:#E3DCCC; --shadow-sm:0 1px 2px rgba(30,27,22,.06),0 6px 18px -8px rgba(30,27,22,.10); --shadow-md:0 2px 4px rgba(30,27,22,.06),0 18px 44px -16px rgba(30,27,22,.18); font-family:"DM Sans",system-ui,sans-serif; color:var(--ink); background:var(--cream); }
      .landing-page *,.landing-header *,.landing-footer *{box-sizing:border-box}
      .landing-page h1,.landing-page h2,.landing-page h3,.landing-logo-name,.landing-clock,.landing-mini-serif{font-family:"Lora",Georgia,serif;font-weight:600;letter-spacing:0}
      .landing-page h1{font-size:clamp(2.9rem,5.6vw,4.4rem);line-height:1.06;margin:1.4rem 0 1.2rem}
      .landing-page h2{font-size:clamp(2rem,3.6vw,2.7rem);line-height:1.12}
      .landing-page h3{font-size:1.2rem;font-weight:700}
      .landing-wrap{max-width:1180px;margin:0 auto;padding:0 1.5rem}
      .landing-skip{position:absolute;left:-9999px;top:0;background:#1E1B16;color:#F7F3EB;padding:.75rem 1.25rem;z-index:200;border-radius:0 0 12px 0}.landing-skip:focus{left:0}
      .landing-header{position:sticky;top:0;z-index:100;background:rgba(247,243,235,.9);backdrop-filter:blur(10px)}
      .landing-nav{display:flex;align-items:center;justify-content:space-between;min-height:84px;gap:1rem}
      .landing-logo{display:flex;align-items:center;gap:.6rem;text-decoration:none;color:var(--ink)}
      .landing-logo-mark{width:38px;height:38px;border-radius:50%;background:var(--green-dark);display:grid;place-items:center;color:var(--cream);font-family:"Lora",serif;font-weight:700;font-size:1.3rem;line-height:1}
      .landing-logo-name{font-size:1.55rem;color:var(--ink)}
      .landing-nav-links{display:flex;gap:2.2rem;list-style:none;margin:0;padding:0}.landing-nav-links a{text-decoration:none;color:var(--ink);font-weight:700;font-size:1rem}
      .landing-btn{display:inline-flex;align-items:center;justify-content:center;gap:.6rem;min-height:54px;padding:.85rem 1.7rem;border-radius:999px;border:0;cursor:pointer;font-size:1.0325rem;font-weight:700;text-decoration:none;transition:background-color .15s ease,transform .12s ease}.landing-btn:active{transform:translateY(1px)}.landing-btn-dark{background:var(--ink);color:var(--cream)}.landing-btn-dark:hover{background:#000}.landing-btn:disabled{opacity:.65;cursor:wait}
      .landing-hero{padding:3.5rem 0 5rem;position:relative;overflow:hidden}.landing-hero-bg{position:absolute;right:-8%;top:-10%;width:52%;height:120%;background:radial-gradient(closest-side at 70% 30%,rgba(104,134,86,.22),transparent 70%),radial-gradient(closest-side at 40% 75%,rgba(180,168,132,.28),transparent 70%);filter:blur(40px);pointer-events:none}
      .landing-hero-grid{display:grid;grid-template-columns:1.02fr .98fr;gap:3rem;align-items:center;position:relative}.landing-pill{display:inline-flex;align-items:center;gap:.55rem;background:var(--cream-2);border:1px solid var(--line);border-radius:999px;padding:.45rem 1.1rem;font-size:.8rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-soft)}.landing-pill:before{content:"";width:8px;height:8px;border-radius:50%;background:var(--gold)}
      .landing-sub{font-size:1.22rem;color:var(--ink-soft);max-width:26em;margin-bottom:1.9rem}.landing-assure{display:flex;align-items:flex-start;gap:.7rem;margin-top:1.9rem}.landing-assure svg{flex:none;margin-top:.2rem}.landing-assure p{font-size:.975rem;color:var(--ink-soft);line-height:1.5;margin:0}.landing-assure strong{color:var(--ink);display:block;font-size:1.02rem}
      .landing-hero-visual{position:relative;display:flex;justify-content:center;min-height:620px}.landing-phone{width:330px;background:#17150F;border-radius:48px;padding:12px;box-shadow:0 40px 80px -30px rgba(30,27,22,.45),0 2px 0 rgba(255,255,255,.25) inset;position:relative;z-index:2}.landing-screen{background:var(--cream);border-radius:38px;overflow:hidden;padding:14px 16px 20px;min-height:596px;display:flex;flex-direction:column}
      .landing-statusbar{display:flex;justify-content:space-between;align-items:center;font-size:.8rem;font-weight:800;padding:2px 8px 10px}.landing-notch{width:96px;height:26px;background:#17150F;border-radius:999px}.landing-icons{letter-spacing:.1em}.landing-greeting{display:flex;justify-content:space-between;padding:4px;color:var(--ink-soft);font-size:.9rem}.landing-clock{font-size:1.7rem;line-height:1.2;padding:6px 4px 16px;margin:0}
      .landing-input-pill{display:flex;align-items:center;justify-content:space-between;gap:.6rem;background:var(--card);border:1px solid var(--line);border-radius:999px;padding:.7rem 1rem;font-size:.9rem;color:var(--ink-soft);box-shadow:var(--shadow-sm)}.landing-go{width:26px;height:26px;border-radius:50%;background:var(--ink);color:var(--cream);display:grid;place-items:center;font-size:.8rem;flex:none}
      .landing-tasklist{background:var(--card);border:1px solid var(--line);border-radius:18px;margin-top:12px;box-shadow:var(--shadow-sm)}.landing-task{display:flex;align-items:center;gap:.7rem;padding:.85rem 1rem}.landing-task+.landing-task{border-top:1px solid var(--line)}.landing-tick{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;font-size:.75rem;flex:none}.landing-tick.done{background:var(--green-tint);color:var(--green-dark)}.landing-tick.wait{background:#F6EAD1;color:var(--gold)}.landing-task-name{font-weight:800;font-size:.92rem;flex:1;line-height:1.3}.landing-task-time{font-size:.75rem;color:var(--ink-soft)}
      .landing-app-btn{display:flex;align-items:center;justify-content:center;gap:.5rem;border-radius:16px;padding:1rem;margin-top:12px;font-weight:800;font-size:1rem}.landing-app-btn.primary{background:var(--green);color:#fff;box-shadow:var(--shadow-sm)}.landing-app-btn.soft{background:#F3E8D3;color:var(--ink)}.landing-screen-foot{display:flex;justify-content:space-between;font-size:.8rem;color:var(--ink-soft);padding:14px 6px 0;margin-top:auto}
      .landing-float{position:absolute;z-index:3;width:70px;height:70px;border-radius:20px;background:rgba(255,255,255,.85);backdrop-filter:blur(6px);box-shadow:var(--shadow-md);display:grid;place-items:center;font-size:1.9rem}.landing-float-one{left:2%;top:36%}.landing-float-two{right:4%;top:14%}.landing-float-three{right:1%;bottom:20%}.landing-dash{position:absolute;left:-2%;top:52%;z-index:1;opacity:.5}
      .landing-strip{padding:0 0 4.5rem}.landing-strip-inner{background:var(--cream-2);border-radius:28px;display:grid;grid-template-columns:repeat(4,1fr);gap:2rem;padding:2.4rem 2.6rem}.landing-strip-item{display:flex;gap:.9rem;align-items:flex-start}.landing-strip-icon{width:46px;height:46px;border-radius:50%;background:var(--card);display:grid;place-items:center;box-shadow:var(--shadow-sm);color:var(--green-dark);flex:none}.landing-strip-item strong{display:block;font-size:1rem;margin-bottom:.15rem}.landing-strip-item p{font-size:.9rem;color:var(--ink-soft);line-height:1.5;margin:0}
      .landing-how{padding:1.5rem 0 5rem}.landing-lede{font-size:1.15rem;color:var(--ink-soft);margin-top:.6rem}.landing-flow{display:grid;grid-template-columns:1fr 34px 1fr 34px 1fr 34px 1fr;gap:.6rem;margin-top:2.8rem;align-items:start}.landing-flow-arrow{align-self:center;justify-self:center;color:var(--ink-soft);font-size:1.3rem;margin-top:220px}.landing-step-head{display:flex;gap:.7rem;align-items:flex-start;min-height:118px}.landing-step-num{width:30px;height:30px;border-radius:50%;background:var(--green);color:#fff;display:grid;place-items:center;font-weight:800;font-size:.9rem;flex:none}.landing-step-head p{font-size:.92rem;color:var(--ink-soft);line-height:1.5;margin:.25rem 0 0}
      .landing-mini{background:var(--card);border:1px solid var(--line);border-radius:22px;box-shadow:var(--shadow-md);padding:1.1rem;font-size:.8rem;min-height:330px}.landing-mini-soft,.landing-back{font-size:.72rem;color:var(--ink-soft);margin:0 0 .5rem}.landing-mini-serif{font-size:1.05rem;line-height:1.25;margin:0 0 .5rem}.mini-input{padding:.5rem .8rem;font-size:.72rem}.mini-primary{padding:.7rem;font-size:.8rem;border-radius:12px}.landing-mini-eyebrow{font-size:.62rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-soft);margin-bottom:.4rem}.landing-badge{display:inline-block;background:#F6EAD1;color:#8a6407;border-radius:999px;padding:.15rem .6rem;font-size:.6rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.landing-mini-block{border-top:1px solid var(--line);padding:.6rem 0;color:var(--ink-soft);line-height:1.45}.landing-mini-block b{color:var(--ink)}.landing-mini-block.plain{border-top:0;padding-top:0}.landing-mini-actions{display:flex;gap:.5rem}.landing-mini-actions span{flex:1;text-align:center;border-radius:12px;padding:.55rem;font-weight:800}.landing-mini-actions .yes{background:var(--green);color:#fff}.landing-mini-actions .no{background:var(--cream-2)}.landing-mini-link{display:block;text-align:center;font-size:.72rem;color:var(--ink-soft);margin-top:.55rem;text-decoration:underline}
      .landing-mini-task{display:flex;align-items:center;gap:.55rem;padding:.55rem 0;border-top:1px solid var(--line)}.landing-mini-task:first-of-type{border-top:0}.landing-mini-task p{font-weight:800;font-size:.82rem;margin:0}.landing-mini-task small{font-size:.68rem;color:var(--ink-soft)}.landing-mini-task div{flex:1}.landing-mini-task em{font-style:normal;font-size:.62rem;font-weight:800;border-radius:999px;padding:.14rem .5rem;background:#F6EAD1;color:#8a6407}.landing-mini-task em.done{background:var(--green-tint);color:var(--green-dark)}.landing-row-btns{display:flex;gap:.4rem;margin:.15rem 0 .35rem 1.55rem}.landing-row-btns span{background:var(--cream-2);border-radius:8px;padding:.28rem .6rem;font-size:.66rem;font-weight:800}.landing-row-btns .filled{background:var(--ink);color:var(--cream)}.landing-mini-top{display:flex;justify-content:space-between;font-size:.72rem;margin-bottom:.4rem}.landing-mini-top span{color:var(--ink-soft)}.landing-heart{display:flex;align-items:center;justify-content:center;gap:.4rem;background:#F9EDEA;color:#9C4433;border-radius:12px;padding:.6rem;margin-top:.7rem;font-weight:800;font-size:.78rem}
      .landing-care,.landing-pilot,.landing-faq{padding:0 0 5rem}.landing-care-inner{background:var(--green-dark);color:var(--cream);border-radius:28px;padding:clamp(2.2rem,5vw,4rem);display:grid;grid-template-columns:1.05fr .95fr;gap:3rem;align-items:center}.landing-care-inner h2{color:#fff;margin:.5rem 0 1rem}.landing-eyebrow{color:#D9C98A;font-size:.78rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase}.landing-care-inner p{color:#DCE4D4;font-size:1.1rem;max-width:30em}.landing-care-list{list-style:none;margin:0;padding:0}.landing-care-list li{border-top:1px solid rgba(247,243,235,.18);padding:1.05rem 0;display:flex;gap:.8rem;color:#DCE4D4;font-size:1rem;line-height:1.55}.landing-care-list li:first-child{border-top:0;padding-top:0}.landing-care-list b{color:#fff;display:block;font-size:1.05rem}.landing-care-list svg{color:#AEC69B;flex:none;margin-top:.15rem}
      .landing-pilot-inner{background:var(--cream-2);border-radius:28px;overflow:hidden;display:grid;grid-template-columns:1fr 1.15fr .85fr}.landing-pilot-copy{padding:clamp(2rem,4vw,3.2rem)}.landing-pilot-copy h2{margin-bottom:1rem}.landing-pilot-copy p{color:var(--ink-soft);font-size:1.05rem}.landing-checks{list-style:none;margin:1.6rem 0 0;padding:0}.landing-checks li{display:flex;gap:.7rem;align-items:center;padding:.5rem 0;font-weight:700;font-size:1rem}.landing-pilot-form{padding:clamp(2rem,4vw,3.2rem) 1rem clamp(2rem,4vw,3.2rem) 0}.landing-form-card{background:#fff;border-radius:22px;box-shadow:var(--shadow-md);padding:1.8rem}.landing-form-card h3{font-size:1.35rem;margin-bottom:.2rem}.landing-soon{font-size:.92rem;color:var(--ink-soft);margin-bottom:1.2rem}
      .landing-f-grid{display:grid;grid-template-columns:1fr 1fr;gap:.9rem}.landing-field label{display:block;font-weight:700;font-size:.86rem;margin-bottom:.35rem}.landing-field label span{font-weight:400;color:var(--ink-soft)}.landing-field input,.landing-field select{width:100%;font:inherit;font-size:1rem;color:var(--ink);background:var(--cream);border:1.5px solid var(--line);border-radius:12px;padding:.75rem .9rem;min-height:52px}.landing-submit{width:100%;margin-top:1rem}.landing-f-privacy{display:flex;gap:.5rem;align-items:center;font-size:.82rem;color:var(--ink-soft);margin-top:.9rem}.landing-form-status{margin-top:1rem;padding:.9rem 1.1rem;border-radius:12px;font-weight:700;font-size:.95rem}.landing-form-status.ok{background:var(--green-tint);color:var(--green-dark)}.landing-form-status.err{background:#FBEDED;color:#8C2B2B}
      .landing-pilot-photo{position:relative;min-height:100%;background:radial-gradient(closest-side at 65% 35%,rgba(217,201,138,.55),transparent 75%),radial-gradient(closest-side at 30% 80%,rgba(104,134,86,.4),transparent 70%),linear-gradient(160deg,#E9DFC9,#CBD3BC);overflow:hidden}.landing-photo-person{position:absolute;inset:18% 8% 0 18%}.landing-photo-head{position:absolute;right:24%;top:4%;width:88px;height:88px;border-radius:50%;background:linear-gradient(145deg,#D2A06E,#8F6B4E);box-shadow:0 16px 36px rgba(30,27,22,.18)}.landing-photo-body{position:absolute;right:6%;bottom:-4%;width:210px;height:250px;border-radius:110px 110px 0 0;background:linear-gradient(145deg,#E7D8BE,#B6A37F)}.landing-photo-phone{position:absolute;right:50%;bottom:18%;width:54px;height:92px;border-radius:12px;background:#2E271E;transform:rotate(-10deg);box-shadow:0 20px 30px rgba(30,27,22,.22)}
      .landing-faq-wrap{max-width:780px}.landing-faq h2{margin-bottom:1.8rem}.landing-faq details{background:#fff;border:1px solid var(--line);border-radius:16px;margin-bottom:.9rem;box-shadow:var(--shadow-sm)}.landing-faq summary{cursor:pointer;list-style:none;display:flex;justify-content:space-between;gap:1rem;padding:1.15rem 1.4rem;font-weight:800;font-size:1.05rem;min-height:56px}.landing-faq summary::-webkit-details-marker{display:none}.landing-faq summary:after{content:"+";font-family:"Lora",serif;font-size:1.5rem;color:var(--green);line-height:1}.landing-faq details[open] summary:after{content:"-"}.landing-faq details p{padding:0 1.4rem 1.25rem;color:var(--ink-soft);font-size:1rem;max-width:60ch;margin:0}
      .landing-footer{border-top:1px solid var(--line);padding:2.6rem 0 3rem;background:var(--cream)}.landing-footer .landing-wrap{display:flex;flex-wrap:wrap;gap:1.4rem;justify-content:space-between;align-items:baseline}.landing-footer p{font-size:.9rem;color:var(--ink-soft);max-width:54ch}.landing-footer a{color:var(--green-dark)}
      @media (prefers-reduced-motion:reduce){.landing-btn,.landing-arr{transition:none!important}}
      @media (max-width:1060px){.landing-flow{grid-template-columns:1fr 1fr;gap:1.6rem}.landing-flow-arrow{display:none}.landing-step-head{min-height:0}.landing-mini{min-height:0}}
      @media (max-width:1020px){.landing-pilot-inner{grid-template-columns:1fr 1.2fr}.landing-pilot-photo{display:none}.landing-pilot-form{padding-right:clamp(2rem,4vw,3.2rem)}}
      @media (max-width:980px){.landing-hero-grid{grid-template-columns:1fr}.landing-hero-visual{min-height:auto;margin-top:1rem}.landing-float{display:none}.landing-hero-bg{display:none}.landing-strip-inner{grid-template-columns:1fr 1fr}}
      @media (max-width:900px){.landing-care-inner{grid-template-columns:1fr}.landing-nav-links{display:none}}
      @media (max-width:760px){.landing-pilot-inner{grid-template-columns:1fr}.landing-pilot-form{padding:0 clamp(1.4rem,4vw,3.2rem) clamp(2rem,4vw,3.2rem)}.landing-f-grid{grid-template-columns:1fr}}
      @media (max-width:640px){.landing-flow{grid-template-columns:1fr}.landing-strip-inner{grid-template-columns:1fr}.landing-page h1{font-size:3rem}.landing-phone{width:min(330px,100%)}}
    `}</style>
  )
}
