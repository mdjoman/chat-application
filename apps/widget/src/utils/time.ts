/**
 * Format a UTC timestamp into the current viewer's local time.
 * Uses Intl.DateTimeFormat with the browser's resolved timezone
 * so recipients in other regions see their own local clock.
 */
export function formatLocalTime(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: undefined,
  }).format(d);
}

export function formatLocalDateTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate();

  const time = new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);

  if (sameDay) return time;
  if (isYesterday) return `Yesterday ${time}`;

  const date = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(d);
  return `${date} ${time}`;
}

/** Format duration in seconds → "m:ss" */
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Human-size helper */
export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
