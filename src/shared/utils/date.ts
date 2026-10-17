/**
 * Date utility helper for reliable calendar date handling.
 *
 * Avoids timezone drift issues where UTC-based `.toISOString().split('T')[0]`
 * returns yesterday's calendar date for Indian Standard Time (UTC+05:30)
 * transactions performed between 12:00 AM midnight and 05:30 AM.
 */

/**
 * Returns today's local date string formatted as 'YYYY-MM-DD'.
 */
export function getLocalDateString(input?: Date | string | number | null): string {
  if (!input) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
  }

  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
