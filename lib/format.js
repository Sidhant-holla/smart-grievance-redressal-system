// Date helpers used by the pages

// Shows a date like "03 Nov, 02:30 pm". Dates are stored in the database with their time zone.
export function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// "3h ago", "in 2d" etc.
export function timeFromNow(value) {
  if (!value) return '-';
  const diffMs = new Date(value).getTime() - Date.now();
  const hours = Math.round(Math.abs(diffMs) / 3600000);
  const text = hours < 1 ? 'less than 1h' : hours < 48 ? `${hours}h` : `${Math.round(hours / 24)}d`;
  return diffMs < 0 ? `${text} ago` : `in ${text}`;
}
