# Testing

| Suite | Command | Tests | Results |
|---|---|---|---|
| Database | `npm run db:test` | 36 | [TEST_RESULTS_DB.md](TEST_RESULTS_DB.md) |
| API and security | `npm run test:api` | 49 | [TEST_RESULTS_API.md](TEST_RESULTS_API.md) |

Both suites write their result files automatically. Run them on seeded data, with the app running for the API suite. Database tests run in transactions that are rolled back, and API tests delete everything they create.

## Test data

The seed data covers the cases that uniform sample data would miss:

- complaints that describe the same problem in different words (lift / elevator, Wi-Fi / internet),
- tickets that are past their SLA, 7 of which get escalated by the seed,
- a department with no available staff (Transport), so tickets stay in the OPEN queue,
- tickets that were escalated and re-assigned before being resolved,
- a reopened ticket.

## Problems the tests found, and what we changed

| First run | Fix |
|---|---|
| `suggest_department` sent *"food in the hostel mess is cold"* to **Hostel** and *"fan making noise in classroom"* to **Hostel**. The nearest match was correct both times, but 3–4 weakly similar hostel tickets (0.27–0.48) outvoted it. | Added `p_min_similarity = 0.4`, so only reasonably similar cases vote. |
| Duplicate threshold 0.65 did not flag *"Elevator stuck in the new building"* against the open *"Lift not working in new block"* (similarity 0.611). | Threshold lowered to 0.60 (see VECTOR_SEARCH.md section 6). |
| Manual test: *"WiFi down in my hostel"* was suggested **Hostel** (0.945) over IT (0.619), because only resolved tickets were used and IT had one resolved Wi-Fi case. | `suggest_department` now learns from tickets the department is handling as well as resolved ones. |
| Manual test: a comment could be posted on a CLOSED ticket through the API (the UI hid the form, but the API allowed it). | The comments API now rejects closed tickets. |
| Browser test as a student: the "possible duplicate" link opened an access-denied page, because citizens cannot view other people's tickets. | Citizens now see a plain note instead of a link. |
| Browser test: a student's own ticket was listed with "I have the same problem", and clicking it gave an error. | The check API marks tickets the student raised or follows, and the form shows "View ticket" for those. |
| Browser test: after editing the complaint text, the department stayed on the old suggestion. | Changing the title or description clears the department, so the next check suggests it again. |
| Browser test: the form promised followers a notification, but only the ticket owner got one. | `ticket_after_change` now notifies everyone in `ticket_supporters`. |
| Browser test: "Withdraw" never appeared, because auto-assign moves a ticket to ASSIGNED straight away. | Added the ASSIGNED → CLOSED transition. A ticket can be withdrawn until work starts. |
| Code review: because moves to CLOSED are allowed for withdrawing, `close` also worked on an open ticket through the API. | The API only allows `close` on RESOLVED tickets and `withdraw` on OPEN / ASSIGNED ones. |
| Teammate report: admin, staff and head accounts made by hand in SQL could not use the site. A plain password was accepted but could never log in, staff without a `staff` row saw an empty queue, and heads got "deptId is required". Without seed data there was no admin at all, so the GUI could not create these roles. | Added the `chk_user_password` constraint, a clear login message for staff with no department, and `npm run create-user` for creating any role from the terminal. |
| Teammate request: the website could only create student accounts. | The Register page now offers all 4 roles, with an access code for staff, head and admin. The admin Users page can also create citizens. |
| Requirements check: the course needs INSERT, UPDATE, DELETE and SELECT in the application, but the app had no DELETE. | Added "Stop following", which runs `DELETE FROM ticket_supporters` through `DELETE /api/tickets/:id/support`. |
| Requirements check: `npm audit` listed Next.js advisories, including remote code execution on Windows servers, and Next listens on the whole network by default. | The app now listens only on `127.0.0.1`, and the unused image optimizer is off. The upgrade to a fixed Next.js version is listed under future work. |
| Simulated failure: if the embedding model could not load, the route had no error handling and the form could stay stuck on "Checking...". | The API returns a 503 with a readable message and the form shows it. |

## Manual browser and setup tests

These were run by hand, in a real browser or from a clean database, in addition to the automated suites.

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

## Index usage

From `db/04_important_queries.sql` (with `enable_seqscan = off`, because with only 44 rows the planner would otherwise choose a sequential scan):

```
Index Scan using idx_tickets_dept_status on tickets
  Index Cond: ((dept_id = 1) AND ((status)::text = 'OPEN'::text))

Bitmap Heap Scan on tickets
  Recheck Cond: (search_vector @@ '''wifi'''::tsquery)
  ->  Bitmap Index Scan on idx_tickets_search
```
