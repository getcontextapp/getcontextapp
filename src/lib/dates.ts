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
  return getUtcRangeForLocalDateKey(targetKey, timeZone)
}

export function getUtcRangeForLocalDateKey(targetKey: string, timeZone?: string | null) {
  function findStart(dateKey: string) {
    const targetUtc = Date.UTC(
      Number(dateKey.slice(0, 4)),
      Number(dateKey.slice(5, 7)) - 1,
      Number(dateKey.slice(8, 10)),
    )
    for (let minutes = -14 * 60; minutes <= 14 * 60; minutes += 15) {
      const candidate = new Date(targetUtc + minutes * 60 * 1000)
      if (getLocalDateKey(candidate, timeZone) === dateKey) return candidate
    }
    return null
  }

  const nextDate = new Date(`${targetKey}T12:00:00Z`)
  nextDate.setUTCDate(nextDate.getUTCDate() + 1)
  const nextKey = nextDate.toISOString().slice(0, 10)
  const start = findStart(targetKey) ?? new Date(`${targetKey}T00:00:00Z`)
  const end = findStart(nextKey) ?? new Date(`${nextKey}T00:00:00Z`)

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  }
}
