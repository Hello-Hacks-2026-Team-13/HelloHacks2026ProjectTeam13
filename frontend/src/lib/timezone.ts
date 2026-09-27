export function formatTimezone(timezone: string) {
  return timezone.replace(/_/g, " ");
}

export function parseTimezone(timezone: string) {
  return timezone.replace(/ /g, "_");
}
