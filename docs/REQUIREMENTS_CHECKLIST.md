# Requirements checklist

Every point of the Level 3 project brief, how we meet it, and where to show it.

| # | Requirement | How we meet it | Status | Where to show it |
|---|---|---|---|---|
| 1 | Unique title, real-world problem, not plain CRUD | Smart Grievance / Ticket Redressal System. The ticket lifecycle is enforced by the database | Done | [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) |
| 2 | 2-member team with defined work on both database and application | Split by phase, with shared design and testing | Done | [TEAM_SPLIT.md](TEAM_SPLIT.md) |
| 3 | SQL + NoSQL or SQL + vector | Option 2: PostgreSQL + pgvector | Done | [DATABASE_DESIGN.md](DATABASE_DESIGN.md) section 1 |
| 4 | ER diagram converted to a relational schema, with entities, attributes, keys, relationships, constraints | Chen ER diagram, ER to relational mapping, relational schema diagram | Done | [DATABASE_DESIGN.md](DATABASE_DESIGN.md) sections 2 to 4 |
| 4 | Vector data model, indexes, embeddings, metadata, retrieval strategy | `ticket_embeddings`, HNSW index, `model_name`, 3 retrieval paths | Done | [VECTOR_SEARCH.md](VECTOR_SEARCH.md) |
| 5 | DDL: CREATE, ALTER, DROP, keys, constraints, indexes, views | 11 tables, 17 named CHECK constraints, 11 indexes, 3 views | Done | `db/01_schema.sql`, `db/02_views.sql` |
| 6 | DML: INSERT, UPDATE, DELETE, SELECT in the application | All four run from the app. DELETE is "Stop following" | Done | [DATABASE_DESIGN.md](DATABASE_DESIGN.md) section 15 |
| 6 | JOIN, GROUP BY, HAVING, ORDER BY, aggregates, subqueries | Used in views and dashboards | Done | [IMPORTANT_QUERIES.md](IMPORTANT_QUERIES.md), `db/04_important_queries.sql` |
| 7 | At least 4 advanced features | Transactions, views, stored procedures and functions, triggers, indexing, full-text search, vector similarity search | Done | [DATABASE_DESIGN.md](DATABASE_DESIGN.md) sections 9 to 13 |
| 8 | Vector search: what is embedded, model, storage, metric, retrieval | All 5 explained, plus tuning on our data | Done | [VECTOR_SEARCH.md](VECTOR_SEARCH.md) |
| 9 | Functional Next.js interface with forms, tables, search, filtering, dashboards | Pages for all 4 roles | Done | [SCREENSHOTS.md](SCREENSHOTS.md) |
| 10 | API layer between app and database, no hard-coded credentials, environment variables | Next.js Route Handlers, `pg` pool, `.env.local` | Done | `app/api/`, `lib/db.js`, `.env.example` |
| 11 | Authentication and at least 2 roles | Login plus 4 roles: citizen, staff, department head, admin | Done | `lib/auth.js`, `middleware.js`, `lib/api.js` |
| 12 | Validation at database level, data consistency and integrity | CHECK, UNIQUE, FK, triggers, transactions | Done | [DATABASE_DESIGN.md](DATABASE_DESIGN.md) section 8 |
| 13 | Basic security, no plain-text passwords or credentials | bcrypt, enforced by a CHECK. httpOnly cookie, parameterised SQL, secrets in env | Done | [DATABASE_DESIGN.md](DATABASE_DESIGN.md) section 14 |
| 14 | Project documentation | See the table below | Done | `docs/` |
| 15 | Git / GitHub with individual commits and a README | Repository and README are done. Commits so far are all from one account, so individual contributions are not yet visible in the history | **Partly** | [TEAM_SPLIT.md](TEAM_SPLIT.md) |
| 16 | Final demonstration | Every item is mapped below, with demo steps in the README | Done | README, "Things to try in the demo" |
| 17 | Original design and implementation | Own rules, own design, tuned and tested on our own data | Done | [VECTOR_SEARCH.md](VECTOR_SEARCH.md) section 6, [TESTING.md](TESTING.md) |
| 18 | Beyond CRUD, each database choice justified | Lifecycle enforced in the database, choices justified by the data | Done | [DATABASE_DESIGN.md](DATABASE_DESIGN.md) section 1 |

## The 14 documentation items (requirement 14)

| # | Item | Where |
|---|---|---|
| 1 | Problem statement | [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) |
| 2 | Objectives | [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) |
| 3 | Scope | [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) |
| 4 | Functional requirements | [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) |
| 5 | ER diagram | [DATABASE_DESIGN.md](DATABASE_DESIGN.md) section 2, `docs/diagrams/er_diagram.png` |
| 6 | Relational schema | [DATABASE_DESIGN.md](DATABASE_DESIGN.md) section 4, `docs/diagrams/relational_schema.png` |
| 7 | Database choice and justification | [DATABASE_DESIGN.md](DATABASE_DESIGN.md) section 1 |
| 8 | Data dictionary | [DATA_DICTIONARY.md](DATA_DICTIONARY.md) |
| 9 | SQL / vector implementation | `db/`, [VECTOR_SEARCH.md](VECTOR_SEARCH.md) |
| 10 | Important queries | [IMPORTANT_QUERIES.md](IMPORTANT_QUERIES.md) |
| 11 | System architecture | [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md), `docs/diagrams/architecture.png` |
| 12 | Application screenshots | [SCREENSHOTS.md](SCREENSHOTS.md) |
| 13 | Testing results | [TESTING.md](TESTING.md), [TEST_RESULTS_DB.md](TEST_RESULTS_DB.md), [TEST_RESULTS_API.md](TEST_RESULTS_API.md) |
| 14 | Conclusion and future enhancements | [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) |

## Final demonstration items (requirement 16)

| Item | Where |
|---|---|
| Problem statement and motivation | [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) |
| ER diagram and database design | [DATABASE_DESIGN.md](DATABASE_DESIGN.md) |
| Relational schema | [DATABASE_DESIGN.md](DATABASE_DESIGN.md) section 4 |
| Database implementation | `db/` |
| Important queries and operations | `db/04_important_queries.sql` |
| Next.js interface | The running app |
| Database integration | `lib/db.js`, `app/api/` |
| Advanced database features | `db/05_live_demo.sql` |
| Test cases | `npm run db:test`, `npm run test:api` |
| Individual contribution | [TEAM_SPLIT.md](TEAM_SPLIT.md) |
