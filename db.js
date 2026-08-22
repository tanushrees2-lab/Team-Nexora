import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, "../dayflow.db"));
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('employee','hr')),
  email_verified INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS email_verifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT DEFAULT '',
  address TEXT DEFAULT '',
  department TEXT NOT NULL,
  designation TEXT NOT NULL,
  joining_date TEXT NOT NULL,
  salary REAL NOT NULL DEFAULT 0,
  leave_balance REAL NOT NULL DEFAULT 18,
  avatar TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  work_date TEXT NOT NULL,
  check_in TEXT,
  check_out TEXT,
  status TEXT NOT NULL DEFAULT 'Present',
  UNIQUE(employee_id, work_date)
);

CREATE TABLE IF NOT EXISTS leave_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  days REAL NOT NULL,
  remarks TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Pending',
  hr_comment TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payroll (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER UNIQUE NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  basic REAL NOT NULL,
  hra REAL NOT NULL,
  allowance REAL NOT NULL,
  pf REAL NOT NULL,
  tax REAL NOT NULL,
  other_deduction REAL NOT NULL DEFAULT 0,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id INTEGER NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  details TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

// Lightweight migrations for databases created by earlier DayFlow versions.
const userColumns = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
if (!userColumns.includes("email_verified")) db.exec("ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 1");

function createUser({ employeeId, email, password, role, name, department, designation, salary }) {
  let user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (user) return user.id;

  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare(`
    INSERT INTO users(employee_id,email,password_hash,role)
    VALUES(?,?,?,?)
  `).run(employeeId, email, hash, role);

  db.prepare(`
    INSERT INTO employees(user_id,name,department,designation,joining_date,salary,leave_balance)
    VALUES(?,?,?,?,?,?,?)
  `).run(
    result.lastInsertRowid, name, department, designation, "2025-07-01", salary, 18
  );

  return result.lastInsertRowid;
}

createUser({
  employeeId: "HR001",
  email: "hr@dayflow.local",
  password: "password123",
  role: "hr",
  name: "Ananya Rao",
  department: "Human Resources",
  designation: "HR Officer",
  salary: 72000
});

createUser({
  employeeId: "EMP1001",
  email: "sanjana@dayflow.local",
  password: "password123",
  role: "employee",
  name: "Sanjana R",
  department: "Engineering",
  designation: "Software Engineer",
  salary: 48000
});

createUser({
  employeeId: "EMP1002",
  email: "rahul@dayflow.local",
  password: "password123",
  role: "employee",
  name: "Rahul Kumar",
  department: "Engineering",
  designation: "Backend Developer",
  salary: 52000
});

createUser({
  employeeId: "EMP1003",
  email: "meera@dayflow.local",
  password: "password123",
  role: "employee",
  name: "Meera Nair",
  department: "Design",
  designation: "Product Designer",
  salary: 46000
});

function employeeByEmail(email) {
  return db.prepare(`
    SELECT e.* FROM employees e
    JOIN users u ON u.id = e.user_id
    WHERE u.email = ?
  `).get(email);
}

function addPayroll(email, basic, hra, allowance, pf, tax, other) {
  const e = employeeByEmail(email);
  if (!e) return;
  const exists = db.prepare("SELECT id,basic,hra,allowance,pf,tax,other_deduction FROM payroll WHERE employee_id = ?").get(e.id);
  if (!exists) {
    db.prepare(`
      INSERT INTO payroll(employee_id,basic,hra,allowance,pf,tax,other_deduction)
      VALUES(?,?,?,?,?,?,?)
    `).run(e.id, basic, hra, allowance, pf, tax, other);
  } else if ([exists.basic, exists.hra, exists.allowance, exists.pf, exists.tax, exists.other_deduction].every(v => Number(v) === 0)) {
    // Repair demo databases created by earlier versions where payroll rows existed but were all zero.
    db.prepare(`
      UPDATE payroll
      SET basic=?,hra=?,allowance=?,pf=?,tax=?,other_deduction=?,updated_at=CURRENT_TIMESTAMP
      WHERE employee_id=?
    `).run(basic, hra, allowance, pf, tax, other, e.id);
  }
}

function repairPayrollFromSalary(email, basic, hra, allowance, pf, tax, other) {
  const e = employeeByEmail(email);
  if (!e) return;
  const row = db.prepare("SELECT * FROM payroll WHERE employee_id=?").get(e.id);
  const gross = row ? Number(row.basic)+Number(row.hra)+Number(row.allowance) : 0;
  if (!row || gross <= 0) {
    addPayroll(email, basic, hra, allowance, pf, tax, other);
  }
}

addPayroll("sanjana@dayflow.local", 30000, 12000, 6000, 3600, 1400, 500);
addPayroll("rahul@dayflow.local", 33000, 13000, 6000, 3960, 1800, 400);
addPayroll("meera@dayflow.local", 29000, 11000, 6000, 3480, 1200, 300);
addPayroll("hr@dayflow.local", 46000, 18000, 8000, 5520, 4200, 500);

function dateDaysAgo(n) {
  const date = new Date();
  date.setDate(date.getDate() - n);
  return date.toISOString().slice(0, 10);
}

function seedAttendance(email, lateCount) {
  const e = employeeByEmail(email);
  if (!e) return;
  const insert = db.prepare(`
    INSERT OR IGNORE INTO attendance(employee_id,work_date,check_in,check_out,status)
    VALUES(?,?,?,?,?)
  `);

  for (let i = 1; i <= 12; i++) {
    insert.run(
      e.id,
      dateDaysAgo(i),
      i <= lateCount ? "09:35" : "09:05",
      "17:45",
      "Present"
    );
  }
}

seedAttendance("sanjana@dayflow.local", 1);
seedAttendance("rahul@dayflow.local", 6);
seedAttendance("meera@dayflow.local", 2);

// Ensure the demo workflow always has one pending HR approval and one approved leave.
// Existing user-created leave requests are never overwritten.
const sanjana = employeeByEmail("sanjana@dayflow.local");
const rahul = employeeByEmail("rahul@dayflow.local");
// Keep the demo workflow testable even when an older database already contains rejected/completed requests.
if (sanjana && db.prepare("SELECT COUNT(*) count FROM leave_requests WHERE employee_id=? AND status='Pending'").get(sanjana.id).count < 2) {
  const pendingCount = db.prepare("SELECT COUNT(*) count FROM leave_requests WHERE employee_id=? AND status='Pending'").get(sanjana.id).count;
  const demoLeaves = [
    ["2026-09-12", "2026-09-15", 4, "Demo family event"],
    ["2026-09-20", "2026-09-21", 2, "Demo personal appointment"]
  ];
  for (const [start, end, days, remarks] of demoLeaves.slice(pendingCount)) {
    db.prepare(`INSERT INTO leave_requests(employee_id,leave_type,start_date,end_date,days,remarks,status) VALUES(?,?,?,?,?,?,?)`).run(sanjana.id, "Paid", start, end, days, remarks, "Pending");
  }
}
if (rahul && db.prepare("SELECT COUNT(*) count FROM leave_requests WHERE employee_id=? AND status='Approved'").get(rahul.id).count === 0) {
  db.prepare(`
    INSERT INTO leave_requests(employee_id,leave_type,start_date,end_date,days,remarks,status)
    VALUES(?,?,?,?,?,?,?)
  `).run(rahul.id, "Paid", "2026-09-13", "2026-09-15", 3, "Demo personal work", "Approved");
}

export default db;
