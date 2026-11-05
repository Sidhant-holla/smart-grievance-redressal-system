# Team split and Git workflow

| Member | SRN |
|---|---|
| Sidhant Holla | PES1UG24AM466 |
| Krishna Tejas Voruganti | PES1UG24AM436 |

## Work by phase

| Phase | Sidhant Holla | Krishna Tejas Voruganti |
|---|---|---|
| 1. Foundation | Next.js project, database connection pool, authentication flow | PostgreSQL and pgvector setup, schema with constraints and indexes |
| 2. Core workflows | Citizen submission form, staff portal, API routes for tickets | Embedding model integration, SQL function for semantic duplicate checks |
| 3. Database logic | UI for state transitions, role-based actions in the UI | Escalation triggers, transaction blocks with row-level locks for assignment |
| 4. Dashboards | Department head and admin dashboard UI, wired to the analytics endpoints | SQL views and aggregate queries behind the dashboards |

Done together: ER diagram and normalisation decisions, escalation rules, test data and testing, documentation.

## Ownership by file

| Area | Files | Owner |
|---|---|---|
| App setup, connection pool | `next.config.js`, `lib/db.js`, `lib/api.js` | Sidhant |
| Authentication | `lib/auth.js`, `lib/users.js`, `middleware.js`, `app/api/auth/` | Sidhant |
| Ticket and admin APIs | `app/api/tickets/`, `app/api/users/`, `app/api/departments/`, `app/api/staff/` | Sidhant |
| Pages and components | `app/citizen/`, `app/staff/`, `app/head/`, `app/admin/`, `app/tickets/`, `components/` | Sidhant |
| Schema | `db/01_schema.sql` | Krishna |
| Views and dashboard queries | `db/02_views.sql`, `app/api/dashboard/` | Krishna |
| Triggers and procedures | `db/03_functions_triggers.sql` | Krishna |
| Embeddings and similarity | `lib/embeddings.js`, `app/api/tickets/check/` | Krishna |
| Escalation | `lib/escalation.js` | Krishna |
| Test data and tests | `scripts/seed-data.js`, `scripts/test-db.js`, `scripts/test-api.js` | Both |
| Documentation | `docs/`, `README.md` | Both |

## Git workflow

Each member commits from their own GitHub account, so the history shows who did what.

```bash
git pull
# make your changes
git add <files>
git commit -m "Short description of the change"
git push
```

Make sure your name and email are set first:

```bash
git config user.name "Your Name"
git config user.email "the-email-on-your-github-account"
```

Check who has committed with `git shortlog -sn`.
