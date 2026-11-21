-- =====================================================================
--  02_views.sql  :  Views used by the ticket pages and the dashboards
-- =====================================================================

-- ---------------------------------------------------------------------
-- v_ticket_details
-- One row per ticket with the names joined in, used by every ticket list.
-- supporter_count is a scalar subquery instead of a JOIN + GROUP BY, so a
-- ticket with many supporters is still only returned once.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_ticket_details AS
SELECT
    t.ticket_id,
    t.title,
    t.description,
    t.location,
    t.priority,
    t.status,
    s.label                 AS status_label,
    s.is_open,
    t.dept_id,
    d.name                  AS dept_name,
    t.created_by,
    c.full_name             AS created_by_name,
    t.assigned_to,
    a.full_name             AS assigned_to_name,
    t.possible_duplicate_of,
    t.escalation_count,
    t.rating,
    t.due_at,
    t.resolved_at,
    t.created_at,
    t.updated_at,
    (s.is_open AND t.due_at < now()) AS is_overdue,
    (SELECT COUNT(*) FROM ticket_supporters sp
      WHERE sp.ticket_id = t.ticket_id)  AS supporter_count
FROM tickets t
JOIN departments     d ON d.dept_id     = t.dept_id
JOIN users           c ON c.user_id     = t.created_by
JOIN ticket_statuses s ON s.status_code = t.status
LEFT JOIN users      a ON a.user_id     = t.assigned_to;


-- ---------------------------------------------------------------------
-- v_department_stats
-- Department-level numbers for the head and admin dashboards.
-- Everything is counted from the tickets table only. "ever_escalated" uses
-- tickets.escalation_count instead of joining the history table, because a
-- join with history would repeat each ticket once per history row and
-- inflate every COUNT and AVG.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_department_stats AS
SELECT
    d.dept_id,
    d.name                                                        AS dept_name,
    d.sla_hours,
    COUNT(t.ticket_id)                                            AS total_tickets,
    -- FILTER counts only the rows that match the condition, so one query can give many totals.
    COUNT(t.ticket_id) FILTER (WHERE s.is_open)                   AS open_tickets,
    COUNT(t.ticket_id) FILTER (WHERE t.status = 'ESCALATED')      AS currently_escalated,
    COUNT(t.ticket_id) FILTER (WHERE t.escalation_count > 0)      AS ever_escalated,
    COUNT(t.resolved_at)                                          AS resolved_tickets,
    ROUND(AVG(EXTRACT(EPOCH FROM (t.resolved_at - t.created_at)) / 3600)::numeric, 1)
                                                                  AS avg_resolution_hours,
    ROUND(AVG(t.rating)::numeric, 2)                              AS avg_rating,
    -- NULLIF avoids dividing by zero for a department with no resolved tickets.
    ROUND(100.0 * COUNT(t.ticket_id) FILTER (WHERE t.resolved_at <= t.due_at)
          / NULLIF(COUNT(t.resolved_at), 0), 1)                   AS within_sla_pct
FROM departments d
-- LEFT JOIN keeps departments that have no tickets yet, with a count of 0.
LEFT JOIN tickets         t ON t.dept_id     = d.dept_id
LEFT JOIN ticket_statuses s ON s.status_code = t.status
GROUP BY d.dept_id, d.name, d.sla_hours;


-- ---------------------------------------------------------------------
-- v_staff_workload
-- Active and resolved ticket counts per staff member.
-- Used by the head dashboard and by the auto_assign_ticket procedure
-- (least loaded available staff member gets the new ticket).
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_staff_workload AS
SELECT
    st.staff_id,
    u.full_name,
    u.email,
    u.role,
    u.is_active,
    st.dept_id,
    d.name               AS dept_name,
    st.designation,
    st.is_available,
    COUNT(t.ticket_id) FILTER (WHERE t.status IN ('ASSIGNED', 'IN_PROGRESS', 'ESCALATED', 'REOPENED'))
                         AS active_tickets,
    COUNT(t.resolved_at) AS resolved_tickets,
    ROUND(AVG(EXTRACT(EPOCH FROM (t.resolved_at - t.created_at)) / 3600)::numeric, 1)
                         AS avg_resolution_hours
FROM staff st
JOIN users       u ON u.user_id = st.staff_id
JOIN departments d ON d.dept_id = st.dept_id
LEFT JOIN tickets t ON t.assigned_to = st.staff_id
-- Every column that is not inside COUNT or AVG must be listed in GROUP BY.
GROUP BY st.staff_id, u.full_name, u.email, u.role, u.is_active,
         st.dept_id, d.name, st.designation, st.is_available;
