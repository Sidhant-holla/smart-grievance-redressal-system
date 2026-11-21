# API and security test results

Run on 2026-11-05 04:01 UTC with `npm run test:api` against the running app.

**49 of 49 passed.**

| ID | Area | Test case | Expected | Result | Detail |
|---|---|---|---|---|---|
| A01 | Authentication | Register with a 3 character password | Rejected | PASS | Password must be at least 8 characters |
| A02 | Authentication | Register a new citizen | 201 and logged in | PASS | status 201 |
| A03 | Authentication | Register the same email again in capitals | Rejected | PASS | An account with this email already exists |
| A04 | Authentication | Login with a wrong password | Generic error | PASS | Invalid email or password |
| A05 | Account creation | Register as admin with no access code | Rejected | PASS | Wrong access code |
| A06 | Account creation | Register as admin with a wrong access code | Rejected | PASS | Wrong access code |
| A07 | Account creation | Register with a made-up role | Rejected | PASS | Invalid role |
| A08 | Account creation | Register as admin with the correct access code | 201, goes to /admin | PASS | /admin |
| A09 | Account creation | Admin creates a staff account and it can log in | 201 then login works | PASS | redirect /staff |
| A10 | Complaint submission | Check finds similar open complaints | At least one match | PASS | 2 matches, top 0.72 |
| A11 | Complaint submission | Check suggests IT Services | IT Services on top | PASS | IT Services |
| A12 | Complaint submission | Submit with a 3 character title | Rejected by CHECK | PASS | Title must be at least 5 characters |
| A13 | Complaint submission | Submit a complaint | Saved and flagged as possible duplicate | PASS | ticket 256, duplicate of 44 |
| A14 | Complaint submission | Auto-assign gives it to available staff | ASSIGNED | PASS | ravi.it@campus.edu |
| A15 | Ticket lifecycle | Staff who is not the assignee clicks Start | Rejected | PASS | Only the assigned staff member can start work |
| A16 | Ticket lifecycle | Assignee starts work | OK | PASS |  |
| A17 | Ticket lifecycle | Citizen withdraws after work has started | Rejected | PASS | Work on this ticket has already started, so it cannot be withdrawn |
| A18 | Ticket lifecycle | Resolve without a note | Rejected | PASS | Please describe how the issue was resolved |
| A19 | Ticket lifecycle | Resolve with a note | OK | PASS |  |
| A20 | Ticket lifecycle | RESOLVED to IN_PROGRESS | Rejected by trigger | PASS | Invalid status change for ticket #256: RESOLVED -> IN_PROGRESS |
| A21 | Ticket lifecycle | Staff tries to close the citizen's ticket | Rejected | PASS | Only the person who raised the ticket can close it |
| A22 | Ticket lifecycle | Reopen without a reason | Rejected | PASS | Please say why the issue is not resolved |
| A23 | Ticket lifecycle | Citizen reopens | OK | PASS |  |
| A24 | Ticket lifecycle | Close with rating 9 | Rejected by CHECK | PASS | Rating must be between 1 and 5 |
| A25 | Ticket lifecycle | Close with rating 4 | OK | PASS |  |
| A26 | Ticket lifecycle | History holds every step | 8 steps ending in CLOSED | PASS | OPEN > ASSIGNED > IN_PROGRESS > RESOLVED > REOPENED > IN_PROGRESS > RESOLVED > CLOSED |
| A27 | Ticket lifecycle | Comment on a closed ticket | Rejected | PASS | This ticket is closed |
| A28 | Ticket lifecycle | Close a ticket that is not resolved | Rejected | PASS | Only a resolved ticket can be closed |
| A29 | Ticket lifecycle | Withdraw an assigned ticket | OK | PASS |  |
| A30 | Concurrency and assignment | No available staff in the department | Stays OPEN | PASS | OPEN |
| A31 | Concurrency and assignment | Two staff pick up the same ticket at the same moment | One succeeds, one gets an error | PASS | Ticket #258 was already picked up by someone else |
| A32 | Concurrency and assignment | Head assigns to staff of another department | Rejected by trigger | PASS | Staff member 3 does not belong to the department of ticket #258 |
| A33 | Concurrency and assignment | Staff tries to assign | Rejected | PASS | Only the department head or admin can assign tickets |
| A34 | Following a ticket | Citizen follows a ticket | OK | PASS |  |
| A35 | Following a ticket | Follow the same ticket twice | Rejected by composite PK | PASS | You are already following this ticket |
| A36 | Following a ticket | Stop following (DELETE) | OK | PASS |  |
| A37 | Following a ticket | Stop following a ticket not followed | Rejected | PASS | You are not following this ticket |
| A38 | Following a ticket | Staff calls stop following | Forbidden | PASS | You are not allowed to do this |
| A39 | Search | Semantic search finds "Lift" when searching "elevator" | Keyword misses it, semantic finds it | PASS | keyword 1, semantic 2 |
| A40 | Admin rules | Set a normal staff member as department head | Rejected by trigger | PASS | Head of IT Services must be a dept_head of the same department |
| A41 | Admin rules | Set SLA to 1000 hours | Rejected by CHECK | PASS | SLA must be between 1 and 720 hours |
| A42 | Access control | Citizen calls the admin dashboard API | 403 | PASS | got 403 |
| A43 | Access control | IT staff opens a ticket of another department | 404 | PASS | got 404 |
| A44 | Access control | Citizen opens someone else's ticket | 404 | PASS | got 404 |
| A45 | Access control | No login calls the tickets API | 401 | PASS | got 401 |
| A46 | Access control | Citizen opens /admin | Redirect to /citizen | PASS | 307 to /citizen |
| A47 | Access control | Not logged in opens /staff | Redirect to /login | PASS | 307 to /login |
| A48 | Access control | Staff opens /head | Redirect to /staff | PASS | 307 to /staff |
| A49 | Access control | Head of another department cannot open it | 404 | PASS | got 404 |
