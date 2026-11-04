# Testing

## 1. Automated database tests – `npm run db:test`

`scripts/test-db.js` runs directly against PostgreSQL after `db:setup` and `db:seed`. Each test runs inside a transaction that is rolled back. The concurrency tests need real commits, so they delete their own tickets afterwards.

Test data covers the cases that uniform sample data would miss:

- complaints that describe the same problem in different words (lift / elevator, Wi-Fi / internet),
- tickets that are past their SLA (7 get escalated by the seed),
- a department with no available staff (Transport), so tickets stay in the OPEN queue,
- tickets that were escalated and re-assigned before being resolved,
- a reopened ticket.

Output on PostgreSQL 18.1 + pgvector 0.8.1:

```
--- Constraints (data validation at database level) ---
PASS  Invalid email format is rejected  ->  chk_user_email
PASS  Same email with different case is rejected  ->  idx_users_email_lower
PASS  Plain text password is rejected  ->  chk_user_password
PASS  Unknown role is rejected  ->  chk_user_role
PASS  Too short description is rejected  ->  chk_ticket_description
PASS  Invalid priority is rejected  ->  chk_ticket_priority
PASS  SLA outside 1-720 hours is rejected  ->  chk_sla_hours
PASS  Rating on a ticket that is not closed is rejected  ->  chk_rating_only_closed
PASS  Ticket for a non-existent department is rejected (FK)  ->  tickets_dept_id_fkey
PASS  Same citizen cannot support a ticket twice (composite PK)  ->  ticket_supporters_pkey

--- Triggers (workflow enforcement) ---
PASS  New ticket cannot start as RESOLVED  ->  A new ticket must start with status OPEN (got RESOLVED)
PASS  OPEN -> RESOLVED directly is rejected  ->  Invalid status change for ticket #49: OPEN -> RESOLVED
PASS  Assigning to staff of another department is rejected  ->  Staff member 6 does not belong to the department of ticket #50
PASS  Closed ticket cannot be modified  ->  Ticket #1 is closed and cannot be changed
PASS  Citizen cannot be added to the staff table  ->  User 20 must have role staff or dept_head to be added as staff
PASS  due_at = created_at + SLA (24h), HIGH priority gets half (12h)  ->  MEDIUM: 24h, HIGH: 12h
PASS  Every status change is written to history by trigger  ->  NULL->OPEN, OPEN->ASSIGNED, ASSIGNED->IN_PROGRESS
PASS  Overdue ticket is escalated and the head is notified  ->  status=ESCALATED, escalation_count=1, head notified=true
PASS  Re-assigning an escalated ticket gives a new deadline  ->  status=ASSIGNED, new due in future=true
PASS  Reopening clears resolved_at and resets the SLA timer  ->  resolved_at=null, new due in future=true
PASS  Citizens following a ticket are notified of status changes  ->  Ticket #56 that you are following is now ASSIGNED
PASS  Citizen can withdraw a ticket that is assigned but not started  ->  status=CLOSED
PASS  Ticket in progress cannot be withdrawn  ->  Invalid status change for ticket #58: IN_PROGRESS -> CLOSED

--- Stored procedures ---
PASS  auto_assign_ticket picks the least loaded available staff  ->  assigned_to=3, status=ASSIGNED
PASS  No available staff -> ticket stays OPEN in the queue  ->  status=OPEN

--- Concurrency: two staff pick up the same ticket at the same time ---
PASS  WITHOUT row lock: both staff "succeed" (lost update - shows the problem)  ->  both read OPEN, first staff's assignment was overwritten by the second
PASS  WITH claim_ticket (FOR UPDATE): first wins, second gets a clear error  ->  Ticket #62 was already picked up by someone else

--- Views / aggregate correctness ---
PASS  v_department_stats totals match COUNT(*) on tickets
PASS  Naive JOIN with history over-counts (why the view avoids it)  ->  JOIN gives 34 rows, real ticket count is 8

--- Vector similarity (pgvector) ---
PASS  Re-worded hostel internet complaint finds the existing open ticket  ->  #44 "No internet connection in my hostel room" similarity 0.790
PASS  Unrelated complaint does not match anything above 0.6  ->  0 matches
PASS  suggest_department -> IT Services  ->  got "IT Services" (score 0.545)
PASS  suggest_department -> Canteen & Mess  ->  got "Canteen & Mess" (score 1.491)
PASS  suggest_department -> Academics & Examinations  ->  got "Academics & Examinations" (score 1.584)
PASS  suggest_department -> Campus Maintenance  ->  got "Campus Maintenance" (score 0.660)

--- Full-text search vs semantic search ---
PASS  Keyword search needs exact words, semantic search finds related wording  ->  keyword: 0 results, semantic: 2 open results

36 / 36 tests passed
```

### Problems the tests found (and what we changed)

| First run | Fix |
|---|---|
| `suggest_department` sent *"food in the hostel mess is cold"* to **Hostel** and *"fan making noise in classroom"* to **Hostel**. The nearest match was correct both times, but 3–4 weakly similar hostel tickets (0.27–0.48) outvoted it. | Added `p_min_similarity = 0.4`, so only reasonably similar cases vote. |
| Duplicate threshold 0.65 did not flag *"Elevator stuck in the new building"* against the open *"Lift not working in new block"* (similarity 0.611). | Threshold lowered to 0.60 (see DESIGN.md §12). |
| Manual test: *"WiFi down in my hostel"* was suggested **Hostel** (0.945) over IT (0.619), because only resolved tickets were used and IT had one resolved Wi-Fi case. | `suggest_department` now learns from tickets the department has accepted (assigned or resolved), not only resolved ones. |
| Manual test: a comment could be posted on a CLOSED ticket through the API (the UI hid the form, but the API allowed it). | The comments API now rejects closed tickets. |
| Browser test as a student: the "possible duplicate" link opened an access-denied page, because citizens cannot view other people's tickets. | Citizens now see a plain note instead of a link. |
| Browser test: a student's own ticket was listed with "I have the same problem", and clicking it gave an error. | The check API marks tickets the student raised or follows, and the form shows "View ticket" for those. |
| Browser test: after editing the complaint text, the department stayed on the old suggestion. | Changing the title or description clears the department, so the next check suggests it again. |
| Browser test: the form promised followers a notification, but only the ticket owner got one. | `ticket_after_change` now notifies everyone in `ticket_supporters`. |
| Browser test: "Withdraw" never appeared, because auto-assign moves a ticket to ASSIGNED straight away. | Added the ASSIGNED → CLOSED transition. A ticket can be withdrawn until work starts. |
| Code review: because moves to CLOSED are allowed for withdrawing, `close` also worked on an open ticket through the API. | The API only allows `close` on RESOLVED tickets and `withdraw` on OPEN / ASSIGNED ones. |
| Teammate report: admin, staff and head accounts made by hand in SQL could not use the site. A plain password was accepted but could never log in, staff without a `staff` row saw an empty queue, and heads got "deptId is required". Without seed data there was no admin at all, so the GUI could not create these roles. | Added the `chk_user_password` constraint, a clear login message for staff with no department, and `npm run create-user` for creating any role from the terminal. |
| Teammate request: the website could only create student accounts. | The Register page now offers all 4 roles, with an access code for staff, head and admin. The admin Users page can also create citizens. |
| Simulated failure: if the embedding model could not load, the route had no error handling and the form could stay stuck on "Checking...". | The API returns a 503 with a readable message and the form shows it. |

## 2. Account creation tests

| Test | Result |
|---|---|
| Empty database (no seed): `create-user` makes an admin, who logs in and adds a department | ✔ |
| `create-user` for staff and head in that department, then login and open their pages | ✔ |
| `create-user` with an unknown department, a missing department, or a duplicate email | Clear error, nothing created ✔ |
| All 19 seeded admin, head and staff accounts log in and load their home page and data | 19 / 19 ✔ |
| Staff, head and admin created through the admin Users API log in and load their pages | ✔ |
| Empty database, real browser: register an admin with the access code, add a department, register staff and a head in it, register a citizen | All log in and land on their own pages, and the head is set in `departments.head_id` ✔ |
| Register as admin with a wrong code, no code, or an empty code (form and direct API calls) | 403, no account created ✔ |
| Register with a made-up role | 400 ✔ |
| Register as staff with no department, or a department that does not exist | 400, no account created ✔ |
| `STAFF_SIGNUP_CODE` left empty, then register as admin with an empty code | 403 "turned off", citizens can still register ✔ |
| SQL `INSERT` with a plain password | Rejected by `chk_user_password` ✔ |
| Staff or head with no `staff` row tries to log in | 403 with a clear message ✔ |

## 3. API / end-to-end tests (manual, with curl against `next start`)

| # | Test | Expected | Result |
|---|---|---|---|
| 1 | Register with 3-char password | Rejected | `Password must be at least 8 characters` ✔ |
| 2 | Login with wrong password | Generic error | `Invalid email or password` ✔ |
| 3 | `/api/tickets/check` with a re-worded Wi-Fi complaint | Shows open tickets #44 (0.74) and #40 (0.62) | ✔ |
| 4 | Submit that complaint | Saved with `possible_duplicate_of = 44`, auto-assigned to least loaded IT staff | `{"ticketId":60,"duplicateOf":44}`, assigned to Ravi Menon ✔ |
| 5 | Another staff member (not the assignee) clicks "Start work" | Rejected | `Only the assigned staff member can start work` ✔ |
| 6 | Resolve without a note | Rejected | `Please describe how the issue was resolved` ✔ |
| 7 | RESOLVED → IN_PROGRESS | Rejected by trigger | `Invalid status change for ticket #60: RESOLVED -> IN_PROGRESS` ✔ |
| 8 | Staff tries to close the citizen's ticket | Rejected | `Only the person who raised the ticket can close it` ✔ |
| 9 | Citizen reopens → staff resolves again → citizen closes with rating 9 | Rejected by CHECK | `Rating must be between 1 and 5` ✔ |
| 10 | Close with rating 4 | History shows all 8 steps | OPEN→ASSIGNED→IN_PROGRESS→RESOLVED→REOPENED→IN_PROGRESS→RESOLVED→CLOSED ✔ |
| 11 | Internal note added by staff, viewed by citizen | Hidden | citizen sees `comments: []`, head sees the note ✔ |
| 12 | Transport ticket (only staff member unavailable) | Stays OPEN | ✔ |
| 13 | **Two staff click "Pick up" at the same moment** (two parallel HTTP requests) | One succeeds, one gets an error | `{"ok":true}` and `{"error":"Ticket #61 was already picked up by someone else"}` ✔ |
| 14 | Head assigns a ticket to staff of another department | Rejected by trigger | ✔ |
| 15 | Staff tries to assign | Rejected | `Only the department head or admin can assign tickets` ✔ |
| 16 | Admin sets department head to a normal staff member | Rejected by trigger | `Head of IT Services must be a dept_head of the same department` ✔ |
| 17 | Admin sets SLA = 1000 | Rejected by CHECK | `SLA must be between 1 and 720 hours` ✔ |
| 18 | Citizen supports the same ticket twice | Rejected by composite PK | `You are already following this ticket` ✔ |
| 19 | Keyword search "elevator" vs semantic search "elevator" | Keyword finds 1, semantic also finds the "Lift" ticket | ✔ |

### Access control

| Request | Expected | Result |
|---|---|---|
| Citizen → `GET /api/dashboard/admin` | 403 | 403 ✔ |
| IT staff → hostel ticket | 404 (not visible) | 404 ✔ |
| Citizen → someone else's ticket | 404 | 404 ✔ |
| No cookie → `GET /api/tickets` | 401 | 401 ✔ |
| Citizen opens `/admin` | redirect to `/citizen` | 307 → /citizen ✔ |
| Not logged in opens `/staff` | redirect to `/login` | 307 → /login ✔ |
| Staff opens `/head` | redirect to `/staff` | 307 → /staff ✔ |

## 4. Index usage

From `db/04_important_queries.sql` (with `enable_seqscan = off`, because with only 44 rows the planner would otherwise choose a sequential scan):

```
Index Scan using idx_tickets_dept_status on tickets
  Index Cond: ((dept_id = 1) AND ((status)::text = 'OPEN'::text))

Bitmap Heap Scan on tickets
  Recheck Cond: (search_vector @@ '''wifi'''::tsquery)
  ->  Bitmap Index Scan on idx_tickets_search
```
