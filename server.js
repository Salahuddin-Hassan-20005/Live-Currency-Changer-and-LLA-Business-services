const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");
const { DatabaseSync } = require("node:sqlite");

const PORT = process.env.PORT || 3000;
const ROOT_DIR = __dirname;
const DB_PATH = path.join(ROOT_DIR, "messages.db");
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "change-this-password";
const TOKEN_TTL_MS = 1000 * 60 * 60 * 12;
const adminTokens = new Map();
const userTokens = new Map();

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

const db = new DatabaseSync(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    email_address TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    email_address TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

const insertMessageStmt = db.prepare(`
  INSERT INTO messages (full_name, email_address, message, created_at)
  VALUES (?, ?, ?, ?)
`);
const listMessagesStmt = db.prepare(`
  SELECT id, full_name AS fullName, email_address AS emailAddress, message, created_at AS createdAt
  FROM messages
  ORDER BY datetime(created_at) DESC
  LIMIT 200
`);
const findUserByEmailStmt = db.prepare(`
  SELECT id, full_name AS fullName, email_address AS emailAddress, password_hash AS passwordHash
  FROM users
  WHERE email_address = ?
`);
const createUserStmt = db.prepare(`
  INSERT INTO users (full_name, email_address, password_hash, created_at)
  VALUES (?, ?, ?, ?)
`);
const findUserByIdStmt = db.prepare(`
  SELECT id, full_name AS fullName, email_address AS emailAddress
  FROM users
  WHERE id = ?
`);

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  const [salt, originalHash] = String(storedHash || "").split(":");
  if (!salt || !originalHash) {
    return false;
  }
  const hashBuffer = Buffer.from(originalHash, "hex");
  const candidateHash = crypto.scryptSync(password, salt, 64);
  if (hashBuffer.length !== candidateHash.length) {
    return false;
  }
  return crypto.timingSafeEqual(hashBuffer, candidateHash);
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff"
  });
  res.end(JSON.stringify(payload));
}

function serveStaticFile(reqPath, res) {
  const cleanPath = reqPath === "/" ? "/index.html" : reqPath;
  const resolvedPath = path.normalize(path.join(ROOT_DIR, cleanPath));

  if (!resolvedPath.startsWith(ROOT_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(resolvedPath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = path.extname(resolvedPath).toLowerCase();
    const type = CONTENT_TYPES[ext] || "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": type,
      "X-Content-Type-Options": "nosniff"
    });
    res.end(data);
  });
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
      if (body.length > 1_000_000) {
        reject(new Error("Payload too large."));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(new Error("Invalid JSON payload."));
      }
    });
    req.on("error", () => reject(new Error("Request failed.")));
  });
}

function createAdminToken() {
  const token = crypto.randomBytes(32).toString("hex");
  adminTokens.set(token, Date.now() + TOKEN_TTL_MS);
  return token;
}

function createUserToken(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  userTokens.set(token, { userId, expiresAt: Date.now() + TOKEN_TTL_MS });
  return token;
}

function validateAdminToken(req) {
  const authHeader = req.headers.authorization || "";
  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) {
    return false;
  }
  const expiresAt = adminTokens.get(token);
  if (!expiresAt || expiresAt < Date.now()) {
    adminTokens.delete(token);
    return false;
  }
  return true;
}

function resolveUserFromToken(req) {
  const authHeader = req.headers.authorization || "";
  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) {
    return null;
  }
  const session = userTokens.get(token);
  if (!session || session.expiresAt < Date.now()) {
    userTokens.delete(token);
    return null;
  }
  const user = findUserByIdStmt.get(session.userId);
  if (!user) {
    userTokens.delete(token);
    return null;
  }
  return user;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/api/messages" && req.method === "POST") {
    try {
      const payload = await readJsonBody(req);
      const fullName = String(payload.fullName || "").trim();
      const emailAddress = String(payload.emailAddress || "").trim();
      const message = String(payload.message || "").trim();

      if (!fullName || !emailAddress || !message) {
        sendJson(res, 400, { error: "All fields are required." });
        return;
      }

      insertMessageStmt.run(fullName, emailAddress, message, new Date().toISOString());
      sendJson(res, 201, { success: true });
    } catch (error) {
      sendJson(res, 400, { error: error.message || "Invalid request." });
    }
    return;
  }

  if (url.pathname === "/api/auth/signup" && req.method === "POST") {
    try {
      const payload = await readJsonBody(req);
      const fullName = String(payload.fullName || "").trim();
      const emailAddress = String(payload.emailAddress || "").trim().toLowerCase();
      const password = String(payload.password || "");

      if (!fullName || !emailAddress || password.length < 6) {
        sendJson(res, 400, { error: "Name, email, and password (min 6 chars) are required." });
        return;
      }

      const existingUser = findUserByEmailStmt.get(emailAddress);
      if (existingUser) {
        sendJson(res, 409, { error: "User already exists." });
        return;
      }

      const passwordHash = hashPassword(password);
      const result = createUserStmt.run(fullName, emailAddress, passwordHash, new Date().toISOString());
      const token = createUserToken(result.lastInsertRowid);
      sendJson(res, 201, {
        token,
        user: { id: Number(result.lastInsertRowid), fullName, emailAddress }
      });
    } catch (error) {
      sendJson(res, 400, { error: error.message || "Invalid request." });
    }
    return;
  }

  if (url.pathname === "/api/auth/login" && req.method === "POST") {
    try {
      const payload = await readJsonBody(req);
      const emailAddress = String(payload.emailAddress || "").trim().toLowerCase();
      const password = String(payload.password || "");

      const user = findUserByEmailStmt.get(emailAddress);
      if (!user || !verifyPassword(password, user.passwordHash)) {
        sendJson(res, 401, { error: "Invalid email or password." });
        return;
      }

      const token = createUserToken(user.id);
      sendJson(res, 200, {
        token,
        user: { id: user.id, fullName: user.fullName, emailAddress: user.emailAddress }
      });
    } catch (error) {
      sendJson(res, 400, { error: error.message || "Invalid request." });
    }
    return;
  }

  if (url.pathname === "/api/admin/login" && req.method === "POST") {
    try {
      const payload = await readJsonBody(req);
      const username = String(payload.username || "").trim();
      const password = String(payload.password || "");

      if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
        sendJson(res, 401, { error: "Invalid username or password." });
        return;
      }

      const token = createAdminToken();
      sendJson(res, 200, { token });
    } catch (error) {
      sendJson(res, 400, { error: error.message || "Invalid request." });
    }
    return;
  }

  if (url.pathname === "/api/admin/messages" && req.method === "GET") {
    if (!validateAdminToken(req)) {
      sendJson(res, 401, { error: "Unauthorized." });
      return;
    }

    try {
      const messages = listMessagesStmt.all();
      sendJson(res, 200, { messages });
    } catch (error) {
      sendJson(res, 500, { error: "Failed to load messages." });
    }
    return;
  }

  serveStaticFile(url.pathname, res);
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
