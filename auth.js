import jwt from "jsonwebtoken";

const secret = process.env.JWT_SECRET || "dayflow-development-secret";

export function createToken(user) {
  return jwt.sign(
    { id: user.id, employeeId: user.employee_id, role: user.role },
    secret,
    { expiresIn: "8h" }
  );
}

export function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: "Authentication required." });
  }

  try {
    req.user = jwt.verify(token, secret);
    next();
  } catch {
    res.status(401).json({ message: "Session expired. Please sign in again." });
  }
}

export function hrOnly(req, res, next) {
  if (req.user?.role !== "hr") {
    return res.status(403).json({ message: "HR access required." });
  }
  next();
}
