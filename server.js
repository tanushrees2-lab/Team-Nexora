import "dotenv/config";
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import PDFDocument from "pdfkit";
import db from "./db.js";
import { auth, createToken, hrOnly } from "./auth.js";

const app = express();
const PORT = Number(process.env.PORT || 4000);
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";
const EXPECTED_START = process.env.EXPECTED_START || "09:15";
const TIME_ZONE = process.env.TIME_ZONE || "Asia/Kolkata";

app.use(cors({ origin: CLIENT_URL }));
app.use(express.json({ limit: "1mb" }));

const employeeForUser = (userId) => db.prepare("SELECT * FROM employees WHERE user_id = ?").get(userId);
const employeeById = (id) => db.prepare("SELECT * FROM employees WHERE id = ?").get(id);
const userById = (id) => db.prepare("SELECT * FROM users WHERE id = ?").get(id);
// employee_id (the human-readable code like "EMP1001") lives on users, not employees, so look it up via the linked user.
const employeeCodeFor = (employeeRow) => employeeRow ? userById(employeeRow.user_id)?.employee_id || "" : "";

function dateInZone(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(date);
}
function timeInZone(date = new Date()) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}
const today = () => dateInZone();

function parseDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return null;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}
function inclusiveDays(startDate, endDate) {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (!start || !end) return 0;
  return Math.floor((end - start) / 86400000) + 1;
}
function notify(employeeId, title, message) {
  db.prepare("INSERT INTO notifications(employee_id,title,message) VALUES(?,?,?)").run(employeeId, title, message);
}
function audit(userId, action, details) {
  db.prepare("INSERT INTO audit_logs(actor_user_id,action,details) VALUES(?,?,?)").run(userId, action, details);
}
function validateEmployeeId(id) {
  const employee = employeeById(Number(id));
  return employee || null;
}
function leaveConflicts(employeeId, startDate, endDate, ignoreId = null) {
  return db.prepare(`
    SELECT l.id, l.leave_type, l.start_date, l.end_date, l.status,
           e.name, e.department
    FROM leave_requests l
    JOIN employees e ON e.id = l.employee_id
    WHERE l.employee_id != ?
      AND l.status IN ('Pending','Approved')
      AND l.start_date <= ? AND l.end_date >= ?
      ${ignoreId ? "AND l.id != ?" : ""}
    ORDER BY l.start_date
  `).all(...(ignoreId ? [employeeId, endDate, startDate, ignoreId] : [employeeId, endDate, startDate]));
}

app.get("/api/health", (_, res) => res.json({ ok: true, service: "DayFlow API", time: new Date().toISOString() }));

app.post("/api/auth/signup", (req, res) => {
  const { employeeId, email, password, role = "employee", name, department, designation, joiningDate } = req.body || {};
  if (!employeeId || !email || !password || !name || !department || !designation || !joiningDate) {
    return res.status(400).json({ message: "Employee ID, email, password and employee details are required." });
  }
  if (role !== "employee") return res.status(400).json({ message: "Only employee self-registration is allowed." });
  if (String(password).length < 8) return res.status(400).json({ message: "Password must be at least 8 characters." });
  if (!parseDate(joiningDate)) return res.status(400).json({ message: "Joining date must be a valid date." });
  const exists = db.prepare("SELECT id FROM users WHERE email = ? OR employee_id = ?").get(email.trim().toLowerCase(), employeeId.trim());
  if (exists) return res.status(409).json({ message: "Email or Employee ID is already registered." });

  const hash = bcrypt.hashSync(password, 12);
  const result = db.prepare(`INSERT INTO users(employee_id,email,password_hash,role,email_verified) VALUES(?,?,?,?,0)`)
    .run(employeeId.trim(), email.trim().toLowerCase(), hash, role);
  db.prepare(`INSERT INTO employees(user_id,name,department,designation,joining_date,salary,leave_balance) VALUES(?,?,?,?,?,?,?)`)
    .run(result.lastInsertRowid, name.trim(), department.trim(), designation.trim(), joiningDate, 0, 18);
  const token = crypto.randomBytes(24).toString("hex");
  db.prepare("INSERT INTO email_verifications(user_id,token,expires_at) VALUES(?,?,?)")
    .run(result.lastInsertRowid, token, new Date(Date.now() + 24 * 3600000).toISOString());
  console.log(`[DayFlow] Verification token for ${email}: ${token}`);
  res.status(201).json({ message: "Account created. Verify your email before signing in.", verificationToken: process.env.NODE_ENV === "production" ? undefined : token });
});

app.get("/api/auth/verify", (req, res) => {
  const token = String(req.query.token || "");
  const record = db.prepare("SELECT * FROM email_verifications WHERE token = ?").get(token);
  if (!record || new Date(record.expires_at) < new Date()) return res.status(400).json({ message: "Verification link is invalid or expired." });
  db.prepare("UPDATE users SET email_verified = 1 WHERE id = ?").run(record.user_id);
  db.prepare("DELETE FROM email_verifications WHERE user_id = ?").run(record.user_id);
  res.json({ message: "Email verified. You can sign in now." });
});

app.post("/api/auth/login", (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) return res.status(401).json({ message: "Incorrect email or password." });
  if (!user.email_verified) return res.status(403).json({ message: "Please verify your email before signing in." });
  const employee = employeeForUser(user.id);
  res.json({ token: createToken(user), user: { id: user.id, employeeId: user.employee_id, email: user.email, role: user.role, name: employee.name } });
});

app.get("/api/me", auth, (req, res) => {
  const user = db.prepare("SELECT id,employee_id,email,role,email_verified FROM users WHERE id = ?").get(req.user.id);
  res.json({ user, employee: employeeForUser(req.user.id) });
});

app.get("/api/dashboard", auth, (req, res) => {
  const employee = employeeForUser(req.user.id);
  if (req.user.role === "hr") {
    const employeeCount = db.prepare("SELECT COUNT(*) count FROM employees").get().count;
    const pendingLeaves = db.prepare("SELECT COUNT(*) count FROM leave_requests WHERE status = 'Pending'").get().count;
    const presentToday = db.prepare("SELECT COUNT(*) count FROM attendance WHERE work_date = ? AND status IN ('Present','Half-day')").get(today()).count;
    const anomalies = db.prepare(`
      SELECT e.name, e.department, SUM(CASE WHEN a.check_in > ? THEN 1 ELSE 0 END) late_count
      FROM employees e LEFT JOIN attendance a ON a.employee_id = e.id
      GROUP BY e.id HAVING late_count >= 3 ORDER BY late_count DESC
    `).all(EXPECTED_START);
    const absentToday = db.prepare(`SELECT COUNT(*) count FROM employees e LEFT JOIN attendance a ON a.employee_id=e.id AND a.work_date=? WHERE a.id IS NULL`).get(today()).count;
    return res.json({ role: "hr", metrics: { employeeCount, pendingLeaves, presentToday, absentToday }, anomalies });
  }
  const record = db.prepare("SELECT * FROM attendance WHERE employee_id = ? AND work_date = ?").get(employee.id, today());
  const recent = db.prepare("SELECT * FROM attendance WHERE employee_id = ? ORDER BY work_date DESC LIMIT 7").all(employee.id);
  const lateCount = recent.filter(row => row.check_in && row.check_in > EXPECTED_START).length;
  const score = recent.length ? Math.round(((recent.length - lateCount) / recent.length) * 100) : 100;
  const pendingLeaves = db.prepare("SELECT COUNT(*) count FROM leave_requests WHERE employee_id = ? AND status = 'Pending'").get(employee.id).count;
  res.json({ role: "employee", employee, todayRecord: record, recentAttendance: recent, attendanceScore: score, pendingLeaves });
});

app.get("/api/profile", auth, (req, res) => {
  res.json(employeeForUser(req.user.id));
});

app.put("/api/profile", auth, (req, res) => {
  const employee = employeeForUser(req.user.id);
  db.prepare("UPDATE employees SET phone = ?, address = ? WHERE id = ?").run(String(req.body?.phone || "").trim(), String(req.body?.address || "").trim(), employee.id);
  audit(req.user.id, "Profile update", `Employee #${employee.id} updated personal contact details.`);
  res.json(employeeForUser(req.user.id));
});

app.get("/api/attendance", auth, (req, res) => {
  const own = employeeForUser(req.user.id);
  let employeeId = own.id;
  if (req.user.role === "hr" && req.query.employeeId) employeeId = Number(req.query.employeeId);
  const employee = validateEmployeeId(employeeId);
  if (!employee) return res.status(404).json({ message: "Employee not found." });
  const rows = db.prepare(`SELECT a.*, e.name, u.employee_id AS employee_code FROM attendance a JOIN employees e ON e.id=a.employee_id JOIN users u ON u.id=e.user_id WHERE a.employee_id=? ORDER BY a.work_date DESC LIMIT 60`).all(employeeId);
  res.json(rows);
});

app.post("/api/attendance/check-in", auth, (req, res) => {
  const employee = employeeForUser(req.user.id);
  const date = today();
  const time = timeInZone();
  const row = db.prepare("SELECT * FROM attendance WHERE employee_id=? AND work_date=?").get(employee.id, date);
  if (row?.check_in) return res.status(400).json({ message: "You are already checked in today." });
  if (row) db.prepare("UPDATE attendance SET check_in=?, status='Present' WHERE id=?").run(time, row.id);
  else db.prepare("INSERT INTO attendance(employee_id,work_date,check_in,status) VALUES(?,?,?,'Present')").run(employee.id, date, time);
  notify(employee.id, "Attendance recorded", `Checked in at ${time}.`);
  audit(req.user.id, "Check in", `${employee.name} checked in at ${time}.`);
  res.json({ ok: true, workDate: date, checkIn: time });
});

app.post("/api/attendance/check-out", auth, (req, res) => {
  const employee = employeeForUser(req.user.id);
  const row = db.prepare("SELECT * FROM attendance WHERE employee_id=? AND work_date=?").get(employee.id, today());
  if (!row?.check_in) return res.status(400).json({ message: "Check in before checking out." });
  if (row.check_out) return res.status(400).json({ message: "You are already checked out today." });
  const time = timeInZone();
  db.prepare("UPDATE attendance SET check_out=? WHERE id=?").run(time, row.id);
  notify(employee.id, "Workday completed", `Checked out at ${time}.`);
  audit(req.user.id, "Check out", `${employee.name} checked out at ${time}.`);
  res.json({ ok: true, checkOut: time });
});

app.patch("/api/attendance/:id", auth, hrOnly, (req, res) => {
  const id = Number(req.params.id);
  const status = String(req.body?.status || "");
  if (!["Present", "Absent", "Half-day", "Leave"].includes(status)) return res.status(400).json({ message: "Invalid attendance status." });
  const row = db.prepare("SELECT * FROM attendance WHERE id=?").get(id);
  if (!row) return res.status(404).json({ message: "Attendance record not found." });
  db.prepare("UPDATE attendance SET status=? WHERE id=?").run(status, id);
  audit(req.user.id, "Attendance update", `Attendance #${id} marked ${status}.`);
  res.json({ ok: true });
});

app.get("/api/leaves/conflicts", auth, hrOnly, (req, res) => {
  const { startDate, endDate, employeeId } = req.query;
  if (!parseDate(startDate) || !parseDate(endDate) || inclusiveDays(startDate, endDate) <= 0) return res.status(400).json({ message: "Enter a valid leave period." });
  res.json({ conflicts: leaveConflicts(Number(employeeId || 0), startDate, endDate) });
});

app.get("/api/team-availability", auth, hrOnly, (req, res) => {
  const date = req.query.date || today();
  if (!parseDate(date)) return res.status(400).json({ message: "Invalid date." });
  const rows = db.prepare(`
    SELECT e.id,e.name,e.department,e.designation,
           COALESCE(a.status,'Absent') attendance_status,
           COALESCE(a.check_in,'') check_in,
           EXISTS(SELECT 1 FROM leave_requests l WHERE l.employee_id=e.id AND l.status='Approved' AND l.start_date<=? AND l.end_date>=?) on_leave
    FROM employees e LEFT JOIN attendance a ON a.employee_id=e.id AND a.work_date=?
    ORDER BY e.department,e.name
  `).all(date, date, date);
  res.json(rows);
});

app.get("/api/leaves", auth, (req, res) => {
  const employee = employeeForUser(req.user.id);
  if (req.user.role === "hr") return res.json(db.prepare(`SELECT l.*,e.name,u.employee_id AS employee_code,e.department FROM leave_requests l JOIN employees e ON e.id=l.employee_id JOIN users u ON u.id=e.user_id ORDER BY l.created_at DESC`).all());
  res.json(db.prepare("SELECT * FROM leave_requests WHERE employee_id=? ORDER BY created_at DESC").all(employee.id));
});

app.post("/api/leaves", auth, (req, res) => {
  const employee = employeeForUser(req.user.id);
  const { leaveType, startDate, endDate, remarks } = req.body || {};
  const days = inclusiveDays(startDate, endDate);
  if (!["Paid", "Sick", "Unpaid"].includes(leaveType) || days <= 0) return res.status(400).json({ message: "Enter a valid leave type and date range." });
  if (leaveType === "Paid" && days > employee.leave_balance) return res.status(400).json({ message: `Only ${employee.leave_balance} paid leave days remain.` });
  const existing = db.prepare(`SELECT id FROM leave_requests WHERE employee_id=? AND status IN ('Pending','Approved') AND start_date<=? AND end_date>=?`).get(employee.id, endDate, startDate);
  if (existing) return res.status(409).json({ message: "You already have a pending or approved leave overlapping this period." });
  const result = db.prepare(`INSERT INTO leave_requests(employee_id,leave_type,start_date,end_date,days,remarks) VALUES(?,?,?,?,?,?)`).run(employee.id, leaveType, startDate, endDate, days, String(remarks || "").trim());
  const conflicts = leaveConflicts(employee.id, startDate, endDate);
  notify(employee.id, "Leave request submitted", conflicts.length ? `Your request is waiting for HR review. ${conflicts.length} team availability conflict(s) were detected.` : "Your request is waiting for HR review.");
  audit(req.user.id, "Leave request", `${employee.name} requested ${days} day(s) of ${leaveType} leave.`);
  res.status(201).json({ request: db.prepare("SELECT * FROM leave_requests WHERE id=?").get(result.lastInsertRowid), conflicts });
});

app.patch("/api/leaves/:id", auth, hrOnly, (req, res) => {
  const id = Number(req.params.id);
  const { status, comment = "" } = req.body || {};
  if (!["Approved", "Rejected"].includes(status)) return res.status(400).json({ message: "Invalid leave decision." });
  const leave = db.prepare("SELECT * FROM leave_requests WHERE id=?").get(id);
  if (!leave) return res.status(404).json({ message: "Leave request not found." });
  if (leave.status !== "Pending") return res.status(409).json({ message: `This request is already ${leave.status.toLowerCase()}.` });
  const conflicts = status === "Approved" ? leaveConflicts(leave.employee_id, leave.start_date, leave.end_date, leave.id) : [];
  const tx = db.transaction(() => {
    db.prepare("UPDATE leave_requests SET status=?,hr_comment=? WHERE id=?").run(status, String(comment).trim(), id);
    if (status === "Approved" && leave.leave_type === "Paid") db.prepare("UPDATE employees SET leave_balance=MAX(0,leave_balance-?) WHERE id=?").run(leave.days, leave.employee_id);
    notify(leave.employee_id, `Leave ${status.toLowerCase()}`, `Your ${leave.leave_type.toLowerCase()} leave request was ${status.toLowerCase()}.` + (comment ? ` HR comment: ${comment}` : ""));
    audit(req.user.id, "Leave decision", `Leave #${id}: ${status}${conflicts.length ? ` with ${conflicts.length} availability conflict(s)` : ""}.`);
  });
  tx();
  res.json({ ok: true, conflicts });
});

app.get("/api/payroll", auth, (req, res) => {
  const own = employeeForUser(req.user.id);
  const employeeId = req.user.role === "hr" && req.query.employeeId ? Number(req.query.employeeId) : own.id;
  if (!validateEmployeeId(employeeId)) return res.status(404).json({ message: "Employee not found." });
  let payroll = db.prepare(`SELECT p.*,e.name,u.employee_id AS employee_code,e.department FROM payroll p JOIN employees e ON e.id=p.employee_id JOIN users u ON u.id=e.user_id WHERE p.employee_id=?`).get(employeeId);
  // Self-heal legacy/demo zero payroll rows instead of showing a broken ₹0 structure.
  if (!payroll || (Number(payroll.basic)+Number(payroll.hra)+Number(payroll.allowance) === 0 && Number(payroll.pf)+Number(payroll.tax)+Number(payroll.other_deduction) === 0)) {
    const employee = employeeById(employeeId);
    const salary = Number(employee?.salary || 0);
    if (employee && salary > 0) {
      const basic = Math.round(salary * 0.625);
      const hra = Math.round(salary * 0.25);
      const allowance = Math.max(0, salary - basic - hra);
      const pf = Math.round(basic * 0.12);
      const tax = 0;
      const other = 0;
      db.prepare(`INSERT INTO payroll(employee_id,basic,hra,allowance,pf,tax,other_deduction) VALUES(?,?,?,?,?,?,?)
        ON CONFLICT(employee_id) DO UPDATE SET basic=excluded.basic,hra=excluded.hra,allowance=excluded.allowance,pf=excluded.pf,tax=excluded.tax,other_deduction=excluded.other_deduction,updated_at=CURRENT_TIMESTAMP`).run(employeeId,basic,hra,allowance,pf,tax,other);
      payroll = db.prepare(`SELECT p.*,e.name,u.employee_id AS employee_code,e.department FROM payroll p JOIN employees e ON e.id=p.employee_id JOIN users u ON u.id=e.user_id WHERE p.employee_id=?`).get(employeeId);
    }
  }
  if (!payroll) return res.status(404).json({ message: "Payroll not found." });
  res.json(payroll);
});

app.get("/api/payroll/:employeeId/slip", auth, (req, res) => {
  const employeeId = Number(req.params.employeeId);
  const own = employeeForUser(req.user.id);
  if (req.user.role !== "hr" && employeeId !== own.id) return res.status(403).json({ message: "You can only access your own salary slip." });
  const employee = validateEmployeeId(employeeId);
  if (!employee) return res.status(404).json({ message: "Employee not found." });
  const payroll = db.prepare("SELECT * FROM payroll WHERE employee_id=?").get(employeeId);
  if (!payroll) return res.status(404).json({ message: "Payroll not found." });
  const gross = payroll.basic + payroll.hra + payroll.allowance;
  const deductions = payroll.pf + payroll.tax + payroll.other_deduction;
  const net = gross - deductions;
  const employeeCode = employeeCodeFor(employee);
  const doc = new PDFDocument({ size: "A4", margin: 50 });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="dayflow-salary-slip-${employeeCode || employee.id}.pdf"`);
  doc.pipe(res);
  doc.fontSize(20).text("DayFlow", { align: "center" });
  doc.fontSize(11).text("Salary Slip", { align: "center" });
  doc.moveDown();
  doc.fontSize(11).text(`Employee: ${employee.name}`);
  doc.text(`Employee ID: ${employeeCode}`);
  doc.text(`Department: ${employee.department}`);
  doc.text(`Designation: ${employee.designation}`);
  doc.moveDown();
  doc.text(`Basic Salary: INR ${payroll.basic.toFixed(2)}`);
  doc.text(`HRA: INR ${payroll.hra.toFixed(2)}`);
  doc.text(`Allowance: INR ${payroll.allowance.toFixed(2)}`);
  doc.text(`Gross Earnings: INR ${gross.toFixed(2)}`);
  doc.moveDown();
  doc.text(`PF: INR ${payroll.pf.toFixed(2)}`);
  doc.text(`Tax: INR ${payroll.tax.toFixed(2)}`);
  doc.text(`Other Deductions: INR ${payroll.other_deduction.toFixed(2)}`);
  doc.text(`Total Deductions: INR ${deductions.toFixed(2)}`);
  doc.moveDown();
  doc.fontSize(14).text(`Net Salary: INR ${net.toFixed(2)}`);
  doc.moveDown();
  doc.fontSize(9).fillColor("#666666").text("Generated by DayFlow HRMS. This document is a project demonstration salary slip.");
  doc.end();
});

app.put("/api/payroll/:employeeId", auth, hrOnly, (req, res) => {
  const employeeId = Number(req.params.employeeId);
  if (!validateEmployeeId(employeeId)) return res.status(404).json({ message: "Employee not found." });
  const fields = ["basic", "hra", "allowance", "pf", "tax", "other_deduction"];
  const values = fields.map(key => {
    const raw = req.body?.[key];
    return raw === "" || raw === null || raw === undefined ? 0 : Number(raw);
  });
  if (values.some(value => !Number.isFinite(value) || value < 0)) return res.status(400).json({ message: "All payroll amounts must be non-negative numbers." });
  const gross = values[0] + values[1] + values[2];
  const exists = db.prepare("SELECT id FROM payroll WHERE employee_id=?").get(employeeId);
  const tx = db.transaction(() => {
    if (exists) db.prepare("UPDATE payroll SET basic=?,hra=?,allowance=?,pf=?,tax=?,other_deduction=?,updated_at=CURRENT_TIMESTAMP WHERE employee_id=?").run(...values, employeeId);
    else db.prepare("INSERT INTO payroll(employee_id,basic,hra,allowance,pf,tax,other_deduction) VALUES(?,?,?,?,?,?,?)").run(employeeId, ...values);
    // Payroll structure is the source of truth for monthly gross salary.
    db.prepare("UPDATE employees SET salary=? WHERE id=?").run(gross, employeeId);
    audit(req.user.id, "Payroll update", `Payroll structure updated for employee #${employeeId}.`);
  });
  tx();
  res.json(db.prepare("SELECT p.*,e.name,u.employee_id AS employee_code,e.department FROM payroll p JOIN employees e ON e.id=p.employee_id JOIN users u ON u.id=e.user_id WHERE p.employee_id=?").get(employeeId));
});

app.get("/api/employees", auth, hrOnly, (_, res) => {
  res.json(db.prepare(`SELECT e.*,u.email,u.email_verified,u.employee_id FROM employees e JOIN users u ON u.id=e.user_id ORDER BY e.name`).all());
});

app.put("/api/employees/:id", auth, hrOnly, (req, res) => {
  const employee = validateEmployeeId(req.params.id);
  if (!employee) return res.status(404).json({ message: "Employee not found." });
  const allowed = ["name", "phone", "address", "department", "designation", "joining_date", "salary", "leave_balance", "avatar"];
  const next = { ...employee, ...Object.fromEntries(allowed.map(key => [key, req.body?.[key] ?? employee[key]])) };
  if (!next.name || !next.department || !next.designation || !parseDate(next.joining_date)) return res.status(400).json({ message: "Name, department, designation and a valid joining date are required." });
  if (["salary", "leave_balance"].some(k => !Number.isFinite(Number(next[k])) || Number(next[k]) < 0)) return res.status(400).json({ message: "Salary and leave balance must be non-negative numbers." });
  db.prepare(`UPDATE employees SET name=?,phone=?,address=?,department=?,designation=?,joining_date=?,salary=?,leave_balance=?,avatar=? WHERE id=?`).run(next.name,next.phone,next.address,next.department,next.designation,next.joining_date,Number(next.salary),Number(next.leave_balance),next.avatar,employee.id);
  // If HR edits gross salary from the directory, keep payroll earnings consistent.
  const payroll = db.prepare("SELECT basic,hra,allowance,pf,tax,other_deduction FROM payroll WHERE employee_id=?").get(employee.id);
  const gross = Number(next.salary);
  if (!payroll) {
    const basic = Math.round(gross * 0.625);
    const hra = Math.round(gross * 0.25);
    const allowance = Math.max(0, gross - basic - hra);
    const pf = Math.round(basic * 0.12);
    db.prepare("INSERT INTO payroll(employee_id,basic,hra,allowance,pf,tax,other_deduction) VALUES(?,?,?,?,?,?,?)").run(employee.id,basic,hra,allowance,pf,0,0);
  } else if (gross !== Number(payroll.basic + payroll.hra + payroll.allowance)) {
    const allowance = Math.max(0, gross - Number(payroll.basic) - Number(payroll.hra));
    db.prepare("UPDATE payroll SET allowance=?,updated_at=CURRENT_TIMESTAMP WHERE employee_id=?").run(allowance, employee.id);
  }
  audit(req.user.id, "Employee profile update", `HR updated employee #${employee.id}.`);
  res.json(employeeById(employee.id));
});

app.get("/api/insights", auth, hrOnly, (req, res) => {
  const lateEmployees = db.prepare(`SELECT e.name,e.department,SUM(CASE WHEN a.check_in>? THEN 1 ELSE 0 END) late_count FROM employees e LEFT JOIN attendance a ON a.employee_id=e.id GROUP BY e.id HAVING late_count>=3 ORDER BY late_count DESC`).all(EXPECTED_START);
  const overlaps = db.prepare(`SELECT ea.name employee_a,eb.name employee_b,a.start_date,a.end_date,a.days FROM leave_requests a JOIN leave_requests b ON a.id<b.id AND a.status IN ('Pending','Approved') AND b.status IN ('Pending','Approved') AND a.start_date<=b.end_date AND b.start_date<=a.end_date JOIN employees ea ON ea.id=a.employee_id JOIN employees eb ON eb.id=b.employee_id`).all();
  const pending = db.prepare("SELECT COUNT(*) count FROM leave_requests WHERE status='Pending'").get().count;
  const lowHours = db.prepare(`SELECT e.name,COUNT(*) short_days FROM attendance a JOIN employees e ON e.id=a.employee_id WHERE a.check_in IS NOT NULL AND a.check_out IS NOT NULL AND ((CAST(substr(a.check_out,1,2) AS INTEGER)*60+CAST(substr(a.check_out,4,2) AS INTEGER))-(CAST(substr(a.check_in,1,2) AS INTEGER)*60+CAST(substr(a.check_in,4,2) AS INTEGER)))<480 GROUP BY e.id HAVING short_days>=2`).all();
  return res.json({ lateEmployees, overlaps, pending, lowHours, rules: { expectedStart: EXPECTED_START, lateThreshold: 3, lowHoursThresholdMinutes: 480 } });
});

app.get("/api/notifications", auth, (req, res) => {
  const employee = employeeForUser(req.user.id);
  res.json(db.prepare("SELECT * FROM notifications WHERE employee_id=? ORDER BY created_at DESC LIMIT 30").all(employee.id));
});
app.patch("/api/notifications/:id/read", auth, (req, res) => {
  const employee = employeeForUser(req.user.id);
  db.prepare("UPDATE notifications SET read=1 WHERE id=? AND employee_id=?").run(Number(req.params.id), employee.id);
  res.json({ ok: true });
});

app.get("/api/audit", auth, hrOnly, (_, res) => {
  res.json(db.prepare("SELECT a.*,u.email FROM audit_logs a JOIN users u ON u.id=a.actor_user_id ORDER BY a.created_at DESC LIMIT 100").all());
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: process.env.NODE_ENV === "production" ? "Unexpected server error." : (err?.message || "Unexpected server error.") });
});

app.listen(PORT, () => console.log(`DayFlow API running on http://localhost:${PORT}`));
