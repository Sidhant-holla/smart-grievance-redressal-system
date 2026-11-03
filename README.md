# Smart Grievance Redressal System

DBMS Experiential Learning – Level 3 Project
**Krishna Tejas Voruganti (PES1UG24AM436) · Sidhant Holla (PES1UG24AM466)**

A university complaint system built around the **ticket lifecycle**. Every ticket moves through fixed states (Open → Assigned → In Progress → Resolved → Closed), and **PostgreSQL enforces the workflow** with triggers and stored procedures. Overdue tickets are escalated to the department head. Complaints are compared by meaning with **pgvector**, so duplicates are caught even when they are worded differently, and the right department is suggested from similar past cases.

![Admin dashboard](docs/screenshots/10-admin-dashboard.png)

## Features

- **4 roles**: Citizen (student), Staff, Department Head, Admin
- **Enforced state machine**: invalid status changes, cross-department assignment and edits to closed tickets are rejected *by the database*
- **SLA escalation**: each department has an SLA (HIGH priority gets half). Overdue tickets are escalated, the head is notified, and admins are notified on a second breach
- **Duplicate detection**: before submitting, the citizen sees similar open complaints and can "support" one instead of filing a new one
- **Department suggestion** from the nearest past cases (vector k-NN vote)
- **Safe concurrent assignment**: `SELECT … FOR UPDATE` inside stored procedures, so two staff can't both pick up the same ticket
- **Dashboards**: SLA %, average resolution time, ratings, workload, weekly trend, HAVING / subquery reports
- **Keyword search** (PostgreSQL full-text) and **semantic search** (embeddings)
- Status history timeline, internal staff notes, and notifications created by triggers

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), React 18, plain CSS |
| Backend | Next.js Route Handlers (`app/api`), `pg` (node-postgres) |
| Database | PostgreSQL 18 (works on 16+) |
| Vector store | pgvector 0.8 (in the same PostgreSQL database) |
| Embeddings | `all-MiniLM-L6-v2` (384-d) via `@xenova/transformers`, runs locally with no API key |
| Auth | bcryptjs password hashing, JWT (`jose`) in an httpOnly cookie |

## Documentation

- [docs/DESIGN.md](docs/DESIGN.md): problem statement, requirements, architecture, **ER diagram**, **relational schema**, **data dictionary**, DB justification, lifecycle rules, vector strategy
- [docs/TESTING.md](docs/TESTING.md): test cases and results
- [db/](db/): all SQL (DDL, views, functions/triggers/procedures, important queries)

## Project Structure

```
db/
  01_schema.sql              tables, constraints, indexes (CREATE / ALTER / DROP)
  02_views.sql               v_ticket_details, v_department_stats, v_staff_workload
  03_functions_triggers.sql  triggers, stored procedures, escalation, vector functions
  04_important_queries.sql   demo queries (JOIN, GROUP BY/HAVING, subqueries, FTS, vector, EXPLAIN)
scripts/
  setup-db.js                runs the SQL files in order
  seed.js, seed-data.js      sample departments, users, 44 tickets (through the real workflow)
  test-db.js                 32 database tests
lib/                         db pool, auth, embeddings, escalation helper
app/                         pages (citizen, staff, head, admin, tickets) and app/api routes
components/                  Navbar, TicketTable, TicketBrowser, DepartmentDashboard
middleware.js                page protection by role
```

## Setup

### 1. Prerequisites

- **Node.js 20+** (we used 22 LTS)
- **PostgreSQL 16+ with the pgvector extension**. Pick one option:

**Option A – Docker (easiest)**
```bash
docker run -d --name grievance-db -p 5432:5432 -e POSTGRES_PASSWORD=postgres pgvector/pgvector:pg17
```

**Option B – Windows without Docker (what we used, via MSYS2)**
```bash
# in an MSYS2 UCRT64 shell
pacman -S mingw-w64-ucrt-x86_64-postgresql mingw-w64-ucrt-x86_64-gcc make git
git clone --branch v0.8.1 https://github.com/pgvector/pgvector.git
cd pgvector && make && make install
initdb -D ~/pgdata -U postgres -W --auth=scram-sha-256 -E UTF8
pg_ctl -D ~/pgdata -l ~/pgdata/server.log start
```
(With the EDB PostgreSQL installer, build pgvector with Visual Studio's `nmake` as described in the [pgvector README](https://github.com/pgvector/pgvector#windows).)

**Option C – Linux / macOS**
`sudo apt install postgresql-16-pgvector` or `brew install postgresql@17 pgvector`

### 2. Create the database (run once as the `postgres` superuser)

```sql
CREATE ROLE grievance_app LOGIN PASSWORD 'choose_a_password';
CREATE DATABASE grievance_db OWNER grievance_app;
\c grievance_db
CREATE EXTENSION vector;   -- needs superuser, so it is done here
```

### 3. Configure and run

```bash
npm install
cp .env.example .env.local        # then put your password and a random JWT_SECRET in it
npm run db:setup                  # creates tables, views, functions, triggers
npm run db:seed                   # sample data (downloads the 23 MB MiniLM model the first time)
npm run db:test                   # optional: 32 database tests
npm run dev                       # http://localhost:3000
```

`.env.local`:
```
DATABASE_URL=postgresql://grievance_app:choose_a_password@localhost:5432/grievance_db
JWT_SECRET=<any long random string>
```

## Demo Accounts

All demo accounts use the password **`Password@123`**.

| Role | Email |
|---|---|
| Admin | `admin@campus.edu` |
| Dept Head (IT) | `head.it@campus.edu` (also `head.hostel`, `head.canteen`, `head.academics`, `head.transport`, `head.maintenance`, `head.accounts`) |
| Staff (IT) | `ravi.it@campus.edu`, `divya.it@campus.edu` |
| Staff (Transport, set unavailable) | `kiran.transport@campus.edu` |
| Citizen | `ananya@student.campus.edu` (also `rahul`, `sneha`, `aditya`, `fatima`, `karthik`, `neha`, `vikram` `@student.campus.edu`) |

### Things to try in the demo

1. **Duplicate detection**: log in as a citizen → *Raise Complaint* → type *"Hostel wifi keeps disconnecting"* with a description → *Check for similar complaints*. Open tickets #44 / #40 appear, and IT Services is pre-selected.
2. **Workflow enforcement**: as `ravi.it`, open a ticket assigned to you → Start → Resolve. As the citizen, Reopen or Close with a rating. Then try an invalid move directly in psql:
   ```sql
   UPDATE tickets SET status = 'RESOLVED' WHERE status = 'OPEN';   -- ERROR: Invalid status change
   ```
3. **Escalation**: make a ticket overdue and run the check (or press *Run escalation check now* on the admin dashboard):
   ```sql
   UPDATE tickets SET due_at = now() - interval '1 hour' WHERE ticket_id = 33;
   SELECT escalate_overdue_tickets();
   ```
   Then log in as `head.accounts@campus.edu` and check *Notifications*.
4. **Concurrency**: `npm run db:test` shows the lost update without a lock and the clean error with `claim_ticket`.
5. **Search**: *Ticket Queue* → search *"elevator"* in keyword mode vs semantic mode.

## Screenshots

| | |
|---|---|
| ![](docs/screenshots/04-citizen-new-duplicate-check.png) Duplicate check on submission | ![](docs/screenshots/08-head-dashboard.png) Department head dashboard |
| ![](docs/screenshots/09-ticket-detail-head-assign.png) Ticket detail with history | ![](docs/screenshots/07-staff-semantic-search.png) Semantic search |

More in [docs/screenshots](docs/screenshots).

## Team Contributions

| Member | Work |
|---|---|
| **Sidhant Holla** | Next.js setup, DB connection pool, authentication (bcrypt + JWT, middleware), citizen submission form and staff portal, ticket CRUD API routes, state transition UI and role-based actions, head and admin dashboard UI |
| **Krishna Tejas Voruganti** | PostgreSQL + pgvector setup, schema (constraints, indexes), embedding integration and duplicate / department similarity functions, triggers for the state machine and escalation, transactions with row-level locks for assignment, views and aggregate queries for the dashboards |
| **Both** | ER diagram and normalisation decisions, escalation rules, test data and testing, documentation |
