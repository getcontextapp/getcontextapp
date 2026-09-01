export type AccountMode = 'solo' | 'shared'

export function accountModeForMembers(members: Array<{ role: string }>): AccountMode {
  return members.some(member => member.role === 'care_partner') ? 'shared' : 'solo'
}
