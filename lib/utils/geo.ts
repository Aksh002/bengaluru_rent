export const BENGALURU_CENTER = { lat: 12.9716, lng: 77.5946 };

export function roundCoord(value: number) {
  return Math.round(value * 10000) / 10000;
}

export function pinAgeLabel(createdAt: string) {
  const created = new Date(createdAt).getTime();
  const diffMs = Date.now() - created;
  const diffDays = Math.max(0, Math.floor(diffMs / 86400000));

  if (diffDays === 0) return "today";
  if (diffDays === 1) return "1 day ago";
  return `${diffDays} days ago`;
}
