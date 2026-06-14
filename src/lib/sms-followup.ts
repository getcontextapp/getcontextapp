export function shouldSendMorningFollowup(
  localHour: number,
  hasEngagement: boolean,
  alreadySent: boolean,
) {
  return localHour >= 10 && localHour < 12 && !hasEngagement && !alreadySent
}

export function shouldSendCarePartnerAlert(
  localHour: number,
  hasEngagement: boolean,
  alreadySent: boolean,
) {
  return localHour >= 12 && !hasEngagement && !alreadySent
}
