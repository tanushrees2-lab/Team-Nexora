# DayFlow Final QA Notes

This build consolidates the issues found during user testing.

## Corrected areas
- Payroll rows are repaired on startup and also self-heal on GET when a legacy database contains an all-zero payroll row.
- HR payroll saves accept blank numeric inputs as zero and return useful development errors instead of hiding the server error behind a generic message.
- Payroll edits update employee gross salary so Profile/Employee Management and Payroll stay consistent.
- Employee directory salary edits create or update the payroll structure instead of leaving payroll disconnected.
- HR payroll automatically selects the demo employee on first open so the page does not appear empty.
- Demo leave data guarantees two pending Sanjana requests (one can be approved and one rejected) plus an approved Rahul request, without deleting user-created records.
- Leave approval remains HR-only and prevents processing a request more than once.
- Insights displays late, pending leave, overlap and low-hours patterns.
- Team Availability is now a dedicated HR navigation page with a selectable date, in addition to the availability section inside Insights.
- Employees can only access their own payroll/profile/attendance/leave APIs; HR-only APIs remain server-protected.
- Navigation/page loading was simplified so payroll and other pages show an explicit error instead of silently looking blank when an API call fails.

## Clean-install note
For the cleanest demo, extract this ZIP into a new folder and start the server once. SQLite is stored in `server/dayflow.db` and persists between runs. Do not copy an old database into this folder.

## Demo accounts
- HR: `hr@dayflow.local` / `password123`
- Employee: `sanjana@dayflow.local` / `password123`

## Verification performed in this environment
- `node --check` passed for the server source files.
- Source-level review was performed for authentication, authorization, leave, payroll, employee management, insights, team availability and navigation.
- A complete npm install/build/runtime test could not be completed in this environment because npm registry access timed out; therefore no claim of full browser runtime testing is made here.
