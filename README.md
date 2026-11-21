# Smart Grievance Redressal System

DBMS Experiential Learning – Level 3 Project
**Krishna Tejas Voruganti (PES1UG24AM436) · Sidhant Holla (PES1UG24AM466)**

A university complaint system built around the **ticket lifecycle**. Every ticket moves through fixed states (Open → Assigned → In Progress → Resolved → Closed), and **PostgreSQL enforces the workflow** with triggers and stored procedures. Overdue tickets are escalated to the department head. Complaints are compared by meaning with **pgvector**, so duplicates are caught even when they are worded differently, and the right department is suggested from similar past cases.

![Admin dashboard](docs/screenshots/10-admin-dashboard.png)

## Features

- **4 roles**: Citizen (student), Staff, Department Head, Admin. All of them can be created from the website
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

## Project Deliverables

| Document | What is in it |
|---|---|
| [Project report (PDF)](docs/Project_Report.pdf) | Everything below in one file |
| [Project overview](docs/PROJECT_OVERVIEW.md) | Problem statement, objectives, scope, functional requirements, architecture, conclusion and future work |
| [Database design](docs/DATABASE_DESIGN.md) | Database choice, ER diagram, ER to relational mapping, relational schema, normalisation, constraints, indexes, views, procedures, triggers, transactions, security, DML coverage |
| [Data dictionary](docs/DATA_DICTIONARY.md) | Every table and column, generated from the live database |
| [Vector search](docs/VECTOR_SEARCH.md) | What is embedded, the model, storage, similarity metric, retrieval, tuning on our data |
| [Important queries](docs/IMPORTANT_QUERIES.md) | Key queries with real results |
| [Screenshots](docs/SCREENSHOTS.md) | The application, role by role |
| [Testing](docs/TESTING.md) | Test approach and the problems found, with [database results](docs/TEST_RESULTS_DB.md) and [API results](docs/TEST_RESULTS_API.md) |
| [Requirements checklist](docs/REQUIREMENTS_CHECKLIST.md) | Every point of the brief and where to show it |
| [Team split](docs/TEAM_SPLIT.md) | Who did what, and the Git workflow |

### Diagrams

| ER diagram | Relational schema |
|---|---|
| ![ER diagram](docs/diagrams/er_diagram.png) | ![Relational schema](docs/diagrams/relational_schema.png) |

| Ticket lifecycle | Architecture |
|---|---|
| ![Ticket lifecycle](docs/diagrams/ticket_lifecycle.png) | ![Architecture](docs/diagrams/architecture.png) |

## Project Structure

```
db/
  01_schema.sql              tables, constraints, indexes (CREATE / ALTER / DROP)
  02_views.sql               v_ticket_details, v_department_stats, v_staff_workload
  03_functions_triggers.sql  triggers, stored procedures, escalation, vector functions
  04_important_queries.sql   demo queries (JOIN, GROUP BY/HAVING, subqueries, FTS, vector, EXPLAIN)
  05_live_demo.sql           live demonstration of constraints, triggers, procedures, views, vector search
scripts/
  setup-db.js                runs the SQL files in order
  seed.js, seed-data.js      sample departments, users, 44 tickets (through the real workflow)
  test-db.js                 36 database tests, writes docs/TEST_RESULTS_DB.md
  test-api.js                49 API and security tests, writes docs/TEST_RESULTS_API.md
  create-user.js             creates an admin, staff, head or citizen account
  generate-data-dictionary.js  writes docs/DATA_DICTIONARY.md from the live database
lib/                         db pool, auth, accounts, embeddings, escalation helper
app/                         pages (citizen, staff, head, admin, tickets) and app/api routes
components/                  Navbar, TicketTable, TicketBrowser, DepartmentDashboard
middleware.js                page protection by role
docs/                        project documents, diagrams, screenshots, test results
```

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Run the app in development mode |
| `npm run build`, then `npm start` | Run the production build |
| `npm run db:setup` | Create all tables, views, functions and triggers (deletes existing data) |
| `npm run db:seed` | Load the sample data |
| `npm run db:test` | Run 36 database tests and write the results |
| `npm run test:api` | Run 49 API and security tests against the running app and write the results |
| `npm run create-user -- <role> "<name>" <email> <password> ["<department>"]` | Create an account from the terminal |
| `npm run docs:dictionary` | Regenerate the data dictionary |

## How to Run

**Quick version**, if PostgreSQL with pgvector is already running and the database exists:

```bash
npm install
cp .env.example .env.local     # then edit it (see step 3)
npm run db:setup
npm run db:seed
npm run dev                    # open http://localhost:3000
```

First time on a new machine? Follow the steps below in order.

### Step 1: Install what you need

- **Node.js 20.12 or newer** (we used 22 LTS, [download here](https://nodejs.org)). Check with `node -v`.
- **Git**
- **Internet access for the first run**: the 23 MB MiniLM model is downloaded once, then cached in `node_modules`.
- **PostgreSQL 16+ with the pgvector extension**. Pick one option below.

**Option A: Docker (easiest, any OS)**

Needs [Docker Desktop](https://www.docker.com/products/docker-desktop/) to be running. This image already includes pgvector.
```bash
docker run -d --name grievance-db -p 5432:5432 -e POSTGRES_PASSWORD=postgres pgvector/pgvector:pg17
```

**Option B: Windows without Docker (what we used)**

No admin rights needed. Install [MSYS2](https://www.msys2.org), open the **MSYS2 UCRT64** shell from the Start menu, and run these (replace `<you>` with your Windows username):
```bash
pacman -S --needed mingw-w64-ucrt-x86_64-postgresql mingw-w64-ucrt-x86_64-gcc make git
git clone --branch v0.8.1 https://github.com/pgvector/pgvector.git
cd pgvector && make && make install && cd ..
initdb -D C:/Users/<you>/pgdata -U postgres -W --auth=scram-sha-256 -E UTF8    # asks you to set a postgres password
pg_ctl -D C:/Users/<you>/pgdata -l C:/Users/<you>/pgdata/server.log start
```
Then add `C:\msys64\ucrt64\bin` to your Windows PATH so `psql` and `pg_ctl` work in normal terminals.

(With the EDB PostgreSQL installer instead, build pgvector with Visual Studio's `nmake` as described in the [pgvector README](https://github.com/pgvector/pgvector#windows).)

**Option C: Linux / macOS**
```bash
# Ubuntu / Debian (change 16 to your PostgreSQL version)
sudo apt install postgresql postgresql-16-pgvector
sudo systemctl start postgresql

# macOS
brew install postgresql@17 pgvector
brew services start postgresql@17
```

### Step 2: Create the database (once only)

Open `psql` as the PostgreSQL superuser:

| Your option | Command |
|---|---|
| Docker | `docker exec -it grievance-db psql -U postgres` |
| Windows (MSYS2) | `psql -U postgres -h localhost` |
| Ubuntu / Debian | `sudo -u postgres psql` |
| macOS | `psql postgres` |

Then run these, using your own password in the first line:
```sql
CREATE ROLE grievance_app LOGIN PASSWORD 'choose_a_password';
CREATE DATABASE grievance_db OWNER grievance_app;
\c grievance_db
CREATE EXTENSION vector;   -- needs superuser, so it is done here and not in db:setup
\q
```

### Step 3: Get the code and set up `.env.local`

```bash
git clone https://github.com/Sidhant-holla/smart-grievance-redressal-system.git
cd smart-grievance-redressal-system
npm install
cp .env.example .env.local
```
(`cp` works in PowerShell and Git Bash. In the old Command Prompt use `copy`.)

Open `.env.local` and fill in the values:
```
DATABASE_URL=postgresql://grievance_app:choose_a_password@localhost:5432/grievance_db
JWT_SECRET=<any long random string>
STAFF_SIGNUP_CODE=<a code you choose>
```
- The password must match the one from step 2. Avoid symbols like `@` or `/` in it, because they break the URL.
- To generate a `JWT_SECRET`, run: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- `STAFF_SIGNUP_CODE` is the access code for registering as staff, head or admin. Leave it empty to turn that off. Citizens never need it.
- `.env.local` is git-ignored, so never commit it. Restart the app after changing it.

### Step 4: Create the tables and sample data

```bash
npm run db:setup     # creates tables, views, functions, triggers (WARNING: deletes existing data)
npm run db:seed      # adds 27 users and 44 tickets (downloads the model the first time)
npm run db:test      # optional: runs the 36 database tests
```

### Step 5: Start the app

```bash
npm run dev
```
Open **http://localhost:3000** and log in with a [demo account](#demo-accounts). Press `Ctrl + C` in the terminal to stop it.

To run the production build instead: `npm run build`, then `npm start`.

### Running it again later

The app stops when you close the terminal, and PostgreSQL usually stops after a restart. So each time:

1. **Start PostgreSQL**
   - Docker: `docker start grievance-db`
   - Windows (MSYS2): `pg_ctl -D C:/Users/<you>/pgdata -l C:/Users/<you>/pgdata/server.log start`
   - Ubuntu / Debian: `sudo systemctl start postgresql`
   - macOS: `brew services start postgresql@17`
2. **Start the app** from the project folder: `npm run dev`

### After pulling new code

```bash
git pull
npm install
npm run db:setup     # only needed if files in db/ changed (this deletes your data)
npm run db:seed
npm run dev          # stop the old one with Ctrl + C first
```

Also compare `.env.local` with `.env.example` and add any new settings. For example, `STAFF_SIGNUP_CODE` must be set before staff, heads and admins can register, and the app must be restarted after changing `.env.local`.

To reset the demo data at any time, run `npm run db:setup` and then `npm run db:seed`.

### Creating admin, staff and department head accounts

Every role can be created from the website:

1. **Register page:** choose the account type. Citizens can sign up freely. Staff, head and admin accounts need the access code (`STAFF_SIGNUP_CODE` in `.env.local`), so that random visitors can't make themselves an admin. Staff and heads also pick their department.
2. **Admin website:** log in as admin → *Users* → *Add a user*. No access code is needed here.

On an empty database, register the admin first, add departments from the admin *Departments* page, and then register staff and heads.

You can also use:

3. **Seed data:** `npm run db:seed` creates one admin, 7 heads and 11 staff. See [Demo Accounts](#demo-accounts).
4. **Terminal script:** does the same as the Register page, without needing the access code:
   ```bash
   npm run create-user -- admin "Priya Sharma" priya@campus.edu MyPassword123
   npm run create-user -- staff "Ravi Menon" ravi@campus.edu MyPassword123 "IT Services"
   npm run create-user -- dept_head "Suresh Kumar" suresh@campus.edu MyPassword123 "IT Services"
   ```
   Staff and heads need a department that already exists.

**Don't create accounts with a plain SQL `INSERT`.** A login needs more than one row, so a hand-written insert leaves the account broken:

- `password_hash` must be a bcrypt hash. A plain password is rejected by the `chk_user_password` constraint.
- Staff and heads also need a row in the `staff` table. Without it they have no department and cannot log in.
- A head should also be set in `departments.head_id`, otherwise they don't get escalation notifications.

If you change a user's `role` in SQL, that person must **log out and log in again**, because the role is stored in the login cookie.

### Troubleshooting

| Problem | Fix |
|---|---|
| `pg_ctl` / `psql` is not recognized | Open a new terminal. On Windows, check that `C:\msys64\ucrt64\bin` is on your PATH |
| `ECONNREFUSED ... 5432` | PostgreSQL is not running, see "Running it again later" |
| `password authentication failed` | The password in `.env.local` does not match the one from step 2 |
| `no such file or directory ... .env.local` | You skipped step 3. Run the commands from the project folder |
| `process.loadEnvFile is not a function` | Your Node.js is older than 20.12, so update it |
| `type "vector" does not exist` or `permission denied to create extension` | Run `CREATE EXTENSION vector;` as the superuser in `grievance_db` (step 2) |
| `relation "users" does not exist` | Run `npm run db:setup` and then `npm run db:seed` |
| Complaint form says the text similarity model could not be loaded | The model has not been downloaded yet. Connect to the internet (some college networks block huggingface.co, so try a hotspot) and try again |
| Login says `Invalid email or password` for an account made in SQL | The password was not hashed. Create the account with `npm run create-user` instead |
| Login says the account is not linked to a department | A staff or head account has no row in the `staff` table. Create it with `npm run create-user` or the admin *Users* page |
| No admin account exists | Register one on the Register page with the access code, or run `npm run db:seed` |
| Register says `Wrong access code` | Use the exact `STAFF_SIGNUP_CODE` value from `.env.local` |
| Register says staff sign-up is turned off | Set `STAFF_SIGNUP_CODE` in `.env.local` and restart the app |
| Department list is empty on the Register page | No departments exist yet. Register an admin first and add them, or run `npm run db:seed` |
| Role was changed in SQL but the site still shows the old role | Log out and log in again |
| Port 3000 is already in use | Run `npm run dev -- -p 3001` and open http://localhost:3001 |
| The site does not open from another device | This is on purpose. The app only listens on this laptop (`127.0.0.1`) for security, so run the demo on the laptop itself |

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
2. **Workflow enforcement**: as `ravi.it`, open a ticket assigned to you → Start → Resolve. As the citizen, Reopen or Close with a rating. Then try an invalid move directly in psql (`psql -U grievance_app -h localhost -d grievance_db`):
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
