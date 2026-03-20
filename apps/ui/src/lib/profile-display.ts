const MAX_NAME_LENGTH = 40;

/**
 * Get the display name for a profile.
 * Prefers the explicit `name` field; falls back to extracting from the ID.
 */
export function profileDisplayName(profileId: string, name?: string): string {
  if (name) return name.slice(0, MAX_NAME_LENGTH);
  // Fallback: extract from ID — "github.com/.../spend@0.4" → "Spend"
  const lastSlash = profileId.lastIndexOf('/');
  const segment = lastSlash >= 0 ? profileId.slice(lastSlash + 1) : profileId;
  const atIndex = segment.indexOf('@');
  const raw = atIndex >= 0 ? segment.slice(0, atIndex) : segment;
  return (raw.charAt(0).toUpperCase() + raw.slice(1)).slice(0, MAX_NAME_LENGTH);
}
