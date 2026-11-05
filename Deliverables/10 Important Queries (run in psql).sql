-- =====================================================================
--  04_important_queries.sql
--  Queries used by the application, collected in one place for the demo.
--  Safe to run any time: everything is inside BEGIN ... ROLLBACK, so no
--  data is changed.
--      psql -U grievance_app -d grievance_db -f db/04_important_queries.sql
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. DML - INSERT (citizen submits a ticket, trigger fills due_at)
-- ---------------------------------------------------------------------
INSERT INTO tickets (title, description, location, priority, dept_id, created_by)
VALUES ('Lab AC not working', 'The AC in the IoT lab has not been working for two days and the lab is too hot.',
        'IoT lab', 'HIGH',
        (SELECT dept_id FROM departments WHERE name = 'Campus Maintenance'),
        (SELECT user_id FROM users WHERE email = 'rahul@student.campus.edu'))
RETURNING ticket_id, status, created_at, due_at;

-- ---------------------------------------------------------------------
-- 2. Stored procedure - auto assign to least loaded staff (row lock inside)
-- ---------------------------------------------------------------------
CALL auto_assign_ticket(currval('tickets_ticket_id_seq')::int);

SELECT ticket_id, status, assigned_to FROM tickets WHERE ticket_id = currval('tickets_ticket_id_seq');

-- ---------------------------------------------------------------------
-- 3. DML - UPDATE (state change, validated by the trigger)
-- ---------------------------------------------------------------------
UPDATE tickets
   SET status = 'IN_PROGRESS', updated_by = assigned_to
 WHERE ticket_id = currval('tickets_ticket_id_seq');

-- history written automatically by the trigger
SELECT old_status, new_status, changed_by, changed_at
  FROM ticket_status_history
 WHERE ticket_id = currval('tickets_ticket_id_seq')
 ORDER BY history_id;

-- ---------------------------------------------------------------------
-- 4. DML - DELETE (citizen removes their "me too" on a ticket)
-- ---------------------------------------------------------------------
DELETE FROM ticket_supporters
 WHERE ticket_id = (SELECT ticket_id FROM tickets WHERE title = 'Bed bugs in hostel rooms')
   AND user_id   = (SELECT user_id FROM users WHERE email = 'vikram@student.campus.edu');

-- ---------------------------------------------------------------------
-- 5. JOIN - ticket list with names (this is what v_ticket_details does)
-- ---------------------------------------------------------------------
SELECT t.ticket_id, t.title, d.name AS department, c.full_name AS raised_by,
       a.full_name AS assigned_to, t.status
  FROM tickets t
  JOIN departments d ON d.dept_id = t.dept_id
  JOIN users c       ON c.user_id = t.created_by
  LEFT JOIN users a  ON a.user_id = t.assigned_to
 WHERE t.status = 'ESCALATED'
 ORDER BY t.due_at;

-- ---------------------------------------------------------------------
-- 6. GROUP BY + aggregate - department summary (view)
-- ---------------------------------------------------------------------
SELECT dept_name, total_tickets, open_tickets, avg_resolution_hours, within_sla_pct, avg_rating
  FROM v_department_stats
 ORDER BY within_sla_pct NULLS LAST;

-- ---------------------------------------------------------------------
-- 7. GROUP BY + HAVING - departments with 2 or more escalated tickets
-- ---------------------------------------------------------------------
SELECT d.name, COUNT(*) AS escalated_tickets, SUM(t.escalation_count) AS total_escalations
  FROM tickets t
  JOIN departments d ON d.dept_id = t.dept_id
 WHERE t.escalation_count > 0
 GROUP BY d.dept_id, d.name
HAVING COUNT(*) >= 2
 ORDER BY escalated_tickets DESC;

-- ---------------------------------------------------------------------
-- 8. Correlated subquery - tickets slower than their department average
-- ---------------------------------------------------------------------
SELECT t.ticket_id, t.title,
       ROUND(EXTRACT(EPOCH FROM (t.resolved_at - t.created_at)) / 3600, 1) AS hours_taken
  FROM tickets t
 WHERE t.resolved_at IS NOT NULL
   AND (t.resolved_at - t.created_at) > (SELECT AVG(t2.resolved_at - t2.created_at)
                                           FROM tickets t2
                                          WHERE t2.dept_id = t.dept_id
                                            AND t2.resolved_at IS NOT NULL)
 ORDER BY hours_taken DESC;

-- ---------------------------------------------------------------------
-- 9. Why the dashboard does NOT join tickets with history:
--    the join repeats each ticket once per history row
-- ---------------------------------------------------------------------
SELECT COUNT(*)                  AS wrong_count_from_join,
       COUNT(DISTINCT t.ticket_id) AS real_ticket_count
  FROM tickets t
  JOIN ticket_status_history h ON h.ticket_id = t.ticket_id;

-- escalation events vs escalated tickets (a ticket can escalate twice)
SELECT COUNT(*) AS escalation_events, COUNT(DISTINCT ticket_id) AS tickets_escalated
  FROM ticket_status_history
 WHERE new_status = 'ESCALATED';

-- ---------------------------------------------------------------------
-- 10. Weekly trend with generate_series (created vs resolved)
-- ---------------------------------------------------------------------
SELECT to_char(w.week, 'DD Mon') AS week,
       (SELECT COUNT(*) FROM tickets t WHERE date_trunc('week', t.created_at)  = w.week) AS created,
       (SELECT COUNT(*) FROM tickets t WHERE date_trunc('week', t.resolved_at) = w.week) AS resolved
  FROM generate_series(date_trunc('week', now()) - interval '7 weeks',
                       date_trunc('week', now()), interval '1 week') AS w(week)
 ORDER BY w.week;

-- ---------------------------------------------------------------------
-- 11. Full-text search (GIN index on the generated tsvector column)
-- ---------------------------------------------------------------------
SELECT ticket_id, title, ts_rank(search_vector, q) AS rank
  FROM tickets, plainto_tsquery('english', 'water leaking') AS q
 WHERE search_vector @@ q
 ORDER BY rank DESC;

-- ---------------------------------------------------------------------
-- 12. Vector similarity: nearest tickets to an existing ticket's embedding
--     (from the app the embedding comes from the MiniLM model instead)
-- ---------------------------------------------------------------------
SELECT t.ticket_id, t.title, ROUND((1 - (e.embedding <=> src.embedding))::numeric, 3) AS similarity
  FROM ticket_embeddings e
  JOIN tickets t ON t.ticket_id = e.ticket_id
 CROSS JOIN (SELECT embedding FROM ticket_embeddings
              WHERE ticket_id = (SELECT ticket_id FROM tickets WHERE title = 'Lift not working in new block')) src
 ORDER BY e.embedding <=> src.embedding
 LIMIT 5;

SELECT * FROM suggest_department(
    (SELECT embedding FROM ticket_embeddings
      WHERE ticket_id = (SELECT ticket_id FROM tickets WHERE title = 'Mess food quality is very poor')));

-- ---------------------------------------------------------------------
-- 13. Index usage check
-- ---------------------------------------------------------------------
SET LOCAL enable_seqscan = off;   -- table is small, so force the planner to show the index
EXPLAIN SELECT * FROM tickets WHERE dept_id = 1 AND status = 'OPEN';
EXPLAIN SELECT ticket_id FROM tickets WHERE search_vector @@ plainto_tsquery('english', 'wifi');

-- ---------------------------------------------------------------------
-- 14. ALTER / DROP examples (DDL changes on a live table)
-- ---------------------------------------------------------------------
ALTER TABLE tickets ADD COLUMN category VARCHAR(40);
ALTER TABLE tickets ADD CONSTRAINT chk_category CHECK (category IN ('Infrastructure', 'Academic', 'Services'));
ALTER TABLE tickets DROP CONSTRAINT chk_category;
ALTER TABLE tickets DROP COLUMN category;

ROLLBACK;
