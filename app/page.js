import Link from 'next/link';

// Landing page. It has no database calls. Logged in users are redirected away by middleware.js.
export default function HomePage() {
  return (
    <>
      <div className="hero">
        <h1>Smart Grievance Redressal System</h1>
        <p>
          Raise a complaint once and track it until it is fixed. Tickets are routed to the right department, similar
          complaints are detected automatically, and anything that is not resolved on time is escalated to the
          department head.
        </p>
        <div className="row" style={{ justifyContent: 'center' }}>
          <Link href="/login" className="btn">
            Login
          </Link>
          <Link href="/register" className="btn secondary">
            Create an account
          </Link>
        </div>
      </div>

      <div className="features">
        <div className="card">
          <h3>Enforced workflow</h3>
          <p className="muted">
            Open, Assigned, In Progress, Resolved, Closed. Status changes are validated inside the database, so no step
            can be skipped.
          </p>
        </div>
        <div className="card">
          <h3>Automatic escalation</h3>
          <p className="muted">Every department has an SLA. Overdue tickets are escalated and the head is notified.</p>
        </div>
        <div className="card">
          <h3>Duplicate detection</h3>
          <p className="muted">
            Complaints are compared by meaning using vector embeddings, so the same issue in different words is caught.
          </p>
        </div>
        <div className="card">
          <h3>Department dashboards</h3>
          <p className="muted">Resolution time, SLA compliance, workload and ratings for every department.</p>
        </div>
      </div>
    </>
  );
}
