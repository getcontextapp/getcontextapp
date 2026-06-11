import Link from 'next/link'

interface Props {
  href: string
  role: 'mci_user' | 'care_partner'
}

export default function WeeklySummaryCard({ href, role }: Props) {
  return (
    <Link
      href={href}
      className="group block rounded-card border border-sage-200 bg-gradient-to-br from-sage-50 to-cream-50 p-4 shadow-card
                 focus:outline-none focus-visible:ring-4 focus-visible:ring-sage-200"
    >
      <div className="flex items-center gap-3">
        <span
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-sage-100 text-2xl"
          aria-hidden="true"
        >
          🌿
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold text-warm-900">View weekly summary</span>
          <span className="mt-0.5 block text-sm leading-5 text-warm-500">
            {role === 'care_partner'
              ? 'See the completed week at a glance'
              : 'See how your completed week went'}
          </span>
        </span>
        <span className="text-2xl text-sage-500 transition-transform group-active:translate-x-1" aria-hidden="true">
          ›
        </span>
      </div>
    </Link>
  )
}
