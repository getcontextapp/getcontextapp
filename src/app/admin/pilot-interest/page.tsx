import { requireAnalyticsAdmin } from '@/lib/admin'
import { loadPilotInterest } from '@/lib/pilot-interest-server'
import { PILOT_INTEREST_ROLE_LABELS, type PilotInterestRole } from '@/lib/pilot-interest'

export const dynamic = 'force-dynamic'

function formatTime(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

export default async function PilotInterestPage() {
  await requireAnalyticsAdmin('/admin/pilot-interest')
  const data = await loadPilotInterest()
  const counts = data.rows.reduce<Record<PilotInterestRole, number>>((result, row) => {
    result[row.role] += 1
    return result
  }, { person_with_memory_changes: 0, care_partner: 0, clinician: 0 })

  return (
    <main className="interest-shell">
      <header className="interest-hero">
        <div>
          <p>Context admin</p>
          <h1>Pilot interest</h1>
          <span>People who submitted the public landing-page form.</span>
        </div>
        <nav aria-label="Admin menu">
          <a href="/admin/analytics">Pilot monitoring</a>
          <a className="active" href="/admin/pilot-interest" aria-current="page">Pilot interest</a>
        </nav>
      </header>

      {data.error ? (
        <section className="interest-error">
          <h2>The interest list is not available yet</h2>
          <p>{data.error}</p>
        </section>
      ) : (
        <>
          <section className="interest-stats" aria-label="Pilot interest summary">
            <article><span>Total interest</span><strong>{data.rows.length}</strong></article>
            <article><span>People with memory changes</span><strong>{counts.person_with_memory_changes}</strong></article>
            <article><span>Care partners</span><strong>{counts.care_partner}</strong></article>
            <article><span>Clinicians/program staff</span><strong>{counts.clinician}</strong></article>
          </section>

          <section className="interest-panel">
            <div className="panel-heading">
              <div>
                <p>Contact list</p>
                <h2>{data.rows.length === 0 ? 'No one has joined the interest list yet' : `${data.rows.length} ${data.rows.length === 1 ? 'person' : 'people'}`}</h2>
              </div>
              <span>Updated {formatTime(data.generatedAt)}</span>
            </div>

            {data.rows.length > 0 && (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Role</th>
                      <th>Contact</th>
                      <th>Submitted</th>
                      <th>Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map(row => (
                      <tr key={row.id}>
                        <th>{row.name}</th>
                        <td>{PILOT_INTEREST_ROLE_LABELS[row.role]}</td>
                        <td>
                          <a href={`mailto:${row.email}`}>{row.email}</a>
                          {row.phone ? <a href={`tel:${row.phone}`}>{row.phone}</a> : <span>No phone provided</span>}
                        </td>
                        <td>{formatTime(row.created_at)}</td>
                        <td>{row.source.replaceAll('_', ' ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      <style>{`
        .interest-shell{min-height:100vh;background:#f8f4ea;color:#27211a;padding:32px;font-family:var(--font-sans,system-ui,sans-serif)}
        .interest-hero,.interest-stats,.interest-panel,.interest-error{max-width:1180px;margin:0 auto 22px}
        .interest-hero{display:flex;justify-content:space-between;align-items:flex-end;gap:24px}
        .interest-hero p,.panel-heading p{margin:0;color:#4b7440;font-size:.78rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
        .interest-hero h1{font-family:var(--font-serif,Georgia,serif);font-size:clamp(2.3rem,5vw,4.4rem);line-height:1;margin:8px 0}
        .interest-hero span,.panel-heading span{color:#817669}
        nav{display:flex;gap:10px;flex-wrap:wrap}
        nav a{min-height:46px;border-radius:999px;border:1px solid #ddceb8;background:#fffdfa;color:#463b2d;padding:0 18px;font-weight:800;text-decoration:none;display:inline-grid;place-items:center}
        nav a.active{background:#3f6b36;color:#fff;border-color:#3f6b36}
        .interest-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}
        .interest-stats article,.interest-panel,.interest-error{background:#fffdfa;border:1px solid #ead8b6;border-radius:24px;box-shadow:0 14px 36px rgba(44,35,24,.07);padding:24px}
        .interest-stats span{color:#817669;font-weight:800}
        .interest-stats strong{display:block;font-size:2rem;margin-top:5px}
        .panel-heading{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;margin-bottom:22px}
        .panel-heading h2,.interest-error h2{margin:5px 0 0;font-family:var(--font-serif,Georgia,serif);font-size:1.8rem}
        .table-wrap{overflow-x:auto}
        table{width:100%;border-collapse:collapse;min-width:820px}
        th,td{border-bottom:1px solid #eee2d1;padding:15px;text-align:left;vertical-align:top}
        tbody th{font-size:1rem}
        td a,td span{display:block;margin-bottom:5px}
        td a{color:#3f6b36;font-weight:800}
        td span{color:#817669}
        .interest-error{background:#fff7ed;border-color:#c9763e}
        .interest-error p{margin-bottom:0;color:#6f6558}
        @media(max-width:820px){.interest-shell{padding:18px}.interest-hero,.panel-heading{display:grid;align-items:start}.interest-stats{grid-template-columns:repeat(2,minmax(0,1fr))}}
        @media(max-width:520px){.interest-stats{grid-template-columns:1fr}}
      `}</style>
    </main>
  )
}
