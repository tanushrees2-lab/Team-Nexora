<<<<<<< HEAD
# DayFlow — Human Resource Management System

DayFlow is a competition-oriented HRMS based on the supplied DayFlow problem statement. It covers secure authentication, role-based employee/HR access, profiles, attendance, leave workflows, payroll visibility and administration, notifications, analytics, and explainable DayFlow Insights.

## What is included

### Employee
- Sign in
- Employee self-registration + verification token flow
- Profile and editable contact details
- Check-in / check-out
- Attendance history and punctuality trend
- Paid / Sick / Unpaid leave request
- Leave balance
- Leave-overlap warning when submitting a request
- Payroll read-only view
- Notifications

### HR
- HR dashboard / command center
- Employee directory
- Employee record administration
- Attendance history and status correction
- Leave approval / rejection with HR comment support in API
- Team availability view
- Payroll view and salary-structure editing
- DayFlow Insights with explainable rules
- Audit trail
- Notifications

### Explainable DayFlow Insights
The project intentionally uses transparent rules instead of pretending to use AI:
- Late check-ins: check-in later than `EXPECTED_START` (default 09:15), alert after 3 occurrences.
- Leave overlap: pending/approved requests that overlap another employee's period are surfaced for HR review.
- Low working hours: repeated recorded workdays below 8 hours are surfaced.
- Team availability: attendance and approved leave are shown together.

## Technology

- React + Vite
- Node.js + Express
- SQLite (`better-sqlite3`)
- JWT + bcrypt
- Recharts + Lucide React
- Responsive CSS
- PDFKit for downloadable salary slips

SQLite is used so a separate MySQL server is not required for the local demo. The data model is structured so it can be migrated to MySQL later.

## Requirements

- Node.js 18+ (Node 20/22 recommended)
- npm

## Run from a fresh copy

```bash
npm install
npm run install:all
npm run dev
```

Open:
- Frontend: http://localhost:5173
- API health: http://localhost:4000/api/health

For a production-style frontend build:

```bash
npm run build
```

## Demo accounts

Employee:
- Email: `sanjana@dayflow.local`
- Password: `password123`

HR:
- Email: `hr@dayflow.local`
- Password: `password123`

The seeded demo accounts are already marked as verified.

## Database

The SQLite database is created automatically at:

`server/dayflow.db`

The server includes a small migration for the `email_verified` field so older DayFlow databases can continue to work.

To start with a completely fresh demo database, stop the server and delete `server/dayflow.db`, then start the server again.

## Verification flow for newly registered employees

In development, the signup endpoint returns a verification token and also logs it in the server console. Open:

`http://localhost:4000/api/auth/verify?token=YOUR_TOKEN`

Then sign in.

In production, replace this development token flow with a real email provider and do not expose the token in the API response.

## Important security notes

This is a college/competition project, not a production HR system. Before production deployment, add HTTPS, secure cookie/token strategy, rate limiting, CSRF protection as appropriate, stronger password policy, encrypted document storage, proper email delivery, secrets management, database backups, and a jurisdiction-specific payroll/tax engine.
=======
# Team-Nexora
A passionate team combining creativity, logic, and technology to solve real-world challenges and build impactful solutions.
>>>>>>> 693bf6b64d7509fc6af8db39ac24ac8ae33be6a6
