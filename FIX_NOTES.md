# DayFlow — Root Cause Fix & Verification (this pass)

## Root cause of every "confirmed issue" from your last report

Every symptom you listed — payroll save failing, payroll showing ₹0, and the
HR leave-approval queue looking empty — traced back to **one bug** in
`server/src/server.js`.

The database schema (`db.js`) stores the human-readable employee code
(e.g. `EMP1001`) on the **`users`** table, not on the **`employees`** table.
But six SQL queries in `server.js` joined `employees` as `e` and then selected
`e.employee_id` — a column that doesn't exist there. SQLite correctly threw:

```
no such column: e.employee_id
```

This crashed the following endpoints outright:
- `PUT /api/payroll/:employeeId` → **payroll save failing** (issue #1)
- `GET /api/payroll` → the ₹0 self-heal path itself failed on re-read,
  so the UI ended up showing broken/zero values (issue #2, #3)
- `GET /api/leaves` (HR view) → threw before returning data; the frontend
  call had no `.catch`, so it failed silently and the leave list rendered
  empty — which is why HR approve/reject buttons never appeared
  (issue #4, "steps 7-9")
- `GET /api/attendance` → same bug, would have surfaced next once payroll/leaves were fixed
- `GET /api/payroll/:employeeId/slip` → PDF used `employee.employee_id`
  which is also undefined on that object

Team Availability (issue #5) was already correctly implemented in this zip
(dedicated `/api/team-availability` route + nav page) — verified working,
no changes needed there.

## The fix

Every query that needed the employee code now joins `users u ON u.id = e.user_id`
and selects `u.employee_id` instead of the non-existent `e.employee_id`. Added
a small `employeeCodeFor()` helper for the salary-slip PDF route, which only
had the `employees` row (no join) available. Also added `u.employee_id` to the
`/api/employees` directory response for consistency.

See the diff at the bottom of this file, or compare against the original zip.

## Round 2 fixes (this update)

**1. Signup → "please verify your email" loop that never resolves**

The API correctly requires email verification and — since this demo has no
real mail server — hands the verification token straight back in the signup
response instead of emailing it. The frontend printed that token as plain
text but never did anything with it, so the account stayed unverified
forever and login correctly (but confusingly) kept refusing it.

Fixed in `client/src/main.jsx`: right after signup, if a verification token
comes back, the client now automatically calls `GET /api/auth/verify` with
it, then tells you the account is verified and ready. Tested end-to-end
against the real `db.js` logic: `email_verified` correctly flips `0 → 1` and
a login attempt with the same credentials afterward succeeds.

**2. Shipped working `.env` files (not just `.env.example`)**

Previously you had to hand-create these yourself. Now `server/.env` and
`client/.env` are included and ready to go. `client/.env` points at
`http://127.0.0.1:4000` instead of `http://localhost:4000` — on some Windows
setups, browsers try to resolve `localhost` over IPv6 first and time out
before falling back to IPv4, which is what caused the "every page takes over
a minute" symptom. Using `127.0.0.1` directly skips that resolution step
entirely.

**3. Re-verified Approve/Reject leave logic directly**

Ran the actual decision logic (approve, reject, double-decision guard,
leave-balance deduction, overlap-conflict detection) against a real seeded
database. All correct — approving deducts leave balance properly, rejecting
works, and clicking twice on the same request is correctly blocked rather
than silently failing.

**4. Compiled every real source file through esbuild** (not just a brace
count) to rule out any JSX/syntax issue in `main.jsx`, `server.js`, `db.js`,
`auth.js` — all four compile clean.

## Round 3 fix: Approve/Reject buttons doing nothing

**Root cause:** `decision()` in the `Leave` component called `window.prompt()`
(for an optional HR comment) *before* its own try/catch block, and the error
fallback used `window.alert()`. In some environments — embedded/dev-preview
browsers, certain webviews, sandboxed iframes — native `prompt()`/`alert()`
dialogs are blocked or unsupported and calling them throws immediately. Since
that call sat outside the try/catch, the click produced an unhandled
rejection with **zero visible feedback** — exactly "the button does nothing."
The backend PATCH logic itself was already verified correct (see below), so
this was purely a frontend dialog dependency.

**Fix:** replaced the native `prompt()`/`alert()` flow with a small in-app
confirmation panel (comment textarea + Confirm/Cancel buttons rendered
inline on the leave card) that never touches `window.prompt` or
`window.alert`. Errors now render in the page itself instead of a native
alert. Re-verified end-to-end against the real decision logic (approve,
reject, leave-balance deduction, overlap detection, double-decision guard —
see "Testing actually performed" below).

**Also fixed while in there:** the `employee_id` field returned by the
attendance/leave/payroll queries was silently being overwritten — those
tables already have a numeric `employee_id` foreign key column, and the
added `u.employee_id` (the human-readable code) was colliding with it under
the same JSON key, clobbering the FK value in the response. Not currently
read by the frontend, but aliased to `employee_code` now so both values are
preserved and nothing is silently lost if a future feature relies on it.

## Testing actually performed (not just static review)

Because this sandbox has no network access, `npm install` for `better-sqlite3`,
`express`, etc. isn't possible here. Rather than repeat the previous version's
mistake of shipping "verified" code that was never executed, I:

1. Ran `node --check` on all three server source files (syntax).
2. Built a real in-memory SQLite database (Node's built-in `node:sqlite`)
   with the **exact schema** from `db.js`, and:
   - Confirmed the **original** broken queries do throw
     `no such column: e.employee_id` (reproduced your exact error).
   - Confirmed all **fixed** queries run cleanly and return correct data.
3. Wrote a `better-sqlite3` shim backed by `node:sqlite` and ran the actual,
   unmodified `db.js` file through it end-to-end — startup seeding produced
   correct users, non-zero payroll rows, leave requests (2 pending + 1
   approved), and attendance records, with no errors.
4. Ran the real fixed route logic from `server.js` (payroll GET, payroll PUT
   save-then-reread, HR leave list) against that seeded database and
   confirmed correct end-to-end results, including gross salary staying in
   sync with the payroll structure after a save.

This confirms the fix at the database/query level with real execution, not
just a source read-through. I was not able to click through the actual
Vite/Express dev servers in a browser in this environment (no network for
`npm install`), so please still do one real run before considering this final:

```bash
npm install          # from the project root
npm run install:all
npm run dev
```

Then sign in as HR (`hr@dayflow.local` / `password123`) and check:
- Payroll page loads a non-zero structure and **Save payroll** succeeds
- Leave approvals queue shows Sanjana's two pending requests, and
  Approve/Reject works
- Team availability page loads
