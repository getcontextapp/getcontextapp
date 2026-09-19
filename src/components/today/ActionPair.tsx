'use client'

type ActionPairProps = {
  primary: { label: string; onClick: () => void; disabled?: boolean }
  secondary: { label: string; onClick: () => void; disabled?: boolean }
}

export default function ActionPair({ primary, secondary }: ActionPairProps) {
  return (
    <div className="mt-3 grid grid-cols-2 gap-[10px]">
      <button type="button" onClick={primary.onClick} disabled={primary.disabled}
        className="min-h-[52px] rounded-[14px] bg-warm-700 px-3 text-[17px] font-semibold leading-none text-cream-50 disabled:opacity-60 focus:outline-none focus:ring-4 focus:ring-sage-300/60">
        {primary.label}
      </button>
      <button type="button" onClick={secondary.onClick} disabled={secondary.disabled}
        className="min-h-[52px] rounded-[14px] border-[1.5px] border-cream-300 bg-white px-3 text-[17px] font-semibold leading-none text-warm-700 disabled:opacity-60 focus:outline-none focus:ring-4 focus:ring-sage-300/60">
        {secondary.label}
      </button>
    </div>
  )
}
