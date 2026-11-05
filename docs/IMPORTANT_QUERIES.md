# Important queries

All of these are in `db/04_important_queries.sql`, which also covers INSERT, UPDATE, DELETE, a stored procedure, EXPLAIN and ALTER. Run the file with:

```bash
psql -U grievance_app -h localhost -d grievance_db -f db/04_important_queries.sql
```

The file is wrapped in `BEGIN ... ROLLBACK`, so it never changes the data. The results below come from the seed data, so dates and counts change as tickets age.

## Ticket list with names (JOIN)

**Used by:** Every ticket list, through `v_ticket_details`

```sql
-- 5. JOIN - ticket list with names (this is what v_ticket_details does)
SELECT t.ticket_id, t.title, d.name AS department, c.full_name AS raised_by,
       a.full_name AS assigned_to, t.status
  FROM tickets t
  JOIN departments d ON d.dept_id = t.dept_id
  JOIN users c       ON c.user_id = t.created_by
  LEFT JOIN users a  ON a.user_id = t.assigned_to
 WHERE t.status = 'ESCALATED'
 ORDER BY t.due_at;
```

| ticket_id | title | department | raised_by | assigned_to | status |
|---|---|---|---|---|---|
| 28 | Washing machines not working in laundry room | Hostel & Accommodation | Ananya Singh | Kavya Nair | ESCALATED |
| 26 | Lab manual not provided for ML lab | Academics & Examinations | Sneha Kulkarni | Pooja Hegde | ESCALATED |
| 34 | Projector HDMI port not working in room 304 | IT Services | Fatima Sheikh | Ravi Menon | ESCALATED |
| 31 | No bus on Saturday for extra classes | Transport | Ananya Singh |  | ESCALATED |
| 36 | Streetlights not working near parking | Campus Maintenance | Neha Jain | Farhan Ali | ESCALATED |
| 37 | Bed bugs in hostel rooms | Hostel & Accommodation | Neha Jain | Kavya Nair | ESCALATED |

_First 6 of 13 rows._

## Department summary (GROUP BY, aggregates)

**Used by:** Head and admin dashboards, through `v_department_stats`

```sql
-- 6. GROUP BY + aggregate - department summary (view)
SELECT dept_name, total_tickets, open_tickets, avg_resolution_hours, within_sla_pct, avg_rating
  FROM v_department_stats
 ORDER BY within_sla_pct NULLS LAST;
```

| dept_name | total_tickets | open_tickets | avg_resolution_hours | within_sla_pct | avg_rating |
|---|---|---|---|---|---|
| Accounts & Fees | 5 | 2 | 89.3 | 33.3 | 3.33 |
| Transport | 5 | 2 | 52.7 | 66.7 | 3.33 |
| Canteen & Mess | 5 | 2 | 27.3 | 66.7 | 3.67 |
| Campus Maintenance | 7 | 3 | 47.5 | 75.0 | 4.00 |
| Hostel & Accommodation | 7 | 2 | 32.4 | 80.0 | 3.75 |
| IT Services | 8 | 3 | 16.2 | 80.0 | 4.25 |
| Academics & Examinations | 7 | 2 | 79.6 | 100.0 | 4.00 |

## Departments with 2 or more escalated tickets (GROUP BY + HAVING)

**Used by:** Admin dashboard

```sql
-- 7. GROUP BY + HAVING - departments with 2 or more escalated tickets
SELECT d.name, COUNT(*) AS escalated_tickets, SUM(t.escalation_count) AS total_escalations
  FROM tickets t
  JOIN departments d ON d.dept_id = t.dept_id
 WHERE t.escalation_count > 0
 GROUP BY d.dept_id, d.name
HAVING COUNT(*) >= 2
 ORDER BY escalated_tickets DESC;
```

| name | escalated_tickets | total_escalations |
|---|---|---|
| IT Services | 4 | 4 |
| Canteen & Mess | 3 | 3 |
| Campus Maintenance | 3 | 3 |
| Accounts & Fees | 3 | 3 |
| Hostel & Accommodation | 3 | 3 |
| Academics & Examinations | 2 | 2 |
| Transport | 2 | 2 |

## Tickets slower than their department average (correlated subquery)

**Used by:** Head dashboard

```sql
-- 8. Correlated subquery - tickets slower than their department average
SELECT t.ticket_id, t.title,
       ROUND(EXTRACT(EPOCH FROM (t.resolved_at - t.created_at)) / 3600, 1) AS hours_taken
  FROM tickets t
 WHERE t.resolved_at IS NOT NULL
   AND (t.resolved_at - t.created_at) > (SELECT AVG(t2.resolved_at - t2.created_at)
                                           FROM tickets t2
                                          WHERE t2.dept_id = t.dept_id
                                            AND t2.resolved_at IS NOT NULL)
 ORDER BY hours_taken DESC;
```

| ticket_id | title | hours_taken |
|---|---|---|
| 13 | Scholarship amount not credited | 150.0 |
| 27 | Revaluation result still pending | 110.0 |
| 1 | Semester results not published | 100.0 |
| 23 | Attendance wrongly marked absent | 96.0 |
| 21 | Bus pass not issued after payment | 90.0 |
| 10 | Water leaking from roof in room 204 | 80.0 |

_First 6 of 12 rows._

## Why the dashboards do not join tickets with history

**Used by:** Testing

```sql
-- 9. Why the dashboard does NOT join tickets with history:
--    the join repeats each ticket once per history row
SELECT COUNT(*)                  AS wrong_count_from_join,
       COUNT(DISTINCT t.ticket_id) AS real_ticket_count
  FROM tickets t
  JOIN ticket_status_history h ON h.ticket_id = t.ticket_id;

-- escalation events vs escalated tickets (a ticket can escalate twice)
SELECT COUNT(*) AS escalation_events, COUNT(DISTINCT ticket_id) AS tickets_escalated
  FROM ticket_status_history
 WHERE new_status = 'ESCALATED';
```

| wrong_count_from_join | real_ticket_count |
|---|---|
| 198 | 44 |

| escalation_events | tickets_escalated |
|---|---|
| 20 | 20 |

## Created vs resolved per week (generate_series, scalar subqueries)

**Used by:** Admin dashboard

```sql
-- 10. Weekly trend with generate_series (created vs resolved)
SELECT to_char(w.week, 'DD Mon') AS week,
       (SELECT COUNT(*) FROM tickets t WHERE date_trunc('week', t.created_at)  = w.week) AS created,
       (SELECT COUNT(*) FROM tickets t WHERE date_trunc('week', t.resolved_at) = w.week) AS resolved
  FROM generate_series(date_trunc('week', now()) - interval '7 weeks',
                       date_trunc('week', now()), interval '1 week') AS w(week)
 ORDER BY w.week;
```

| week | created | resolved |
|---|---|---|
| 14 Sep | 1 | 0 |
| 21 Sep | 3 | 2 |
| 28 Sep | 5 | 6 |
| 05 Oct | 6 | 6 |
| 12 Oct | 6 | 5 |
| 19 Oct | 4 | 5 |
| 26 Oct | 11 | 3 |
| 02 Nov | 8 | 1 |

## Full-text search (tsvector, GIN index)

**Used by:** Keyword search

```sql
-- 11. Full-text search (GIN index on the generated tsvector column)
SELECT ticket_id, title, ts_rank(search_vector, q) AS rank
  FROM tickets, plainto_tsquery('english', 'water leaking') AS q
 WHERE search_vector @@ q
 ORDER BY rank DESC;
```

| ticket_id | title | rank |
|---|---|---|
| 10 | Water leaking from roof in room 204 | 0.14571923 |

## Nearest tickets by meaning (pgvector)

**Used by:** Duplicate check, department suggestion

```sql
-- 12. Vector similarity: nearest tickets to an existing ticket's embedding
--     (from the app the embedding comes from the MiniLM model instead)
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
```

| ticket_id | title | similarity |
|---|---|---|
| 39 | Lift not working in new block | 1.000 |
| 43 | Elevator stuck in the new building | 0.611 |
| 2 | Wi-Fi not working in Block C hostel | 0.349 |
| 18 | Broken benches in seminar hall | 0.340 |
| 25 | Washroom taps leaking in academic block | 0.333 |

| dept_id | dept_name | matches | score |
|---|---|---|---|
| 3 | Canteen & Mess | 2 | 0.968 |

