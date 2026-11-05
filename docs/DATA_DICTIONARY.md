# Data dictionary

Generated from the live PostgreSQL catalog by `npm run docs:dictionary` (`scripts/generate-data-dictionary.js`).

Key: **PK** primary key, **FK** foreign key, **UQ** unique, **NN** not null.

## departments

University departments that handle complaints. sla_hours sets the deadline for their tickets.

| Column | Type | Null | Default | Keys | Notes |
|---|---|---|---|---|---|
| dept_id | integer | NN | serial | PK |  |
| name | character varying(80) | NN |  | UQ |  |
| description | text |  |  |  |  |
| sla_hours | integer | NN | 72 |  | Hours before an unresolved ticket escalates |
| head_id | integer |  |  | FK → staff (SET NULL) | Added with ALTER TABLE because of the circular reference with staff. Trigger: must be a dept_head of this department |
| created_at | timestamp with time zone | NN | now() |  |  |

CHECK constraints:

- `chk_sla_hours`: `CHECK (((sla_hours >= 1) AND (sla_hours <= 720)))`

## users

Everyone who can log in: citizens, staff, department heads and admins.

| Column | Type | Null | Default | Keys | Notes |
|---|---|---|---|---|---|
| user_id | integer | NN | serial | PK |  |
| full_name | character varying(100) | NN |  |  |  |
| email | character varying(120) | NN |  |  | Login id. Unique ignoring case (unique index on lower(email)) |
| password_hash | character varying(100) | NN |  |  | bcrypt hash only. A plain password is rejected |
| role | character varying(20) | NN | 'citizen' |  |  |
| is_active | boolean | NN | true |  | Deactivated users cannot log in |
| created_at | timestamp with time zone | NN | now() |  |  |

CHECK constraints:

- `chk_user_email`: `CHECK (((email)::text ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'::text))`
- `chk_user_name`: `CHECK ((length(TRIM(BOTH FROM full_name)) >= 2))`
- `chk_user_password`: `CHECK (((password_hash)::text ~ '^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$'::text))`
- `chk_user_role`: `CHECK (((role)::text = ANY ((ARRAY['citizen'::character varying, 'staff'::character varying, 'dept_head'::character varying, 'admin'::character varying])::text[])))`

Indexes:

- `idx_users_email_lower`: `USING btree (lower((email)::text))`

## staff

Specialisation of users. Only staff and heads have a row here, which gives them a department.

| Column | Type | Null | Default | Keys | Notes |
|---|---|---|---|---|---|
| staff_id | integer | NN |  | FK → users (CASCADE), PK | Same value as users.user_id. Trigger: user must be staff or dept_head |
| dept_id | integer | NN |  | FK → departments (RESTRICT) |  |
| designation | character varying(60) | NN | 'Staff' |  |  |
| is_available | boolean | NN | true |  | Auto-assignment skips unavailable staff |

Indexes:

- `idx_staff_dept`: `USING btree (dept_id)`

## ticket_statuses

Lookup table of the 7 ticket states.

| Column | Type | Null | Default | Keys | Notes |
|---|---|---|---|---|---|
| status_code | character varying(20) | NN |  | PK |  |
| label | character varying(40) | NN |  |  |  |
| is_open | boolean | NN |  |  | TRUE means the ticket still needs work |
| sort_order | integer | NN |  |  |  |

## status_transitions

The allowed status moves. The state machine trigger checks every change against this table.

| Column | Type | Null | Default | Keys | Notes |
|---|---|---|---|---|---|
| from_status | character varying(20) | NN |  | FK → ticket_statuses, PK |  |
| to_status | character varying(20) | NN |  | FK → ticket_statuses, PK |  |

CHECK constraints:

- `chk_transition_not_same`: `CHECK (((from_status)::text <> (to_status)::text))`

## tickets

The core table. One row per complaint, holding its current state.

| Column | Type | Null | Default | Keys | Notes |
|---|---|---|---|---|---|
| ticket_id | integer | NN | serial | PK |  |
| title | character varying(150) | NN |  |  |  |
| description | text | NN |  |  |  |
| location | character varying(120) |  |  |  |  |
| priority | character varying(10) | NN | 'MEDIUM' |  | HIGH gets half of the department SLA |
| status | character varying(20) | NN | 'OPEN' | FK → ticket_statuses | Every change is validated by the ticket_before_update trigger |
| created_by | integer | NN |  | FK → users (RESTRICT) |  |
| dept_id | integer | NN |  | FK → departments (RESTRICT) | Trigger: cannot be changed after submission |
| assigned_to | integer |  |  | FK → staff (SET NULL) | Trigger: must work in the same department as the ticket |
| possible_duplicate_of | integer |  |  | FK → tickets (SET NULL) | Set when an open ticket with similarity of 0.60 or more exists |
| escalation_count | integer | NN | 0 |  | Incremented by trigger on each escalation |
| rating | smallint |  |  |  | Citizen feedback, only allowed on a CLOSED ticket |
| due_at | timestamp with time zone |  |  |  | SLA deadline, set by trigger |
| resolved_at | timestamp with time zone |  |  |  |  |
| created_at | timestamp with time zone | NN | now() |  |  |
| updated_at | timestamp with time zone | NN | now() |  |  |
| updated_by | integer |  |  | FK → users | Who made the last change. NULL means the system |
| search_vector | tsvector |  | generated |  | Generated from title and description, used for full-text search |

CHECK constraints:

- `chk_assigned_has_staff`: `CHECK ((((status)::text <> ALL ((ARRAY['ASSIGNED'::character varying, 'IN_PROGRESS'::character varying])::text[])) OR (assigned_to IS NOT NULL)))`
- `chk_escalation_count`: `CHECK ((escalation_count >= 0))`
- `chk_not_self_duplicate`: `CHECK ((possible_duplicate_of <> ticket_id))`
- `chk_rating_only_closed`: `CHECK (((rating IS NULL) OR ((status)::text = 'CLOSED'::text)))`
- `chk_rating_range`: `CHECK (((rating >= 1) AND (rating <= 5)))`
- `chk_resolved_has_time`: `CHECK ((((status)::text <> 'RESOLVED'::text) OR (resolved_at IS NOT NULL)))`
- `chk_resolved_time`: `CHECK (((resolved_at IS NULL) OR (resolved_at >= created_at)))`
- `chk_ticket_description`: `CHECK ((length(TRIM(BOTH FROM description)) >= 20))`
- `chk_ticket_priority`: `CHECK (((priority)::text = ANY ((ARRAY['LOW'::character varying, 'MEDIUM'::character varying, 'HIGH'::character varying])::text[])))`
- `chk_ticket_title`: `CHECK ((length(TRIM(BOTH FROM title)) >= 5))`

Indexes:

- `idx_tickets_assigned_to`: `USING btree (assigned_to)`
- `idx_tickets_created_by`: `USING btree (created_by)`
- `idx_tickets_dept_status`: `USING btree (dept_id, status)`
- `idx_tickets_due_open`: `USING btree (due_at) WHERE ((status)::text = ANY ((ARRAY['OPEN'::character varying, 'ASSIGNED'::character varying, 'IN_PROGRESS'::character varying, 'REOPENED'::character varying])::text[]))`
- `idx_tickets_search`: `USING gin (search_vector)`

## ticket_embeddings

Vector store. One 384-dimension embedding per ticket, used for similarity search.

| Column | Type | Null | Default | Keys | Notes |
|---|---|---|---|---|---|
| ticket_id | integer | NN |  | FK → tickets (CASCADE), PK |  |
| embedding | vector(384) | NN |  |  | Sentence embedding of "title. description" |
| model_name | character varying(60) | NN | 'all-MiniLM-L6-v2' |  | Stored so vectors from different models are never compared |
| created_at | timestamp with time zone | NN | now() |  |  |

Indexes:

- `idx_embeddings_hnsw`: `USING hnsw (embedding vector_cosine_ops)`

## ticket_status_history

Full timeline of every ticket. Written only by a trigger.

| Column | Type | Null | Default | Keys | Notes |
|---|---|---|---|---|---|
| history_id | integer | NN | serial | PK |  |
| ticket_id | integer | NN |  | FK → tickets (CASCADE) |  |
| old_status | character varying(20) |  |  | FK → ticket_statuses | NULL on the first row of a ticket |
| new_status | character varying(20) | NN |  | FK → ticket_statuses |  |
| assigned_to | integer |  |  | FK → staff (SET NULL) |  |
| changed_by | integer |  |  | FK → users (SET NULL) | NULL means the system |
| changed_at | timestamp with time zone | NN | now() |  |  |

Indexes:

- `idx_history_ticket`: `USING btree (ticket_id, changed_at)`

## ticket_supporters

M:N between users and tickets: citizens who said "I have the same problem".

| Column | Type | Null | Default | Keys | Notes |
|---|---|---|---|---|---|
| ticket_id | integer | NN |  | FK → tickets (CASCADE), PK |  |
| user_id | integer | NN |  | FK → users (CASCADE), PK |  |
| supported_at | timestamp with time zone | NN | now() |  |  |

## ticket_comments

Comments on a ticket. Internal notes are hidden from citizens.

| Column | Type | Null | Default | Keys | Notes |
|---|---|---|---|---|---|
| comment_id | integer | NN | serial | PK |  |
| ticket_id | integer | NN |  | FK → tickets (CASCADE) |  |
| user_id | integer | NN |  | FK → users (CASCADE) |  |
| body | text | NN |  |  |  |
| is_internal | boolean | NN | false |  | TRUE hides the comment from citizens |
| created_at | timestamp with time zone | NN | now() |  |  |

CHECK constraints:

- `chk_comment_body`: `CHECK (((length(TRIM(BOTH FROM body)) >= 1) AND (length(TRIM(BOTH FROM body)) <= 2000)))`

Indexes:

- `idx_comments_ticket`: `USING btree (ticket_id)`

## notifications

In-app notifications created by triggers.

| Column | Type | Null | Default | Keys | Notes |
|---|---|---|---|---|---|
| notification_id | integer | NN | serial | PK |  |
| user_id | integer | NN |  | FK → users (CASCADE) |  |
| ticket_id | integer |  |  | FK → tickets (CASCADE) |  |
| message | character varying(255) | NN |  |  |  |
| is_read | boolean | NN | false |  |  |
| created_at | timestamp with time zone | NN | now() |  |  |

Indexes:

- `idx_notifications_unread`: `USING btree (user_id) WHERE (is_read = false)`

## Other database objects

### Views

- `v_department_stats`
- `v_staff_workload`
- `v_ticket_details`

### Procedures and functions

| Kind | Name | Arguments |
|---|---|---|
| Procedure | `assign_ticket` | IN p_ticket_id integer, IN p_staff_id integer, IN p_actor_id integer |
| Procedure | `auto_assign_ticket` | IN p_ticket_id integer |
| Procedure | `claim_ticket` | IN p_ticket_id integer, IN p_staff_id integer |
| Function | `compute_due_at` | p_dept_id integer, p_priority character varying, p_from timestamp with time zone |
| Function | `escalate_overdue_tickets` | - |
| Function | `find_similar_tickets` | p_embedding vector, p_min_similarity double precision, p_limit integer |
| Function | `suggest_department` | p_embedding vector, p_k integer, p_min_similarity double precision |
| Function | `trg_department_head_check` | - |
| Function | `trg_staff_role_check` | - |
| Function | `trg_ticket_after_change` | - |
| Function | `trg_ticket_before_insert` | - |
| Function | `trg_ticket_before_update` | - |

### Triggers

| Trigger | Table |
|---|---|
| `department_head_check` | departments |
| `staff_role_check` | staff |
| `ticket_after_change` | tickets |
| `ticket_before_insert` | tickets |
| `ticket_before_update` | tickets |
