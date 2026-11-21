-- =====================================================================
--  03_functions_triggers.sql
--  Stored functions, stored procedures and triggers.
--
--  Escalation rules (decided by us, implemented below):
--   1. due_at = time the ticket was opened + department SLA.
--      HIGH priority tickets get half the SLA.
--   2. If a ticket is still OPEN / ASSIGNED / IN_PROGRESS / REOPENED after
--      due_at, it becomes ESCALATED and the department head is notified.
--   3. When the head re-assigns an escalated ticket, a fresh SLA window
--      starts. If it breaches again, the admins are notified as well.
--   4. Reopening a resolved ticket resets the timer (new full SLA window).
--   5. The timer stops once the ticket is RESOLVED.
-- =====================================================================


-- ---------------------------------------------------------------------
-- compute_due_at : deadline for a ticket based on department SLA + priority
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION compute_due_at(p_dept_id INT, p_priority VARCHAR, p_from TIMESTAMPTZ)
RETURNS TIMESTAMPTZ AS $$
DECLARE
    v_hours INT;
BEGIN
    SELECT sla_hours INTO v_hours FROM departments WHERE dept_id = p_dept_id;

    IF p_priority = 'HIGH' THEN
        v_hours := GREATEST(v_hours / 2, 1);
    END IF;

    RETURN p_from + make_interval(hours => v_hours);
END;
$$ LANGUAGE plpgsql;


-- ---------------------------------------------------------------------
-- TRIGGER: before a ticket is inserted
--  * a new ticket must always start as OPEN (cannot skip the workflow)
--  * due_at is calculated here, not by the application
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_ticket_before_insert()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status <> 'OPEN' THEN
        RAISE EXCEPTION 'A new ticket must start with status OPEN (got %)', NEW.status;
    END IF;

    NEW.due_at      := compute_due_at(NEW.dept_id, NEW.priority, NEW.created_at);
    NEW.updated_at  := NEW.created_at;
    NEW.updated_by  := NEW.created_by;
    NEW.assigned_to := NULL;
    NEW.resolved_at := NULL;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ticket_before_insert ON tickets;
CREATE TRIGGER ticket_before_insert
    BEFORE INSERT ON tickets
    FOR EACH ROW EXECUTE FUNCTION trg_ticket_before_insert();


-- ---------------------------------------------------------------------
-- TRIGGER: before a ticket is updated  (the state machine)
--  * rejects any status change not listed in status_transitions
--  * closed tickets are read-only
--  * assignee must belong to the ticket's department
--  * maintains resolved_at, due_at and escalation_count
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_ticket_before_update()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status = 'CLOSED' THEN
        RAISE EXCEPTION 'Ticket #% is closed and cannot be changed', OLD.ticket_id;
    END IF;

    IF NEW.dept_id <> OLD.dept_id THEN
        RAISE EXCEPTION 'Department of a ticket cannot be changed after submission';
    END IF;

    IF NEW.status <> OLD.status THEN
        -- 1. is this move allowed?
        -- OLD is the row before the update, NEW is the row after it.
        IF NOT EXISTS (SELECT 1 FROM status_transitions
                        WHERE from_status = OLD.status AND to_status = NEW.status) THEN
            RAISE EXCEPTION 'Invalid status change for ticket #%: % -> %',
                            OLD.ticket_id, OLD.status, NEW.status;
        END IF;

        -- 2. side effects of the new status
        IF NEW.status = 'RESOLVED' THEN
            NEW.resolved_at := COALESCE(NEW.resolved_at, now());
        ELSIF NEW.status = 'REOPENED' THEN
            NEW.resolved_at := NULL;
            NEW.due_at      := compute_due_at(NEW.dept_id, NEW.priority, now());   -- rule 4
        ELSIF NEW.status = 'ESCALATED' THEN
            NEW.escalation_count := OLD.escalation_count + 1;
        ELSIF OLD.status = 'ESCALATED' AND NEW.status = 'ASSIGNED' THEN
            NEW.due_at      := compute_due_at(NEW.dept_id, NEW.priority, now());   -- rule 3
        END IF;
    END IF;

    -- 3. assignee must work in the same department as the ticket
    IF NEW.assigned_to IS NOT NULL AND NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
        IF NOT EXISTS (SELECT 1 FROM staff
                        WHERE staff_id = NEW.assigned_to AND dept_id = NEW.dept_id) THEN
            RAISE EXCEPTION 'Staff member % does not belong to the department of ticket #%',
                            NEW.assigned_to, NEW.ticket_id;
        END IF;
    END IF;

    -- Returning NEW saves the row. Raising an exception cancels the whole statement.
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ticket_before_update ON tickets;
CREATE TRIGGER ticket_before_update
    BEFORE UPDATE ON tickets
    FOR EACH ROW EXECUTE FUNCTION trg_ticket_before_update();


-- ---------------------------------------------------------------------
-- TRIGGER: after a ticket is inserted / its status or assignee changes
--  * writes the history row
--  * creates notifications for the people who need to know
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_ticket_after_change()
RETURNS TRIGGER AS $$
DECLARE
    v_head_id INT;
BEGIN
    -- TG_OP tells us which operation fired this trigger. There is no OLD row on INSERT.
    IF TG_OP = 'INSERT' THEN
        INSERT INTO ticket_status_history (ticket_id, old_status, new_status, changed_by, changed_at)
        VALUES (NEW.ticket_id, NULL, NEW.status, NEW.created_by, NEW.created_at);
        RETURN NEW;
    END IF;

    -- UPDATE: nothing to log if neither status nor assignee changed
    IF NEW.status = OLD.status AND NEW.assigned_to IS NOT DISTINCT FROM OLD.assigned_to THEN
        RETURN NEW;
    END IF;

    INSERT INTO ticket_status_history (ticket_id, old_status, new_status, assigned_to, changed_by)
    VALUES (NEW.ticket_id, OLD.status, NEW.status, NEW.assigned_to, NEW.updated_by);

    -- new assignee gets a notification
    IF NEW.assigned_to IS NOT NULL AND NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
       AND NEW.assigned_to IS DISTINCT FROM NEW.updated_by THEN
        INSERT INTO notifications (user_id, ticket_id, message)
        VALUES (NEW.assigned_to, NEW.ticket_id,
                'Ticket #' || NEW.ticket_id || ' has been assigned to you');
    END IF;

    IF NEW.status <> OLD.status THEN
        -- the person who raised the complaint is told about every status change
        IF NEW.created_by IS DISTINCT FROM NEW.updated_by THEN
            INSERT INTO notifications (user_id, ticket_id, message)
            VALUES (NEW.created_by, NEW.ticket_id,
                    'Your ticket #' || NEW.ticket_id || ' is now ' || NEW.status);
        END IF;

        -- so are the people who said "I have the same problem"
        INSERT INTO notifications (user_id, ticket_id, message)
        SELECT user_id, NEW.ticket_id,
               'Ticket #' || NEW.ticket_id || ' that you are following is now ' || NEW.status
        FROM ticket_supporters
        WHERE ticket_id = NEW.ticket_id
          AND user_id IS DISTINCT FROM NEW.updated_by;

        IF NEW.status = 'ESCALATED' THEN
            SELECT head_id INTO v_head_id FROM departments WHERE dept_id = NEW.dept_id;
            IF v_head_id IS NOT NULL THEN
                INSERT INTO notifications (user_id, ticket_id, message)
                VALUES (v_head_id, NEW.ticket_id,
                        'Ticket #' || NEW.ticket_id || ' crossed its SLA and was escalated');
            END IF;

            -- second breach -> admins are informed too (rule 3)
            IF NEW.escalation_count >= 2 THEN
                INSERT INTO notifications (user_id, ticket_id, message)
                SELECT user_id, NEW.ticket_id,
                       'Ticket #' || NEW.ticket_id || ' escalated ' || NEW.escalation_count || ' times'
                FROM users WHERE role = 'admin' AND is_active;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ticket_after_change ON tickets;
CREATE TRIGGER ticket_after_change
    AFTER INSERT OR UPDATE OF status, assigned_to ON tickets
    FOR EACH ROW EXECUTE FUNCTION trg_ticket_after_change();


-- ---------------------------------------------------------------------
-- TRIGGER: a staff row can only exist for users with role staff / dept_head
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_staff_role_check()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM users
                    WHERE user_id = NEW.staff_id AND role IN ('staff', 'dept_head')) THEN
        RAISE EXCEPTION 'User % must have role staff or dept_head to be added as staff', NEW.staff_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS staff_role_check ON staff;
CREATE TRIGGER staff_role_check
    BEFORE INSERT OR UPDATE ON staff
    FOR EACH ROW EXECUTE FUNCTION trg_staff_role_check();


-- ---------------------------------------------------------------------
-- TRIGGER: department head must be a dept_head working in that department
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_department_head_check()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.head_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM staff s JOIN users u ON u.user_id = s.staff_id
         WHERE s.staff_id = NEW.head_id AND s.dept_id = NEW.dept_id AND u.role = 'dept_head') THEN
        RAISE EXCEPTION 'Head of % must be a dept_head of the same department', NEW.name;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS department_head_check ON departments;
CREATE TRIGGER department_head_check
    BEFORE INSERT OR UPDATE OF head_id ON departments
    FOR EACH ROW EXECUTE FUNCTION trg_department_head_check();


-- =====================================================================
--  STORED PROCEDURES  (assignment)
--  Both lock the ticket row with SELECT ... FOR UPDATE, so if two people
--  act on the same ticket at the same moment the second one waits, then
--  sees the updated row and fails with a clear message instead of
--  silently overwriting the first person's change.
--  The application calls them inside BEGIN ... COMMIT.
-- =====================================================================

-- ---------------------------------------------------------------------
-- claim_ticket : a staff member picks an unassigned ticket from the queue
-- ---------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE claim_ticket(p_ticket_id INT, p_staff_id INT)
LANGUAGE plpgsql AS $$
DECLARE
    v_status      VARCHAR(20);
    v_assigned_to INT;
BEGIN
    SELECT status, assigned_to INTO v_status, v_assigned_to
    FROM tickets WHERE ticket_id = p_ticket_id
    FOR UPDATE;                                   -- row-level lock

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ticket #% does not exist', p_ticket_id;
    END IF;

    IF v_status <> 'OPEN' OR v_assigned_to IS NOT NULL THEN
        RAISE EXCEPTION 'Ticket #% was already picked up by someone else', p_ticket_id;
    END IF;

    UPDATE tickets
       SET assigned_to = p_staff_id, status = 'ASSIGNED', updated_by = p_staff_id
     WHERE ticket_id = p_ticket_id;
END;
$$;


-- ---------------------------------------------------------------------
-- assign_ticket : head / admin assigns or re-assigns a ticket
--                 p_actor_id NULL means the system did it (auto-assign)
-- ---------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE assign_ticket(p_ticket_id INT, p_staff_id INT, p_actor_id INT)
LANGUAGE plpgsql AS $$
DECLARE
    v_status VARCHAR(20);
BEGIN
    SELECT status INTO v_status
    FROM tickets WHERE ticket_id = p_ticket_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ticket #% does not exist', p_ticket_id;
    END IF;

    IF v_status NOT IN ('OPEN', 'ASSIGNED', 'ESCALATED', 'REOPENED') THEN
        RAISE EXCEPTION 'Ticket #% cannot be assigned while it is %', p_ticket_id, v_status;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM staff s JOIN users u ON u.user_id = s.staff_id
                    WHERE s.staff_id = p_staff_id AND u.is_active) THEN
        RAISE EXCEPTION 'Staff member % is not active', p_staff_id;
    END IF;

    -- department check is done by the before-update trigger
    UPDATE tickets
       SET assigned_to = p_staff_id, status = 'ASSIGNED', updated_by = p_actor_id
     WHERE ticket_id = p_ticket_id;
END;
$$;


-- ---------------------------------------------------------------------
-- auto_assign_ticket : called right after a ticket is submitted.
-- Picks the available staff member (not the head) with the fewest active
-- tickets. If nobody is available the ticket stays OPEN in the queue.
-- ---------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE auto_assign_ticket(p_ticket_id INT)
LANGUAGE plpgsql AS $$
DECLARE
    v_dept_id  INT;
    v_staff_id INT;
BEGIN
    SELECT dept_id INTO v_dept_id FROM tickets WHERE ticket_id = p_ticket_id;

    SELECT staff_id INTO v_staff_id
    FROM v_staff_workload
    WHERE dept_id = v_dept_id
      AND role = 'staff'
      AND is_available
      AND is_active
    ORDER BY active_tickets ASC, staff_id ASC
    LIMIT 1;

    IF v_staff_id IS NULL THEN
        RAISE NOTICE 'No available staff in department %, ticket #% stays OPEN', v_dept_id, p_ticket_id;
        RETURN;
    END IF;

    -- NULL as the actor means the system did it, so history shows "System".
    CALL assign_ticket(p_ticket_id, v_staff_id, NULL);
END;
$$;


-- ---------------------------------------------------------------------
-- escalate_overdue_tickets : moves every overdue ticket to ESCALATED.
-- The actual side effects (history, escalation_count, notifications) come
-- from the triggers above. Returns how many tickets were escalated.
-- The app calls this before loading queues/dashboards, and the admin can
-- also run it manually. (In production this would be scheduled with pg_cron.)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION escalate_overdue_tickets()
RETURNS INT AS $$
DECLARE
    v_count INT;
BEGIN
    UPDATE tickets
       SET status = 'ESCALATED', updated_by = NULL
     WHERE due_at < now()
       AND status IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'REOPENED');

    -- ROW_COUNT is the number of rows the UPDATE just changed.
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;


-- =====================================================================
--  VECTOR SIMILARITY FUNCTIONS  (pgvector)
--  <=> is the cosine distance operator, so similarity = 1 - distance.
-- =====================================================================

-- ---------------------------------------------------------------------
-- find_similar_tickets : possible duplicates among tickets that are
-- still open. Used on the submission form before the ticket is saved.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION find_similar_tickets(p_embedding VECTOR(384),
                                                p_min_similarity FLOAT DEFAULT 0.6,
                                                p_limit INT DEFAULT 5)
RETURNS TABLE (ticket_id INT, title VARCHAR, status VARCHAR, dept_name VARCHAR,
               created_at TIMESTAMPTZ, similarity FLOAT) AS $$
    SELECT t.ticket_id, t.title, t.status, d.name, t.created_at,
           1 - (e.embedding <=> p_embedding) AS similarity
    FROM ticket_embeddings e
    JOIN tickets         t ON t.ticket_id   = e.ticket_id
    JOIN departments     d ON d.dept_id     = t.dept_id
    JOIN ticket_statuses s ON s.status_code = t.status
    WHERE s.is_open
      AND 1 - (e.embedding <=> p_embedding) >= p_min_similarity
    ORDER BY e.embedding <=> p_embedding
    LIMIT p_limit;
$$ LANGUAGE sql STABLE;


-- ---------------------------------------------------------------------
-- suggest_department : k nearest past tickets vote for their department,
-- each vote weighted by its similarity.
-- Only tickets the department is handling or has resolved are used. An
-- unassigned OPEN ticket only has the department the citizen picked, and a
-- withdrawn ticket was never worked on.
-- (We first used resolved tickets only, but then "WiFi down in my hostel"
-- was sent to Hostel because IT had just one resolved Wi-Fi case.)
-- Neighbours below p_min_similarity do not vote: in testing, "fan noise in
-- classroom" had the right nearest match (Maintenance, 0.66) but was
-- outvoted by three weakly related hostel tickets (0.27 - 0.48) when all 7
-- neighbours were allowed to vote.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION suggest_department(p_embedding VECTOR(384), p_k INT DEFAULT 7,
                                              p_min_similarity FLOAT DEFAULT 0.4)
RETURNS TABLE (dept_id INT, dept_name VARCHAR, matches BIGINT, score NUMERIC) AS $$
    WITH nearest AS (
        SELECT t.dept_id, 1 - (e.embedding <=> p_embedding) AS sim
        FROM ticket_embeddings e
        JOIN tickets t ON t.ticket_id = e.ticket_id
        WHERE ((t.assigned_to IS NOT NULL AND t.status <> 'CLOSED') OR t.resolved_at IS NOT NULL)
          AND 1 - (e.embedding <=> p_embedding) >= p_min_similarity
        ORDER BY e.embedding <=> p_embedding
        LIMIT p_k
    )
    SELECT d.dept_id, d.name, COUNT(*), ROUND(SUM(n.sim)::numeric, 3)
    FROM nearest n
    JOIN departments d ON d.dept_id = n.dept_id
    GROUP BY d.dept_id, d.name
    ORDER BY 4 DESC;
$$ LANGUAGE sql STABLE;
