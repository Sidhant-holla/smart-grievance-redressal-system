-- =====================================================================
--  Smart Grievance Redressal System
--  01_schema.sql  :  Tables, keys, constraints and indexes (DDL)
--  Run order      :  01_schema.sql -> 02_views.sql -> 03_functions_triggers.sql
-- =====================================================================

-- pgvector gives us the "vector" data type and similarity operators
CREATE EXTENSION IF NOT EXISTS vector;

-- DROP everything first so the script can be re-run from scratch.
-- CASCADE also removes the views / triggers that depend on these tables.
DROP TABLE IF EXISTS notifications         CASCADE;
DROP TABLE IF EXISTS ticket_comments       CASCADE;
DROP TABLE IF EXISTS ticket_supporters     CASCADE;
DROP TABLE IF EXISTS ticket_status_history CASCADE;
DROP TABLE IF EXISTS ticket_embeddings     CASCADE;
DROP TABLE IF EXISTS tickets               CASCADE;
DROP TABLE IF EXISTS status_transitions    CASCADE;
DROP TABLE IF EXISTS ticket_statuses       CASCADE;
DROP TABLE IF EXISTS staff                 CASCADE;
DROP TABLE IF EXISTS users                 CASCADE;
DROP TABLE IF EXISTS departments           CASCADE;


-- ---------------------------------------------------------------------
-- DEPARTMENTS
-- sla_hours = how long a ticket can stay unresolved before it escalates
-- ---------------------------------------------------------------------
CREATE TABLE departments (
    dept_id      SERIAL PRIMARY KEY,
    name         VARCHAR(80)  NOT NULL UNIQUE,
    description  TEXT,
    sla_hours    INT          NOT NULL DEFAULT 72,
    head_id      INT,                       -- FK added below using ALTER TABLE
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT chk_sla_hours CHECK (sla_hours BETWEEN 1 AND 720)
);


-- ---------------------------------------------------------------------
-- USERS  (every person who logs in: citizen, staff, dept_head, admin)
-- ---------------------------------------------------------------------
CREATE TABLE users (
    user_id        SERIAL PRIMARY KEY,
    full_name      VARCHAR(100) NOT NULL,
    email          VARCHAR(120) NOT NULL,
    password_hash  VARCHAR(100) NOT NULL,   -- bcrypt hash, never the plain password
    role           VARCHAR(20)  NOT NULL DEFAULT 'citizen',
    is_active      BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT chk_user_name  CHECK (length(trim(full_name)) >= 2),
    CONSTRAINT chk_user_email CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT chk_user_role  CHECK (role IN ('citizen', 'staff', 'dept_head', 'admin')),
    -- must look like a bcrypt hash, so a plain password can never be stored by mistake
    CONSTRAINT chk_user_password CHECK (password_hash ~ '^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$')
);

-- emails must be unique ignoring case (Rahul@x.com and rahul@x.com are the same person)
-- This is an expression index: it indexes lower(email), not email itself.
CREATE UNIQUE INDEX idx_users_email_lower ON users (lower(email));


-- ---------------------------------------------------------------------
-- STAFF  (specialisation of USERS - only staff and dept heads have a row)
-- staff_id is both the PK and a FK to users, i.e. a 1:1 "is-a" relationship
-- ---------------------------------------------------------------------
CREATE TABLE staff (
    staff_id      INT PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    dept_id       INT NOT NULL REFERENCES departments(dept_id) ON DELETE RESTRICT,
    designation   VARCHAR(60) NOT NULL DEFAULT 'Staff',
    is_available  BOOLEAN     NOT NULL DEFAULT TRUE    -- used by auto-assignment
);

-- departments.head_id -> staff.staff_id
-- This is circular (staff needs departments, departments needs staff), so the
-- foreign key can only be added after both tables exist.
ALTER TABLE departments
    ADD CONSTRAINT fk_department_head
    FOREIGN KEY (head_id) REFERENCES staff(staff_id) ON DELETE SET NULL;


-- ---------------------------------------------------------------------
-- TICKET STATUSES (lookup table) and the allowed transitions between them.
-- Keeping the workflow as data means the trigger only has to check
-- "is (old, new) present in status_transitions?"
-- ---------------------------------------------------------------------
CREATE TABLE ticket_statuses (
    status_code  VARCHAR(20) PRIMARY KEY,
    label        VARCHAR(40) NOT NULL,
    is_open      BOOLEAN     NOT NULL,      -- TRUE = still needs work
    sort_order   INT         NOT NULL
);

INSERT INTO ticket_statuses (status_code, label, is_open, sort_order) VALUES
    ('OPEN',        'Open',        TRUE,  1),
    ('ASSIGNED',    'Assigned',    TRUE,  2),
    ('IN_PROGRESS', 'In Progress', TRUE,  3),
    ('ESCALATED',   'Escalated',   TRUE,  4),
    ('REOPENED',    'Reopened',    TRUE,  5),
    ('RESOLVED',    'Resolved',    FALSE, 6),
    ('CLOSED',      'Closed',      FALSE, 7);

-- Composite primary key: the pair (from, to) must be unique, which also stops duplicate rules.
CREATE TABLE status_transitions (
    from_status  VARCHAR(20) NOT NULL REFERENCES ticket_statuses(status_code),
    to_status    VARCHAR(20) NOT NULL REFERENCES ticket_statuses(status_code),
    PRIMARY KEY (from_status, to_status),
    CONSTRAINT chk_transition_not_same CHECK (from_status <> to_status)
);

INSERT INTO status_transitions (from_status, to_status) VALUES
    ('OPEN',        'ASSIGNED'),     -- staff picks it up / head assigns / auto-assign
    ('OPEN',        'ESCALATED'),    -- nobody touched it within the SLA
    ('OPEN',        'CLOSED'),       -- citizen withdraws the complaint
    ('ASSIGNED',    'IN_PROGRESS'),
    ('ASSIGNED',    'RESOLVED'),
    ('ASSIGNED',    'ESCALATED'),
    ('ASSIGNED',    'CLOSED'),       -- citizen withdraws before work has started
    ('IN_PROGRESS', 'RESOLVED'),
    ('IN_PROGRESS', 'ESCALATED'),
    ('ESCALATED',   'ASSIGNED'),     -- head re-assigns, new SLA window starts
    ('ESCALATED',   'IN_PROGRESS'),
    ('ESCALATED',   'RESOLVED'),
    ('RESOLVED',    'CLOSED'),       -- citizen confirms (with rating)
    ('RESOLVED',    'REOPENED'),     -- citizen is not satisfied
    ('REOPENED',    'ASSIGNED'),
    ('REOPENED',    'IN_PROGRESS'),
    ('REOPENED',    'ESCALATED');


-- ---------------------------------------------------------------------
-- TICKETS  (the core entity)
-- status is kept here (current state, fast to query for dashboards) AND the
-- full history is kept in ticket_status_history (maintained by a trigger).
-- ---------------------------------------------------------------------
CREATE TABLE tickets (
    ticket_id              SERIAL PRIMARY KEY,
    title                  VARCHAR(150) NOT NULL,
    description            TEXT         NOT NULL,
    location               VARCHAR(120),
    priority               VARCHAR(10)  NOT NULL DEFAULT 'MEDIUM',
    status                 VARCHAR(20)  NOT NULL DEFAULT 'OPEN' REFERENCES ticket_statuses(status_code),
    created_by             INT NOT NULL REFERENCES users(user_id)       ON DELETE RESTRICT,
    dept_id                INT NOT NULL REFERENCES departments(dept_id) ON DELETE RESTRICT,
    assigned_to            INT          REFERENCES staff(staff_id)      ON DELETE SET NULL,
    possible_duplicate_of  INT          REFERENCES tickets(ticket_id)   ON DELETE SET NULL,
    escalation_count       INT          NOT NULL DEFAULT 0,
    rating                 SMALLINT,
    due_at                 TIMESTAMPTZ,            -- set by trigger from the department SLA
    resolved_at            TIMESTAMPTZ,
    created_at             TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_by             INT          REFERENCES users(user_id),   -- NULL = done by the system
    -- keyword search column, kept up to date automatically by PostgreSQL
    search_vector          TSVECTOR GENERATED ALWAYS AS
                               (to_tsvector('english', title || ' ' || description)) STORED,

    CONSTRAINT chk_ticket_title       CHECK (length(trim(title)) >= 5),
    CONSTRAINT chk_ticket_description CHECK (length(trim(description)) >= 20),
    CONSTRAINT chk_ticket_priority    CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH')),
    CONSTRAINT chk_escalation_count   CHECK (escalation_count >= 0),
    CONSTRAINT chk_rating_range       CHECK (rating BETWEEN 1 AND 5),
    -- Cross-column rule: a rating is only allowed once the ticket is CLOSED.
    CONSTRAINT chk_rating_only_closed CHECK (rating IS NULL OR status = 'CLOSED'),
    CONSTRAINT chk_resolved_time      CHECK (resolved_at IS NULL OR resolved_at >= created_at),
    CONSTRAINT chk_resolved_has_time  CHECK (status <> 'RESOLVED' OR resolved_at IS NOT NULL),
    -- Reads as: if status is ASSIGNED or IN_PROGRESS, then assigned_to must be filled in.
    CONSTRAINT chk_assigned_has_staff CHECK (status NOT IN ('ASSIGNED', 'IN_PROGRESS') OR assigned_to IS NOT NULL),
    CONSTRAINT chk_not_self_duplicate CHECK (possible_duplicate_of <> ticket_id)
);


-- ---------------------------------------------------------------------
-- TICKET EMBEDDINGS  (vector part of the system - pgvector)
-- 384 dimensions = output size of the all-MiniLM-L6-v2 sentence model
-- ---------------------------------------------------------------------
-- ON DELETE CASCADE: deleting a ticket also deletes its vector.
CREATE TABLE ticket_embeddings (
    ticket_id   INT PRIMARY KEY REFERENCES tickets(ticket_id) ON DELETE CASCADE,
    embedding   VECTOR(384) NOT NULL,
    model_name  VARCHAR(60) NOT NULL DEFAULT 'all-MiniLM-L6-v2',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------
-- STATUS HISTORY  (one row per status change / re-assignment)
-- Only the trigger inserts here, the application never writes to it.
-- ---------------------------------------------------------------------
CREATE TABLE ticket_status_history (
    history_id   SERIAL PRIMARY KEY,
    ticket_id    INT NOT NULL REFERENCES tickets(ticket_id) ON DELETE CASCADE,
    old_status   VARCHAR(20) REFERENCES ticket_statuses(status_code),   -- NULL for the first row
    new_status   VARCHAR(20) NOT NULL REFERENCES ticket_statuses(status_code),
    assigned_to  INT REFERENCES staff(staff_id) ON DELETE SET NULL,
    changed_by   INT REFERENCES users(user_id)  ON DELETE SET NULL,     -- NULL = system
    changed_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------
-- SUPPORTERS  ("I have the same problem" instead of filing a duplicate)
-- M:N between users and tickets
-- ---------------------------------------------------------------------
CREATE TABLE ticket_supporters (
    ticket_id     INT NOT NULL REFERENCES tickets(ticket_id) ON DELETE CASCADE,
    user_id       INT NOT NULL REFERENCES users(user_id)     ON DELETE CASCADE,
    supported_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (ticket_id, user_id)
);


-- ---------------------------------------------------------------------
-- COMMENTS  (is_internal = only visible to staff, not to the citizen)
-- ---------------------------------------------------------------------
CREATE TABLE ticket_comments (
    comment_id   SERIAL PRIMARY KEY,
    ticket_id    INT NOT NULL REFERENCES tickets(ticket_id) ON DELETE CASCADE,
    user_id      INT NOT NULL REFERENCES users(user_id)     ON DELETE CASCADE,
    body         TEXT NOT NULL,
    is_internal  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_comment_body CHECK (length(trim(body)) BETWEEN 1 AND 2000)
);


-- ---------------------------------------------------------------------
-- NOTIFICATIONS  (inserted by triggers on assignment / escalation / status change)
-- ---------------------------------------------------------------------
CREATE TABLE notifications (
    notification_id  SERIAL PRIMARY KEY,
    user_id          INT NOT NULL REFERENCES users(user_id)     ON DELETE CASCADE,
    ticket_id        INT          REFERENCES tickets(ticket_id) ON DELETE CASCADE,
    message          VARCHAR(255) NOT NULL,
    is_read          BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);


-- =====================================================================
-- INDEXES  (chosen based on the queries the app actually runs)
-- =====================================================================

-- staff queue + department dashboard: WHERE dept_id = ? AND status = ?
CREATE INDEX idx_tickets_dept_status ON tickets (dept_id, status);

-- "My tickets" page for citizens
CREATE INDEX idx_tickets_created_by ON tickets (created_by);

-- "Assigned to me" page and staff workload view
CREATE INDEX idx_tickets_assigned_to ON tickets (assigned_to);

-- escalation check only looks at unfinished tickets, so a partial index is enough
CREATE INDEX idx_tickets_due_open ON tickets (due_at)
    WHERE status IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'REOPENED');

-- full-text (keyword) search on title + description
CREATE INDEX idx_tickets_search ON tickets USING GIN (search_vector);

-- timeline on the ticket detail page
CREATE INDEX idx_history_ticket ON ticket_status_history (ticket_id, changed_at);

CREATE INDEX idx_comments_ticket ON ticket_comments (ticket_id);
CREATE INDEX idx_staff_dept      ON staff (dept_id);

-- unread notification badge in the navbar
CREATE INDEX idx_notifications_unread ON notifications (user_id) WHERE is_read = FALSE;

-- approximate nearest-neighbour index for cosine similarity search
CREATE INDEX idx_embeddings_hnsw ON ticket_embeddings
    USING hnsw (embedding vector_cosine_ops);
