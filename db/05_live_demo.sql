-- =====================================================================
--  05_live_demo.sql
--  Demonstrates the database rules live: DDL, constraints, the state
--  machine trigger, procedures, escalation, views, vector search and
--  EXPLAIN. Copy the blocks into psql one at a time, or run the whole file:
--      psql -U grievance_app -h localhost -d grievance_db -f db/05_live_demo.sql
--  Everything is inside BEGIN ... ROLLBACK, so no data is changed.
--  Some statements are meant to fail. ON_ERROR_ROLLBACK lets the script
--  carry on after showing the error.
-- =====================================================================

\set ON_ERROR_ROLLBACK on
\echo
\echo '=== 1. DDL: change a live table ==='
BEGIN;
ALTER TABLE tickets ADD COLUMN category VARCHAR(40);
ALTER TABLE tickets ADD CONSTRAINT chk_category CHECK (category IN ('Infrastructure', 'Academic', 'Services'));
\d tickets
ALTER TABLE tickets DROP CONSTRAINT chk_category;
ALTER TABLE tickets DROP COLUMN category;

\echo
\echo '=== 2. CHECK constraints: each of these must fail ==='
INSERT INTO users (full_name, email, password_hash)
VALUES ('Bad Email', 'not-an-email', '$2a$10$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');

INSERT INTO users (full_name, email, password_hash)
VALUES ('Plain Password', 'plain@campus.edu', 'Password@123');

UPDATE departments SET sla_hours = 1000 WHERE name = 'IT Services';

\echo
\echo '=== 3. State machine: a ticket cannot skip steps ==='
INSERT INTO tickets (title, description, dept_id, created_by)
VALUES ('Demo ticket', 'A complaint created during the demo to show the workflow.',
        (SELECT dept_id FROM departments WHERE name = 'IT Services'),
        (SELECT user_id FROM users WHERE email = 'ananya@student.campus.edu'));

-- must fail: OPEN -> RESOLVED is not in status_transitions
UPDATE tickets SET status = 'RESOLVED' WHERE title = 'Demo ticket';

-- must fail: a new ticket has to start as OPEN
INSERT INTO tickets (title, description, dept_id, created_by, status)
VALUES ('Skipping the workflow', 'Trying to create a ticket that is already resolved.', 1, 20, 'RESOLVED');

-- must fail: a closed ticket is read-only
UPDATE tickets SET title = 'Changed title' WHERE ticket_id = (SELECT MIN(ticket_id) FROM tickets WHERE status = 'CLOSED');

\echo
\echo '=== 4. Stored procedure: auto-assign, then history written by the trigger ==='
SELECT ticket_id, status, due_at FROM tickets WHERE title = 'Demo ticket';
SELECT ticket_id AS demo_id FROM tickets WHERE title = 'Demo ticket' \gset
CALL auto_assign_ticket(:demo_id);
SELECT old_status, new_status, changed_at
  FROM ticket_status_history
 WHERE ticket_id = (SELECT ticket_id FROM tickets WHERE title = 'Demo ticket')
 ORDER BY history_id;

\echo
\echo '=== 5. Escalation: make it overdue, run the check ==='
UPDATE tickets SET due_at = now() - interval '1 hour' WHERE title = 'Demo ticket';
SELECT escalate_overdue_tickets() AS tickets_escalated;
SELECT status, escalation_count FROM tickets WHERE title = 'Demo ticket';
SELECT u.full_name, n.message
  FROM notifications n JOIN users u ON u.user_id = n.user_id
 WHERE n.ticket_id = (SELECT ticket_id FROM tickets WHERE title = 'Demo ticket');

\echo
\echo '=== 6. Views ==='
SELECT dept_name, total_tickets, open_tickets, avg_resolution_hours, within_sla_pct
  FROM v_department_stats ORDER BY total_tickets DESC;

\echo
\echo '=== 7. Vector search: nearest tickets by meaning ==='
SELECT t.ticket_id, t.title, ROUND((1 - (e.embedding <=> src.embedding))::numeric, 3) AS similarity
  FROM ticket_embeddings e
  JOIN tickets t ON t.ticket_id = e.ticket_id
 CROSS JOIN (SELECT embedding FROM ticket_embeddings
              WHERE ticket_id = (SELECT ticket_id FROM tickets WHERE title = 'Lift not working in new block')) src
 ORDER BY e.embedding <=> src.embedding
 LIMIT 4;

\echo
\echo '=== 8. Index usage ==='
SET LOCAL enable_seqscan = off;
EXPLAIN SELECT * FROM tickets WHERE dept_id = 1 AND status = 'OPEN';

ROLLBACK;
\echo
\echo 'Rolled back, nothing was changed.'

-- ---------------------------------------------------------------------
-- 9. Row lock demo. Do this by hand in TWO psql windows.
--
--   Window 1:  BEGIN;
--              SELECT ticket_id, status FROM tickets WHERE ticket_id = 41 FOR UPDATE;
--
--   Window 2:  BEGIN;
--              SELECT ticket_id, status FROM tickets WHERE ticket_id = 41 FOR UPDATE;
--              (this waits, because window 1 holds the lock)
--
--   Window 1:  ROLLBACK;
--   Window 2:  the SELECT now returns. Then run ROLLBACK; here too.
-- ---------------------------------------------------------------------
