import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity, Bell, BriefcaseBusiness, CalendarDays, CheckCircle2,
  Clock3, FileText, Home, LogOut, Menu, UserRound, Users,
  WalletCards, X, AlertTriangle, ChevronRight
} from "lucide-react";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip,
  XAxis, YAxis
} from "recharts";
import "./styles.css";

const API = `${import.meta.env.VITE_API_URL || "http://localhost:4000"}/api`;

async function api(path, options = {}) {
  const token = localStorage.getItem("dayflow_token");
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(API + path, { ...options, headers });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) throw new Error(data.message || "Something went wrong.");
  return data;
}

const money = value =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 })
    .format(value || 0);

function App() {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("dayflow_user")); }
    catch { return null; }
  });
  const [page, setPage] = useState("dashboard");
  const [mobileOpen, setMobileOpen] = useState(false);

  function login(data) {
    localStorage.setItem("dayflow_token", data.token);
    localStorage.setItem("dayflow_user", JSON.stringify(data.user));
    setUser(data.user);
  }

  function logout() {
    localStorage.removeItem("dayflow_token");
    localStorage.removeItem("dayflow_user");
    setUser(null);
  }

  if (!user) return <Login onLogin={login} />;

  return (
    <div className="app-shell">
      <Sidebar
        user={user}
        page={page}
        setPage={setPage}
        mobileOpen={mobileOpen}
        closeMobile={() => setMobileOpen(false)}
        logout={logout}
      />

      <main className="main">
        <header className="topbar">
          <button className="icon-button mobile-menu" onClick={() => setMobileOpen(true)}>
            <Menu size={20} />
          </button>
          <div>
            <p className="eyebrow">DAYFLOW / {user.role === "hr" ? "HR CONSOLE" : "EMPLOYEE SPACE"}</p>
            <h2>{pageTitle(page)}</h2>
          </div>
          <NotificationBell />
        </header>

        <div className="page-content">
          {page === "dashboard" && <Dashboard user={user} setPage={setPage} />}
          {page === "attendance" && <Attendance user={user} />}
          {page === "leave" && <Leave user={user} />}
          {page === "payroll" && <Payroll user={user} />}
          {page === "profile" && <Profile user={user} />}
          {page === "employees" && user.role === "hr" && <Employees />}
          {page === "insights" && user.role === "hr" && <Insights />}
          {page === "team" && user.role === "hr" && <TeamAvailability />}
          {page === "audit" && user.role === "hr" && <Audit />}
        </div>
      </main>
    </div>
  );
}

function pageTitle(page) {
  const titles = {
    dashboard: "Your workday at a glance",
    attendance: "Attendance",
    leave: "Leave & time-off",
    payroll: "Payroll",
    profile: "Profile",
    employees: "People directory",
    insights: "DayFlow Insights",
    team: "Team availability",
    audit: "Audit trail"
  };
  return titles[page] || "DayFlow";
}

function Login({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("sanjana@dayflow.local");
  const [password, setPassword] = useState("password123");
  const [signup, setSignup] = useState({ employeeId: "", name: "", department: "Engineering", designation: "Software Engineer", joiningDate: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError(""); setMessage(""); setLoading(true);
    try {
      if (mode === "login") {
        const data = await api("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
        onLogin(data);
      } else {
        const data = await api("/auth/signup", { method: "POST", body: JSON.stringify(signup) });
        if (data.verificationToken) {
          // This demo build has no real mail server: the API hands back the verification
          // token directly instead of emailing it, so we complete verification immediately.
          await api(`/auth/verify?token=${encodeURIComponent(data.verificationToken)}`);
          setMessage("Account created and verified. You can sign in now.");
        } else {
          setMessage(data.message);
        }
        setMode("login");
        setEmail(signup.email); setPassword(signup.password);
      }
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  return (
    <div className="login-page">
      <div className="login-art">
        <div className="brand-mark large">D</div>
        <p className="eyebrow">DAYFLOW HRMS</p>
        <h1>Every workday,<br /><span>perfectly aligned.</span></h1>
        <p className="muted large-copy">Attendance, leave, payroll and people insights in one calm workspace.</p>
        <div className="login-proof">
          <span><CheckCircle2 size={16} /> Explainable insights</span>
          <span><CheckCircle2 size={16} /> Role-aware access</span>
          <span><CheckCircle2 size={16} /> Approval workflows</span>
        </div>
      </div>

      <form className="login-card" onSubmit={submit}>
        <div className="brand-row"><div className="brand-mark">D</div><strong>DayFlow</strong></div>
        <p className="eyebrow">{mode === "login" ? "WELCOME BACK" : "NEW EMPLOYEE"}</p>
        <h2>{mode === "login" ? "Sign in to your workspace" : "Create your employee account"}</h2>
        <p className="muted">{mode === "login" ? "Use an employee or HR account." : "Email verification is required before sign in."}</p>

        {mode === "login" ? (
          <>
            <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></label>
            <label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} required /></label>
          </>
        ) : (
          <>
            <div className="form-grid">
              <label>Employee ID<input value={signup.employeeId} onChange={e => setSignup({...signup, employeeId:e.target.value})} required /></label>
              <label>Full name<input value={signup.name} onChange={e => setSignup({...signup, name:e.target.value})} required /></label>
              <label>Department<input value={signup.department} onChange={e => setSignup({...signup, department:e.target.value})} required /></label>
              <label>Designation<input value={signup.designation} onChange={e => setSignup({...signup, designation:e.target.value})} required /></label>
              <label>Joining date<input type="date" value={signup.joiningDate} onChange={e => setSignup({...signup, joiningDate:e.target.value})} required /></label>
              <label>Email<input type="email" value={signup.email} onChange={e => setSignup({...signup, email:e.target.value})} required /></label>
              <label className="span-2">Password<input type="password" minLength="8" value={signup.password} onChange={e => setSignup({...signup, password:e.target.value})} required /></label>
            </div>
          </>
        )}

        {error && <div className="error-box">{error}</div>}
        {message && <div className="demo-hint"><strong>Verification</strong><span>{message}</span></div>}
        <button className="primary-button wide" disabled={loading}>{loading ? "Please wait..." : mode === "login" ? "Sign in" : "Create account"}</button>

        {mode === "login" ? (
          <div className="demo-hint"><strong>Demo accounts</strong><span>Employee: sanjana@dayflow.local</span><span>HR: hr@dayflow.local</span><span>Password: password123</span></div>
        ) : null}
        <button type="button" className="text-button" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); setMessage(""); }}>
          {mode === "login" ? "Create a new employee account" : "Back to sign in"}
        </button>
      </form>
    </div>
  );
}

function Sidebar({ user, page, setPage, mobileOpen, closeMobile, logout }) {
  const employeeItems = [
    ["dashboard", Home, "Dashboard"],
    ["attendance", Clock3, "Attendance"],
    ["leave", CalendarDays, "Leave"],
    ["payroll", WalletCards, "Payroll"],
    ["profile", UserRound, "Profile"]
  ];

  const hrItems = [
    ["dashboard", Home, "Dashboard"],
    ["employees", Users, "Employees"],
    ["attendance", Clock3, "Attendance"],
    ["leave", CalendarDays, "Leave approvals"],
    ["payroll", WalletCards, "Payroll"],
    ["insights", Activity, "Insights"],
    ["team", Users, "Team availability"],
    ["audit", FileText, "Audit trail"]
  ];

  const items = user.role === "hr" ? hrItems : employeeItems;

  return (
    <>
      {mobileOpen && <div className="overlay" onClick={closeMobile} />}
      <aside className={`sidebar ${mobileOpen ? "open" : ""}`}>
        <div className="brand-row sidebar-brand">
          <div className="brand-mark">D</div>
          <strong>DayFlow</strong>
          <button className="icon-button close-mobile" onClick={closeMobile}><X size={18} /></button>
        </div>

        <div className="role-chip">
          <span className="avatar small">{initials(user.name)}</span>
          <div>
            <strong>{user.name}</strong>
            <small>{user.role === "hr" ? "HR Officer" : "Employee"}</small>
          </div>
        </div>

        <nav>
          <p className="nav-label">WORKSPACE</p>
          {items.map(([id, Icon, label]) => (
            <button
              key={id}
              className={`nav-item ${page === id ? "active" : ""}`}
              onClick={() => { setPage(id); closeMobile(); }}
            >
              <Icon size={18} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="mini-note">
            <span className="dot" />
            <div>
              <strong>DayFlow Insights</strong>
              <small>Making HR decisions easier.</small>
            </div>
          </div>
          <button className="nav-item logout" onClick={logout}>
            <LogOut size={18} /> <span>Sign out</span>
          </button>
        </div>
      </aside>
    </>
  );
}

function Dashboard({ user, setPage }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    api("/dashboard").then(setData).catch(console.error);
  }, []);

  if (!data) return <Loading />;

  if (user.role === "hr") {
    return <HRDashboard data={data} setPage={setPage} />;
  }

  return <EmployeeDashboard data={data} setPage={setPage} />;
}

function EmployeeDashboard({ data, setPage }) {
  const record = data.todayRecord;
  return (
    <>
      <div className="welcome">
        <div>
          <p className="eyebrow">{new Intl.DateTimeFormat("en-IN", { weekday: "long", month: "long", day: "numeric" }).format(new Date()).toUpperCase()}</p>
          <h1>Good morning, {data.employee.name.split(" ")[0]} <span className="wave">✦</span></h1>
          <p className="muted">Here’s what your workday looks like.</p>
        </div>
        <button className="secondary-button" onClick={() => setPage("profile")}>
          <UserRound size={16} /> View profile
        </button>
      </div>

      <div className="stat-grid">
        <StatCard icon={Activity} label="Attendance score" value={`${data.attendanceScore}%`} note="Last 7 recorded days" />
        <StatCard icon={CalendarDays} label="Pending leaves" value={data.pendingLeaves} note="Waiting for HR" />
        <StatCard icon={BriefcaseBusiness} label="Leave balance" value={`${data.employee.leave_balance} days`} note="Paid leave remaining" />
        <StatCard icon={Clock3} label="Today" value={record?.check_in ? "Checked in" : "Not checked in"} note={record?.check_in ? `Since ${record.check_in}` : "Start your workday"} />
      </div>

      <div className="two-col">
        <WorkdayCard record={record} />
        <InsightCard score={data.attendanceScore} />
      </div>

      <section className="panel">
        <PanelHeader title="Recent attendance" action="View all" onAction={() => setPage("attendance")} />
        <AttendanceMini rows={data.recentAttendance} />
      </section>
    </>
  );
}

function HRDashboard({ data, setPage }) {
  return (
    <>
      <div className="welcome">
        <div>
          <p className="eyebrow">HR COMMAND CENTER</p>
          <h1>Good morning, Ananya <span className="wave">✦</span></h1>
          <p className="muted">A decision-ready view of today’s workforce.</p>
        </div>
        <button className="primary-button" onClick={() => setPage("insights")}>
          <Activity size={16} /> Open insights
        </button>
      </div>

      <div className="stat-grid">
        <StatCard icon={Users} label="Employees" value={data.metrics.employeeCount} note="Across all departments" />
        <StatCard icon={CheckCircle2} label="Present today" value={data.metrics.presentToday} note="Recorded attendance" />
        <StatCard icon={CalendarDays} label="Pending leaves" value={data.metrics.pendingLeaves} note="Needs HR attention" />
        <StatCard icon={AlertTriangle} label="Attendance alerts" value={data.anomalies.length} note="Repeated late patterns" alert={data.anomalies.length > 0} />
      </div>

      <div className="two-col">
        <section className="panel">
          <PanelHeader title="Action center" />
          <div className="action-list">
            <ActionRow
              icon={CalendarDays}
              title={`${data.metrics.pendingLeaves} leave request${data.metrics.pendingLeaves === 1 ? "" : "s"} waiting`}
              text="Review requests before the end of the day."
              onClick={() => setPage("leave")}
            />
            <ActionRow
              icon={AlertTriangle}
              title={`${data.anomalies.length} attendance pattern${data.anomalies.length === 1 ? "" : "s"} detected`}
              text="Repeated late check-ins need a closer look."
              onClick={() => setPage("insights")}
            />
            <ActionRow
              icon={Users}
              title="People directory"
              text="Open employee records and team information."
              onClick={() => setPage("employees")}
            />
          </div>
        </section>

        <AttendanceTrend />
      </div>

      <section className="panel">
        <PanelHeader title="Repeated late check-ins" action="See insights" onAction={() => setPage("insights")} />
        {data.anomalies.length === 0 ? (
          <Empty text="No attendance anomalies detected." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Employee</th><th>Late check-ins</th><th>Meaning</th></tr></thead>
              <tbody>
                {data.anomalies.map(row => (
                  <tr key={row.name}>
                    <td><strong>{row.name}</strong></td>
                    <td><span className="pill warning">{row.late_count} times</span></td>
                    <td className="muted">Repeated late pattern</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function WorkdayCard({ record }) {
  const [busy, setBusy] = useState(false);
  const [local, setLocal] = useState(record);
  const [error, setError] = useState("");

  async function action(type) {
    setBusy(true);
    setError("");
    try {
      await api(`/attendance/${type}`, { method: "POST" });
      const dash = await api("/dashboard");
      setLocal(dash.todayRecord);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel workday">
      <PanelHeader title="Today’s workday" />
      <div className="workday-main">
        <div className="time-ring">
          <Clock3 size={28} />
        </div>
        <div>
          <span className="status-label">{local?.check_out ? "COMPLETED" : local?.check_in ? "IN PROGRESS" : "NOT STARTED"}</span>
          <h2>{local?.check_in || "—"}</h2>
          <p className="muted">{local?.check_in ? `Checked in${local.check_out ? ` · out ${local.check_out}` : ""}` : "Your first check-in starts today’s record."}</p>
        </div>
      </div>
      <div className="timeline">
        <TimelineItem label="Check in" value={local?.check_in || "Pending"} done={!!local?.check_in} />
        <TimelineItem label="Workday" value={local?.check_in && !local?.check_out ? "In progress" : local?.check_out ? "Completed" : "Waiting"} done={!!local?.check_in} />
        <TimelineItem label="Check out" value={local?.check_out || "Pending"} done={!!local?.check_out} last />
      </div>
      <div className="button-row">
        <button className="primary-button" disabled={busy || !!local?.check_in} onClick={() => action("check-in")}>
          Check in
        </button>
        <button className="secondary-button" disabled={busy || !local?.check_in || !!local?.check_out} onClick={() => action("check-out")}>
          Check out
        </button>
      </div>
      {error && <div className="error-box compact">{error}</div>}
    </section>
  );
}

function InsightCard({ score }) {
  return (
    <section className="panel insight-panel">
      <PanelHeader title="DayFlow insight" />
      <div className="insight-score">
        <div className="score-circle">{score}</div>
        <div>
          <span className="status-label">WORKDAY HEALTH</span>
          <h3>{score >= 90 ? "Strong consistency" : score >= 75 ? "Good consistency" : "Needs attention"}</h3>
          <p className="muted">
            Calculated from recent recorded attendance and punctuality.
          </p>
        </div>
      </div>
      <div className="insight-reason">
        <span>Why this score?</span>
        <p>Recent check-in patterns are compared with the 09:15 expected start used by DayFlow.</p>
      </div>
    </section>
  );
}

function Attendance({ user }) {
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState("");
  const [employees, setEmployees] = useState([]);

  useEffect(() => {
    if (user.role === "hr") api("/employees").then(setEmployees).catch(() => setEmployees([]));
  }, [user.role]);

  useEffect(() => {
    api(`/attendance${selected ? `?employeeId=${selected}` : ""}`).then(setRows).catch(() => setRows([]));
  }, [selected]);

  const chartData = rows.slice(0, 10).reverse().map(row => ({
    day: row.work_date.slice(5),
    punctual: row.check_in <= "09:15" ? 100 : 60
  }));

  return (
    <>
      <div className="toolbar">
        <div>
          <p className="muted">Daily and weekly attendance records.</p>
        </div>
        {user.role === "hr" && (
          <select value={selected} onChange={e => setSelected(e.target.value)}>
            <option value="">Select employee</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        )}
      </div>

      <section className="panel chart-panel">
        <PanelHeader title="Punctuality trend" />
        <div className="chart">
          <ResponsiveContainer width="100%" height={230}>
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="day" />
              <YAxis domain={[0, 100]} />
              <Tooltip />
              <Area type="monotone" dataKey="punctual" strokeWidth={2} fillOpacity={0.12} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="panel">
        <PanelHeader title="Attendance records" />
        {rows.length ? (
          <AttendanceTable rows={rows} />
        ) : <Empty text="No attendance records found." />}
      </section>
    </>
  );
}

function AttendanceMini({ rows }) {
  return (
    <div className="attendance-mini">
      {rows.map(row => (
        <div className="attendance-day" key={row.work_date}>
          <div>
            <strong>{new Date(row.work_date).toLocaleDateString("en-IN", { weekday: "short" })}</strong>
            <small>{row.work_date}</small>
          </div>
          <span className={`pill ${row.check_in > "09:15" ? "warning" : "success"}`}>
            {row.check_in > "09:15" ? "Late" : row.status}
          </span>
          <span className="muted">{row.check_in || "—"} → {row.check_out || "—"}</span>
        </div>
      ))}
    </div>
  );
}

function AttendanceTable({ rows }) {
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Date</th><th>Check in</th><th>Check out</th><th>Status</th></tr></thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.id}>
              <td>{row.work_date}</td>
              <td>{row.check_in || "—"}</td>
              <td>{row.check_out || "—"}</td>
              <td><span className={`pill ${row.check_in > "09:15" ? "warning" : "success"}`}>{row.check_in > "09:15" ? "Late" : row.status}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Leave({ user }) {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({
    leaveType: "Paid", startDate: "", endDate: "", remarks: ""
  });
  const [error, setError] = useState("");
  const [pendingDecision, setPendingDecision] = useState(null); // { id, status }
  const [decisionComment, setDecisionComment] = useState("");
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [decisionError, setDecisionError] = useState("");

  const load = () => api("/leaves").then(setRows).catch(err => setError(err.message));
  useEffect(load, []);

  async function submit(e) {
    e.preventDefault();
    setError("");
    try {
      await api("/leaves", { method: "POST", body: JSON.stringify(form) });
      setForm({ leaveType: "Paid", startDate: "", endDate: "", remarks: "" });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  function startDecision(id, status) {
    setPendingDecision({ id, status });
    setDecisionComment("");
    setDecisionError("");
  }

  function cancelDecision() {
    setPendingDecision(null);
    setDecisionComment("");
    setDecisionError("");
  }

  async function confirmDecision() {
    if (!pendingDecision) return;
    setDecisionBusy(true);
    setDecisionError("");
    try {
      await api(`/leaves/${pendingDecision.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: pendingDecision.status, comment: decisionComment })
      });
      setPendingDecision(null);
      setDecisionComment("");
      load();
    } catch (err) {
      setDecisionError(err.message);
    } finally {
      setDecisionBusy(false);
    }
  }

  return (
    <>
      {user.role === "employee" && (
        <section className="panel form-panel">
          <PanelHeader title="Request time off" />
          <form onSubmit={submit} className="form-grid">
            <label>Leave type
              <select value={form.leaveType} onChange={e => setForm({...form, leaveType: e.target.value})}>
                <option>Paid</option><option>Sick</option><option>Unpaid</option>
              </select>
            </label>
            <label>Start date<input type="date" value={form.startDate} onChange={e => setForm({...form, startDate: e.target.value})} required /></label>
            <label>End date<input type="date" value={form.endDate} onChange={e => setForm({...form, endDate: e.target.value})} required /></label>
            <label className="span-2">Remarks<textarea value={form.remarks} onChange={e => setForm({...form, remarks: e.target.value})} placeholder="Add context for HR..." /></label>
            <div className="span-2 button-row"><button className="primary-button">Submit request</button></div>
          </form>
          {error && <div className="error-box compact">{error}</div>}
        </section>
      )}

      <section className="panel">
        <PanelHeader title={user.role === "hr" ? "Leave approval queue" : "My leave requests"} />
        {rows.length ? (
          <div className="leave-list">
            {rows.map(row => (
              <div className="leave-card" key={row.id}>
                <div className="leave-icon"><CalendarDays size={20} /></div>
                <div className="leave-main">
                  <div className="leave-title">
                    <strong>{row.leave_type} leave</strong>
                    <span className={`pill ${row.status.toLowerCase()}`}>{row.status}</span>
                  </div>
                  <p>{row.start_date} → {row.end_date} · {row.days} day{row.days === 1 ? "" : "s"}</p>
                  {user.role === "hr" && <small>{row.name} · {row.department}</small>}
                  {row.remarks && <small>“{row.remarks}”</small>}
                </div>
                {user.role === "hr" && row.status === "Pending" && (
                  pendingDecision?.id === row.id ? (
                    <div className="decision-panel">
                      <textarea
                        rows={2}
                        placeholder="Optional HR comment..."
                        value={decisionComment}
                        onChange={e => setDecisionComment(e.target.value)}
                        disabled={decisionBusy}
                      />
                      {decisionError && <div className="error-box compact">{decisionError}</div>}
                      <div className="button-row compact-actions">
                        <button className="secondary-button" onClick={cancelDecision} disabled={decisionBusy}>Cancel</button>
                        <button
                          className={pendingDecision.status === "Approved" ? "primary-button" : "secondary-button"}
                          onClick={confirmDecision}
                          disabled={decisionBusy}
                        >
                          {decisionBusy ? "Saving..." : `Confirm ${pendingDecision.status.toLowerCase()}`}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="button-row compact-actions">
                      <button className="secondary-button" onClick={() => startDecision(row.id, "Rejected")}>Reject</button>
                      <button className="primary-button" onClick={() => startDecision(row.id, "Approved")}>Approve</button>
                    </div>
                  )
                )}
              </div>
            ))}
          </div>
        ) : <Empty text="No leave requests yet." />}
      </section>
    </>
  );
}

function Payroll({ user }) {
  const [rows, setRows] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [selected, setSelected] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (user.role === "hr") {
      api("/employees").then(list => {
        setEmployees(list);
        if (!selected && list.length) setSelected(String(list.find(e => e.email === "sanjana@dayflow.local")?.id || list[0].id));
      }).catch(err => setMessage(err.message));
    }
  }, [user.role]);

  useEffect(() => {
    const target = selected ? `?employeeId=${selected}` : "";
    if (user.role === "hr" && !selected) return;
    api(`/payroll${target}`).then(data => { setRows(data); setEditing(false); setMessage(""); }).catch(err => { setRows({}); setMessage(err.message); });
  }, [selected, user.role]);

  async function downloadSlip() {
    if (!selected && user.role === "hr") return;
    const employeeId = selected || "me";
    try {
      const token = localStorage.getItem("dayflow_token");
      const target = employeeId === "me" ? null : employeeId;
      const profile = target ? null : await api("/profile");
      const id = target || profile.id;
      const response = await fetch(`${API}/payroll/${id}/slip`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.message || "Could not generate salary slip."); }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a"); link.href = url; link.download = `dayflow-salary-slip-${id}.pdf`; link.click(); URL.revokeObjectURL(url);
    } catch (err) { setMessage(err.message); }
  }

  async function savePayroll(e) {
    e.preventDefault();
    if (!selected) return;
    setSaving(true);
    setMessage("");
    try {
      const data = await api(`/payroll/${selected}`, { method: "PUT", body: JSON.stringify({
        basic: Number(rows.basic), hra: Number(rows.hra), allowance: Number(rows.allowance),
        pf: Number(rows.pf), tax: Number(rows.tax), other_deduction: Number(rows.other_deduction)
      }) });
      setRows(data); setEditing(false); setMessage("Payroll structure saved.");
    } catch (err) { setMessage(err.message || "Could not save payroll."); } finally { setSaving(false); }
  }

  const gross = (rows.basic || 0) + (rows.hra || 0) + (rows.allowance || 0);
  const deductions = (rows.pf || 0) + (rows.tax || 0) + (rows.other_deduction || 0);
  const net = gross - deductions;

  return (
    <>
      {user.role === "hr" && (
        <div className="toolbar">
          <p className="muted">HR can view and update salary structure. Employees have read-only access.</p>
          <select value={selected} onChange={e => setSelected(e.target.value)}>
            <option value="">Select employee</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
      )}

      <section className="payroll-hero">
        <div>
          <span className="status-label">NET SALARY / CURRENT STRUCTURE</span>
          <h1>{money(net)}</h1>
          <p>Gross {money(gross)} · Deductions {money(deductions)}</p>
        </div>
        <WalletCards size={54} strokeWidth={1.2} />
      </section>

      <section className="panel">
        <PanelHeader title="Salary breakdown" action={user.role === "hr" && selected ? (editing ? "Cancel" : "Edit structure") : null} onAction={() => setEditing(!editing)} />
        <div className="button-row compact-actions" style={{ marginBottom: 14 }}>
          <button className="secondary-button" onClick={downloadSlip}>Download salary slip</button>
        </div>
        {editing ? (
          <form className="form-grid" onSubmit={savePayroll}>
            {[
              ["basic", "Basic salary"], ["hra", "HRA"], ["allowance", "Special allowance"],
              ["pf", "PF"], ["tax", "Tax"], ["other_deduction", "Other deductions"]
            ].map(([key, label]) => (
              <label key={key}>{label}<input type="number" min="0" step="1" value={rows[key] ?? 0} onChange={e => setRows({...rows, [key]: e.target.value})} /></label>
            ))}
            <div className="span-2 button-row"><button className="primary-button" disabled={saving}>{saving ? "Saving..." : "Save payroll"}</button></div>
          </form>
        ) : (
          <div className="salary-grid">
            <MoneyRow label="Basic salary" value={rows.basic} positive />
            <MoneyRow label="HRA" value={rows.hra} positive />
            <MoneyRow label="Special allowance" value={rows.allowance} positive />
            <MoneyRow label="PF" value={rows.pf} />
            <MoneyRow label="Tax" value={rows.tax} />
            <MoneyRow label="Other deductions" value={rows.other_deduction} />
          </div>
        )}
        {message && <div className="error-box compact">{message}</div>}
      </section>
    </>
  );
}

function Profile() {
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({ phone: "", address: "" });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api("/profile").then(data => {
      setProfile(data);
      setForm({ phone: data.phone || "", address: data.address || "" });
    });
  }, []);

  async function save(e) {
    e.preventDefault();
    const updated = await api("/profile", {
      method: "PUT",
      body: JSON.stringify(form)
    });
    setProfile(updated);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  if (!profile) return <Loading />;

  return (
    <div className="two-col profile-layout">
      <section className="panel profile-card">
        <div className="profile-top">
          <div className="avatar big">{initials(profile.name)}</div>
          <div>
            <h2>{profile.name}</h2>
            <p className="muted">{profile.designation}</p>
            <span className="pill neutral">{profile.department}</span>
          </div>
        </div>
        <div className="detail-list">
          <Detail label="Employee ID" value={`EMP${String(profile.id).padStart(4, "0")}`} />
          <Detail label="Joining date" value={profile.joining_date} />
          <Detail label="Leave balance" value={`${profile.leave_balance} days`} />
          <Detail label="Salary structure" value={money(profile.salary)} />
        </div>
      </section>

      <section className="panel form-panel">
        <PanelHeader title="Editable personal details" />
        <form onSubmit={save} className="stack-form">
          <label>Phone<input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="+91 ..." /></label>
          <label>Address<textarea value={form.address} onChange={e => setForm({...form, address: e.target.value})} placeholder="Current address" /></label>
          <button className="primary-button">{saved ? "Saved ✓" : "Save changes"}</button>
        </form>
      </section>
    </div>
  );
}

function Employees() {
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(null);
  const [message, setMessage] = useState("");

  async function load() {
    try { setRows(await api("/employees")); } catch (err) { setMessage(err.message); }
  }
  useEffect(() => { load(); }, []);

  function edit(row) {
    setSelected(row.id);
    setForm({ name: row.name, phone: row.phone || "", address: row.address || "", department: row.department, designation: row.designation, joining_date: row.joining_date, salary: row.salary, leave_balance: row.leave_balance });
    setMessage("");
  }

  async function save(e) {
    e.preventDefault();
    try {
      await api(`/employees/${selected}`, { method: "PUT", body: JSON.stringify(form) });
      setMessage("Employee record saved."); setSelected(null); setForm(null); await load();
    } catch (err) { setMessage(err.message); }
  }

  return (
    <div className="two-col">
      <section className="panel">
        <PanelHeader title="Employee directory" />
        <div className="employee-grid">
          {rows.map(row => (
            <button className="employee-card" key={row.id} onClick={() => edit(row)} style={{ textAlign: "left" }}>
              <div className="avatar">{initials(row.name)}</div>
              <div className="employee-info">
                <strong>{row.name}</strong><span>{row.designation}</span><small>{row.department} · {row.email}</small>
              </div>
              <ChevronRight size={18} className="muted-icon" />
            </button>
          ))}
        </div>
      </section>

      <section className="panel form-panel">
        <PanelHeader title={form ? "Edit employee record" : "Employee administration"} />
        {form ? (
          <form className="form-grid" onSubmit={save}>
            <label>Name<input value={form.name} onChange={e => setForm({...form, name:e.target.value})} required /></label>
            <label>Phone<input value={form.phone} onChange={e => setForm({...form, phone:e.target.value})} /></label>
            <label>Department<input value={form.department} onChange={e => setForm({...form, department:e.target.value})} required /></label>
            <label>Designation<input value={form.designation} onChange={e => setForm({...form, designation:e.target.value})} required /></label>
            <label>Joining date<input type="date" value={form.joining_date} onChange={e => setForm({...form, joining_date:e.target.value})} required /></label>
            <label>Salary<input type="number" min="0" value={form.salary} onChange={e => setForm({...form, salary:e.target.value})} /></label>
            <label>Paid leave balance<input type="number" min="0" step="0.5" value={form.leave_balance} onChange={e => setForm({...form, leave_balance:e.target.value})} /></label>
            <label className="span-2">Address<textarea value={form.address} onChange={e => setForm({...form, address:e.target.value})} /></label>
            <div className="span-2 button-row"><button className="primary-button">Save employee</button><button type="button" className="secondary-button" onClick={() => {setSelected(null);setForm(null);}}>Cancel</button></div>
          </form>
        ) : <Empty text="Select an employee to edit personal, job and salary information." />}
        {message && <div className="error-box compact">{message}</div>}
      </section>
    </div>
  );
}

function Insights() {
  const [data, setData] = useState(null);
  const [availability, setAvailability] = useState([]);
  useEffect(() => {
    Promise.all([api("/insights"), api("/team-availability")]).then(([insights, team]) => { setData(insights); setAvailability(team); }).catch(console.error);
  }, []);
  if (!data) return <Loading />;

  return (
    <>
      <div className="insight-banner">
        <div className="insight-banner-icon"><Activity size={26} /></div>
        <div>
          <span className="status-label">DAYFLOW INSIGHTS</span>
          <h2>From HR records to actionable decisions.</h2>
          <p>Every alert below is rule-based and explainable — HR remains in control.</p>
        </div>
      </div>

      <div className="stat-grid">
        <StatCard icon={AlertTriangle} label="Late patterns" value={data.lateEmployees.length} note="3+ late check-ins" alert />
        <StatCard icon={CalendarDays} label="Pending leave" value={data.pending} note="Needs HR review" />
        <StatCard icon={Users} label="Overlap signals" value={data.overlaps.length} note="Pending/approved overlaps" />
        <StatCard icon={Clock3} label="Low-hours patterns" value={data.lowHours.length} note="2+ short workdays" alert={data.lowHours.length > 0} />
      </div>

      <section className="panel">
        <PanelHeader title="Team availability today" />
        {availability.length ? (
          <div className="employee-grid">
            {availability.map(person => (
              <div className="employee-card" key={person.id}>
                <div className="avatar">{initials(person.name)}</div>
                <div className="employee-info"><strong>{person.name}</strong><span>{person.department}</span><small>{person.on_leave ? "On approved leave" : person.attendance_status === "Present" ? `Present · ${person.check_in || "checked in"}` : "No attendance recorded"}</small></div>
              </div>
            ))}
          </div>
        ) : <Empty text="No team records available." />}
      </section>

      <div className="two-col">
        <section className="panel">
          <PanelHeader title="Attendance pattern detector" />
          {data.lateEmployees.length ? data.lateEmployees.map(row => (
            <div className="signal" key={row.name}>
              <div className="signal-icon warning-bg"><AlertTriangle size={18} /></div>
              <div>
                <strong>{row.name}</strong>
                <p>{row.late_count} late check-ins · {row.department}</p>
                <small>Rule triggered: late check-ins ≥ 3.</small>
              </div>
            </div>
          )) : <Empty text="No repeated late patterns." />}
        </section>

        <section className="panel">
          <PanelHeader title="Low working-hours detector" />
          {data.lowHours.length ? data.lowHours.map(row => (
            <div className="signal" key={row.name}>
              <div className="signal-icon"><Clock3 size={18} /></div>
              <div>
                <strong>{row.name}</strong>
                <p>{row.short_days} short workday{row.short_days === 1 ? "" : "s"}</p>
                <small>Rule triggered: completed workday below 8 hours on at least 2 days.</small>
              </div>
            </div>
          )) : <Empty text="No repeated low-hours patterns." />}
        </section>

        <section className="panel">
          <PanelHeader title="Leave overlap detector" />
          {data.overlaps.length ? data.overlaps.map((row, i) => (
            <div className="signal" key={i}>
              <div className="signal-icon"><CalendarDays size={18} /></div>
              <div>
                <strong>{row.employee_a} + {row.employee_b}</strong>
                <p>Overlap: {row.start_date} → {row.end_date}</p>
                <small>HR should review team availability before future approvals.</small>
              </div>
            </div>
          )) : <Empty text="No pending or approved leave overlaps detected." />}
        </section>
      </div>
    </>
  );
}

function TeamAvailability() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  useEffect(() => {
    setError("");
    api(`/team-availability?date=${date}`).then(setRows).catch(err => setError(err.message));
  }, [date]);
  return (
    <section className="panel">
      <PanelHeader title="Team availability" />
      <div className="toolbar"><p className="muted">See who is available, on approved leave, or has no attendance recorded.</p><label>Date<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label></div>
      {error && <div className="error-box compact">{error}</div>}
      {rows.length ? <div className="employee-grid">{rows.map(person => (
        <div className="employee-card" key={person.id}>
          <div className="avatar">{initials(person.name)}</div>
          <div className="employee-info"><strong>{person.name}</strong><span>{person.department} · {person.designation}</span><small>{person.on_leave ? "On approved leave" : person.attendance_status === "Present" ? `Present · ${person.check_in || "checked in"}` : "No attendance recorded"}</small></div>
        </div>
      ))}</div> : !error && <Empty text="No employee records available." />}
    </section>
  );
}

function Audit() {
  const [rows, setRows] = useState([]);
  useEffect(() => { api("/audit").then(setRows); }, []);

  return (
    <section className="panel">
      <PanelHeader title="Recent administrative actions" />
      {rows.length ? (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Time</th><th>Action</th><th>Details</th><th>Actor</th></tr></thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id}>
                  <td>{row.created_at}</td>
                  <td><strong>{row.action}</strong></td>
                  <td>{row.details}</td>
                  <td className="muted">{row.email}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Empty text="No administrative actions recorded yet." />}
    </section>
  );
}

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);

  async function load() {
    try { setRows(await api("/notifications")); } catch {}
  }

  useEffect(() => { load(); }, []);

  async function markRead(id) {
    await api(`/notifications/${id}/read`, { method: "PATCH" });
    load();
  }

  const unread = rows.filter(row => !row.read).length;

  return (
    <div className="notification-wrap">
      <button className="icon-button" onClick={() => setOpen(!open)}>
        <Bell size={19} />
        {unread > 0 && <span className="notification-dot">{unread}</span>}
      </button>
      {open && (
        <div className="notification-popover">
          <div className="popover-title"><strong>Notifications</strong><span>{unread} unread</span></div>
          {rows.length ? rows.map(row => (
            <button className={`notification-item ${row.read ? "" : "unread"}`} key={row.id} onClick={() => markRead(row.id)}>
              <span className="notification-icon"><Bell size={14} /></span>
              <span><strong>{row.title}</strong><small>{row.message}</small></span>
            </button>
          )) : <Empty text="No notifications." />}
        </div>
      )}
    </div>
  );
}

function AttendanceTrend() {
  const data = [
    { day: "W1", attendance: 82 },
    { day: "W2", attendance: 88 },
    { day: "W3", attendance: 91 },
    { day: "W4", attendance: 87 },
  ];

  return (
    <section className="panel">
      <PanelHeader title="Attendance trend" />
      <div className="chart">
        <ResponsiveContainer width="100%" height={190}>
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
            <XAxis dataKey="day" />
            <YAxis domain={[0, 100]} />
            <Tooltip />
            <Area type="monotone" dataKey="attendance" strokeWidth={2} fillOpacity={0.12} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function StatCard({ icon: Icon, label, value, note, alert }) {
  return (
    <div className={`stat-card ${alert ? "stat-alert" : ""}`}>
      <div className="stat-top">
        <div className="stat-icon"><Icon size={18} /></div>
        {alert && <span className="tiny-alert">Attention</span>}
      </div>
      <strong>{value}</strong>
      <span>{label}</span>
      <small>{note}</small>
    </div>
  );
}

function PanelHeader({ title, action, onAction }) {
  return (
    <div className="panel-header">
      <h3>{title}</h3>
      {action && <button className="text-button" onClick={onAction}>{action} <ChevronRight size={14} /></button>}
    </div>
  );
}

function ActionRow({ icon: Icon, title, text, onClick }) {
  return (
    <button className="action-row" onClick={onClick}>
      <span className="action-icon"><Icon size={18} /></span>
      <span><strong>{title}</strong><small>{text}</small></span>
      <ChevronRight size={17} className="muted-icon" />
    </button>
  );
}

function TimelineItem({ label, value, done, last }) {
  return (
    <div className="timeline-item">
      <span className={`timeline-dot ${done ? "done" : ""}`} />
      {!last && <span className="timeline-line" />}
      <div><small>{label}</small><strong>{value}</strong></div>
    </div>
  );
}

function MoneyRow({ label, value, positive }) {
  return <div className="money-row"><span>{label}</span><strong className={positive ? "positive" : ""}>{positive ? "+" : "-"} {money(value)}</strong></div>;
}

function Detail({ label, value }) {
  return <div className="detail"><span>{label}</span><strong>{value}</strong></div>;
}

function Empty({ text }) {
  return <div className="empty"><FileText size={20} /><span>{text}</span></div>;
}

function Loading() {
  return <div className="loading"><div className="spinner" /> Loading DayFlow...</div>;
}

function initials(name = "") {
  return name.split(" ").slice(0, 2).map(x => x[0]).join("").toUpperCase();
}

createRoot(document.getElementById("root")).render(<App />);
