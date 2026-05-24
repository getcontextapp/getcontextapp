export function getLocalDateKey(date: Date, timeZone?: string | null) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timeZone || undefined,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })

  return formatter.format(date)
}

export function getUtcRangeForLocalDay(date: Date, timeZone?: string | null) {
  const targetKey = getLocalDateKey(date, timeZone)
  const targetUtc = Date.UTC(
    Number(targetKey.slice(0, 4)),
    Number(targetKey.slice(5, 7)) - 1,
    Number(targetKey.slice(8, 10)),
  )

  let start: Date | null = null
  for (let hour = -14; hour <= 14; hour++) {
    const candidate = new Date(targetUtc + hour * 60 * 60 * 1000)
    if (getLocalDateKey(candidate, timeZone) === targetKey) {
      start = candidate
      break
    }
  }

  const end = start ? new Date(start.getTime()) : new Date(date)
  if (!start) end.setHours(0, 0, 0, 0)
  end.setUTCDate(end.getUTCDate() + 1)

  return {
    start: (start ?? end).toISOString(),
    end: end.toISOString(),
  }
}
