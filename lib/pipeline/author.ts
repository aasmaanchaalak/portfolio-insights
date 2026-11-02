// The team-member name to record as author/owner for a signed-in user: their
// exact name, else their first name, else the first team member.
export function resolveAuthor(userName: string | undefined, teamMembers: string[]): string {
  if (!userName || teamMembers.length === 0) return teamMembers[0] || '';
  const lower = userName.toLowerCase();
  // Exact match first
  const exact = teamMembers.find(m => m.toLowerCase() === lower);
  if (exact) return exact;
  // First-word match (e.g. "Aditya Agarwal" → "Aditya")
  const firstName = lower.split(' ')[0];
  const partial = teamMembers.find(m => m.toLowerCase() === firstName || lower.startsWith(m.toLowerCase()));
  return partial || teamMembers[0];
}
