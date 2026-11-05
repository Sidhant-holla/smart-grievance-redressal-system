# Demo guide and viva preparation

## Before the demo

1. Start PostgreSQL, then run `npm run dev` from the project folder.
2. Open http://localhost:3000 on the laptop itself. The app only listens on this laptop.
3. For clean data, run `npm run db:setup` and `npm run db:seed` first. This resets all tickets.
4. Open a terminal with `psql -U grievance_app -h localhost -d grievance_db`.
5. Keep [REQUIREMENTS_CHECKLIST.md](REQUIREMENTS_CHECKLIST.md) open for "where is X".

Demo accounts use the password `Password@123`.

| Role | Email |
|---|---|
| Citizen | `ananya@student.campus.edu` |
| Staff | `ravi.it@campus.edu` |
| Department head | `head.it@campus.edu` |
| Admin | `admin@campus.edu` |

## Demo flow

This follows the items in section 16 of the brief.

| # | Show | How |
|---|---|---|
| 1 | Problem and motivation | Complaints are only recorded today, with no enforced process. Open [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) |
| 2 | ER diagram and design | `docs/diagrams/er_diagram.png`. Explain ISA, the weak entity and why status is on the ticket and in history |
| 3 | Relational schema | `docs/diagrams/relational_schema.png`. Point out the M:N table and the circular FK |
| 4 | Database implementation | Open `db/01_schema.sql`, then `db/03_functions_triggers.sql` at the state machine trigger |
| 5 | Duplicate detection | As Ananya: *Raise Complaint*, type "Hostel wifi keeps disconnecting", click *Check for similar complaints*. Similar tickets appear and IT Services is pre-selected |
| 6 | Semantic vs keyword search | As admin: *All Tickets*, search "elevator" in both modes. Semantic also finds "Lift" |
| 7 | Workflow in the UI | As Ravi: open an assigned ticket, *Start work*, then *Mark as resolved*. As the citizen: confirm or reopen |
| 8 | Workflow enforced by the database | Run the invalid update from `db/05_viva_live_demo.sql` and show the error |
| 9 | Escalation | Run that section of the viva script, or press *Run escalation check now*. Show the head's notification |
| 10 | Dashboards | Head and admin dashboards. Explain SLA %, and how the HAVING report works |
| 11 | Concurrency | `npm run db:test`, or the two-terminal steps in the viva script |
| 12 | Tests | Open [TEST_RESULTS_DB.md](TEST_RESULTS_DB.md) and [TEST_RESULTS_API.md](TEST_RESULTS_API.md) |
| 13 | Individual contribution | [TEAM_SPLIT.md](TEAM_SPLIT.md) |

## Likely viva questions

**Why PostgreSQL with pgvector and not a separate vector database?**
The vectors are always used with relational filters, and storing them together lets one transaction save the ticket and its vector. See [DATABASE_DESIGN.md](DATABASE_DESIGN.md) section 1.

**Why is status on the ticket when there is also a history table?**
Dashboards filter on current status constantly. Reading it from history needs a "latest row per ticket" subquery. A trigger writes history, so the two cannot disagree.

**How is the workflow enforced?**
The `ticket_before_update` trigger checks every status change against `status_transitions`. Even a direct SQL update cannot skip a step.

**Triggers run on events. How does a ticket escalate when nobody touches it?**
A trigger cannot fire on time passing. The app calls `escalate_overdue_tickets()` before loading queues and dashboards. That UPDATE fires the triggers, which do the history and notifications. In production we would use `pg_cron`.

**What happens if two staff claim one ticket at the same moment?**
`claim_ticket` uses `SELECT ... FOR UPDATE`. The second transaction waits for the lock, then sees the ticket is already assigned and fails with a clear error.

**What is a lost update?**
Two transactions read the same value and both write, so the first write is silently overwritten. Our test suite demonstrates it.

**Why is TICKET_EMBEDDING a weak entity, but COMMENT is not?**
A weak entity has no key of its own. The embedding is identified only by its ticket, while a comment has its own `comment_id`.

**What is 3NF, and is your schema in it?**
Every non-key attribute depends only on the key, with no transitive dependencies. Yes. `tickets.status` and `escalation_count` are deliberate, trigger-maintained redundancies.

**Why cosine similarity?**
It compares direction, so it measures meaning and ignores text length. Our vectors are normalised.

**What is HNSW?**
An approximate nearest-neighbour index built as a layered graph. It finds close vectors without comparing against every row.

**Why is the duplicate threshold 0.60?**
We measured real pairs. 0.65 missed "lift" vs "elevator" at 0.611. A false flag costs little and a missed duplicate costs more. See [VECTOR_SEARCH.md](VECTOR_SEARCH.md) section 6.

**How are passwords stored?**
As bcrypt hashes. The `chk_user_password` constraint rejects anything that is not a bcrypt hash.

**Why does the dashboard not join tickets with history?**
The join repeats each ticket once per history row, which inflates every COUNT and AVG. It gives over 30 rows for 8 IT tickets. The test result shows the exact number.

**Why a partial index on `due_at`?**
The escalation check only looks at unfinished tickets, so the index stays small and fast.

**How is SQL injection prevented?**
All queries use parameters like `$1`, so input is always treated as data.

**Why can anyone not register as admin?**
Staff, head and admin sign-ups need an access code stored in `.env.local` and checked on the server.
