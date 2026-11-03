export function StatusBadge({ status }) {
  return <span className={`badge ${status}`}>{status.replace('_', ' ')}</span>;
}

export function PriorityBadge({ priority }) {
  return <span className={`badge ${priority}`}>{priority}</span>;
}
