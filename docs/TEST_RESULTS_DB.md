# Database test results

Run on 2026-11-05 03:45 UTC with `npm run db:test`. Each test runs in a transaction that is rolled back.

**36 of 36 passed.**

| ID | Area | Test case | Result | Detail |
|---|---|---|---|---|
| T01 | Constraints (data validation at database level) | Invalid email format is rejected | PASS | chk_user_email |
| T02 | Constraints (data validation at database level) | Same email with different case is rejected | PASS | idx_users_email_lower |
| T03 | Constraints (data validation at database level) | Plain text password is rejected | PASS | chk_user_password |
| T04 | Constraints (data validation at database level) | Unknown role is rejected | PASS | chk_user_role |
| T05 | Constraints (data validation at database level) | Too short description is rejected | PASS | chk_ticket_description |
| T06 | Constraints (data validation at database level) | Invalid priority is rejected | PASS | chk_ticket_priority |
| T07 | Constraints (data validation at database level) | SLA outside 1-720 hours is rejected | PASS | chk_sla_hours |
| T08 | Constraints (data validation at database level) | Rating on a ticket that is not closed is rejected | PASS | chk_rating_only_closed |
| T09 | Constraints (data validation at database level) | Ticket for a non-existent department is rejected (FK) | PASS | tickets_dept_id_fkey |
| T10 | Constraints (data validation at database level) | Same citizen cannot support a ticket twice (composite PK) | PASS | ticket_supporters_pkey |
| T11 | Triggers (workflow enforcement) | New ticket cannot start as RESOLVED | PASS | A new ticket must start with status OPEN (got RESOLVED) |
| T12 | Triggers (workflow enforcement) | OPEN -> RESOLVED directly is rejected | PASS | Invalid status change for ticket #201: OPEN -> RESOLVED |
| T13 | Triggers (workflow enforcement) | Assigning to staff of another department is rejected | PASS | Staff member 6 does not belong to the department of ticket #202 |
| T14 | Triggers (workflow enforcement) | Closed ticket cannot be modified | PASS | Ticket #1 is closed and cannot be changed |
| T15 | Triggers (workflow enforcement) | Citizen cannot be added to the staff table | PASS | User 20 must have role staff or dept_head to be added as staff |
| T16 | Triggers (workflow enforcement) | due_at = created_at + SLA (24h), HIGH priority gets half (12h) | PASS | MEDIUM: 24h, HIGH: 12h |
| T17 | Triggers (workflow enforcement) | Every status change is written to history by trigger | PASS | NULL->OPEN, OPEN->ASSIGNED, ASSIGNED->IN_PROGRESS |
| T18 | Triggers (workflow enforcement) | Overdue ticket is escalated and the head is notified | PASS | status=ESCALATED, escalation_count=1, head notified=true |
| T19 | Triggers (workflow enforcement) | Re-assigning an escalated ticket gives a new deadline | PASS | status=ASSIGNED, new due in future=true |
| T20 | Triggers (workflow enforcement) | Reopening clears resolved_at and resets the SLA timer | PASS | resolved_at=null, new due in future=true |
| T21 | Triggers (workflow enforcement) | Citizens following a ticket are notified of status changes | PASS | Ticket #208 that you are following is now ASSIGNED |
| T22 | Triggers (workflow enforcement) | Citizen can withdraw a ticket that is assigned but not started | PASS | status=CLOSED |
| T23 | Triggers (workflow enforcement) | Ticket in progress cannot be withdrawn | PASS | Invalid status change for ticket #210: IN_PROGRESS -> CLOSED |
| T24 | Stored procedures | auto_assign_ticket picks the least loaded available staff | PASS | assigned_to=3, status=ASSIGNED |
| T25 | Stored procedures | No available staff -> ticket stays OPEN in the queue | PASS | status=OPEN |
| T26 | Concurrency: two staff pick up the same ticket at the same time | WITHOUT row lock: both staff "succeed" (lost update - shows the problem) | PASS | both read OPEN, first staff's assignment was overwritten by the second |
| T27 | Concurrency: two staff pick up the same ticket at the same time | WITH claim_ticket (FOR UPDATE): first wins, second gets a clear error | PASS | Ticket #214 was already picked up by someone else |
| T28 | Views / aggregate correctness | v_department_stats totals match COUNT(*) on tickets | PASS |  |
| T29 | Views / aggregate correctness | Naive JOIN with history over-counts (why the view avoids it) | PASS | JOIN gives 35 rows, real ticket count is 8 |
| T30 | Vector similarity (pgvector) | Re-worded hostel internet complaint finds the existing open ticket | PASS | #44 "No internet connection in my hostel room" similarity 0.790 |
| T31 | Vector similarity (pgvector) | Unrelated complaint does not match anything above 0.6 | PASS | 0 matches |
| T32 | Vector similarity (pgvector) | suggest_department -> IT Services | PASS | got "IT Services" (score 0.545) |
| T33 | Vector similarity (pgvector) | suggest_department -> Canteen & Mess | PASS | got "Canteen & Mess" (score 1.491) |
| T34 | Vector similarity (pgvector) | suggest_department -> Academics & Examinations | PASS | got "Academics & Examinations" (score 1.584) |
| T35 | Vector similarity (pgvector) | suggest_department -> Campus Maintenance | PASS | got "Campus Maintenance" (score 0.660) |
| T36 | Full-text search vs semantic search | Keyword search needs exact words, semantic search finds related wording | PASS | keyword: 0 results, semantic: 2 open results |
