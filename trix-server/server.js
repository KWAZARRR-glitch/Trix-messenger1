const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const http = require("http");
const { Server } = require("socket.io");

const app = express();

// Разрешаем CORS (для API и сокетов)
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

const USERS_PATH = path.join(__dirname, "users.json");
const MSG_PATH = path.join(__dirname, "messages.json");

const PORT = process.env.PORT || 3000;
const TOKEN_SECRET = process.env.TOKEN_SECRET || "change_me_in_env";
const PASSWORD_PEPPER = process.env.PASSWORD_PEPPER || "pepper_change_me";

// ---------- helpers ----------
function ensureFile(filePath, defaultValue) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2), "utf-8");
  }
}

function readJson(filePath, fallback) {
  try {
    const raw = fs.readFileSync(filePath, "utf-8").trim();
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(filePath, data) {
  const tmpPath = filePath + ".tmp";
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmpPath, filePath);
}

ensureFile(USERS_PATH, {});
// --- migrate old users.json format -> new (password -> salt/password_hash)
(function migrateUsersIfNeeded() {
  const users = readJson(USERS_PATH, {});
  let changed = false;

  for (const [name, u] of Object.entries(users)) {
    if (u && u.password && !u.password_hash) {
      const salt = newSaltHex();
      const password_hash = hashPassword(String(u.password), salt);
      users[name] = {
        username: name,
        salt,
        password_hash,
        created_at: u.created_at || Date.now(),
      };
      changed = true;
    }
  }

  if (changed) writeJsonAtomic(USERS_PATH, users);
})();

ensureFile(MSG_PATH, []);

// ---------- password hashing ----------
function newSaltHex() {
  return crypto.randomBytes(16).toString("hex");
}
function hashPassword(password, saltHex) {
  const salt = Buffer.from(saltHex, "hex");
  const derived = crypto.pbkdf2Sync(
    password + PASSWORD_PEPPER,
    salt,
    120000,
    32,
    "sha256"
  );
  return derived.toString("hex");
}

// ---------- token (HMAC) ----------
function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function signToken(payloadObj) {
  const payloadJson = JSON.stringify(payloadObj);
  const payloadB64 = base64url(payloadJson);
  const sig = crypto
    .createHmac("sha256", TOKEN_SECRET)
    .update(payloadB64)
    .digest("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
  return `${payloadB64}.${sig}`;
}

function verifyToken(token) {
  const [payloadB64, sig] = (token || "").split(".");
  if (!payloadB64 || !sig) return null;

  const expectedSig = crypto
    .createHmac("sha256", TOKEN_SECRET)
    .update(payloadB64)
    .digest("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");

  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return null;
  } catch {
    return null;
  }

  try {
    const payloadJson = Buffer.from(
      payloadB64.replaceAll("-", "+").replaceAll("_", "/"),
      "base64"
    ).toString("utf-8");
    const payload = JSON.parse(payloadJson);
    if (!payload?.u || !payload?.exp) return null;
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function auth(req, res, next) {
  const hdr = req.headers.authorization || "";
  const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : null;
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: "unauthorized" });
  req.user = { username: payload.u };
  next();
}

// ---------- validations ----------
function isUsernameValid(u) {
  if (!u) return false;
  if (u.includes("|")) return false;
  if (u.length < 3 || u.length > 24) return false;
  return true;
}

function chatIdFromUsers(a, b) {
  const arr = [a, b].sort();
  return `${arr[0]}|${arr[1]}`;
}

function otherUserFromChatId(chatId, me) {
  const parts = String(chatId).split("|");
  if (parts.length !== 2) return null;
  return parts[0] === me ? parts[1] : parts[1] === me ? parts[0] : null;
}

// ---------- ensure bot ----------
(function ensureBotUser() {
  const users = readJson(USERS_PATH, {});
  if (!users["TRIX Bot"]) {
    const salt = newSaltHex();
    const password_hash = hashPassword("bot_password_unused", salt);
    users["TRIX Bot"] = {
      username: "TRIX Bot",
      salt,
      password_hash,
      created_at: Date.now(),
    };
    writeJsonAtomic(USERS_PATH, users);
  }
})();

// ---------- API routes ----------
app.get("/api/health", (req, res) => {
  res.json({ ok: true, name: "trix-server", time: Date.now() });
});

app.post("/api/register", (req, res) => {
  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "");

  if (!isUsernameValid(username)) return res.status(400).json({ error: "bad_username" });
  if (password.length < 4) return res.status(400).json({ error: "password_too_short" });

  const users = readJson(USERS_PATH, {});
  if (users[username]) return res.status(409).json({ error: "user_exists" });

  const salt = newSaltHex();
  const password_hash = hashPassword(password, salt);

  users[username] = { username, salt, password_hash, created_at: Date.now() };
  writeJsonAtomic(USERS_PATH, users);

  res.json({ ok: true });
});

app.post("/api/login", (req, res) => {
  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "");

  const users = readJson(USERS_PATH, {});
  const u = users[username];
  if (!u) return res.status(401).json({ error: "bad_credentials" });

  const candidate = hashPassword(password, u.salt);
  if (candidate !== u.password_hash) return res.status(401).json({ error: "bad_credentials" });

  const token = signToken({ u: username, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 });
  res.json({ token, username });
});

app.get("/api/me", auth, (req, res) => {
  res.json({ username: req.user.username });
});

app.get("/api/users/exists", auth, (req, res) => {
  const username = String(req.query?.username || "").trim();
  if (!username) return res.status(400).json({ error: "bad_username" });

  const users = readJson(USERS_PATH, {});
  res.json({ exists: !!users[username] });
});

app.get("/api/chats", auth, (req, res) => {
  const me = req.user.username;
  const messages = readJson(MSG_PATH, []);
  const chats = new Set();

  for (const m of messages) {
    if (!m?.chat) continue;
    const parts = String(m.chat).split("|");
    if (parts.includes(me)) chats.add(m.chat);
  }

  res.json({ chats: Array.from(chats).sort() });
});

app.get("/api/messages", auth, (req, res) => {
  const me = req.user.username;
  const chat = String(req.query?.chat || "").trim();
  const since = Number(req.query?.since || 0);

  if (!chat.includes("|")) return res.status(400).json({ error: "bad_chat" });
  const parts = chat.split("|");
  if (!parts.includes(me)) return res.status(403).json({ error: "forbidden" });

  const messages = readJson(MSG_PATH, []);
  const list = messages
    .filter((m) => m.chat === chat && (m.ts || 0) > since)
    .sort((a, b) => (a.ts || 0) - (b.ts || 0))
    .slice(-200);

  res.json({ messages: list });
});

app.post("/api/messages", auth, (req, res) => {
  const from = req.user.username;
  const to = String(req.body?.to || "").trim();
  const text = String(req.body?.text || "").trim();

  if (!isUsernameValid(to)) return res.status(400).json({ error: "bad_to" });
  if (text.length === 0) return res.status(400).json({ error: "empty_text" });
  if (text.length > 5000) return res.status(400).json({ error: "too_long" });

  const users = readJson(USERS_PATH, {});
  if (!users[to]) return res.status(404).json({ error: "user_not_found" });

  const chat = chatIdFromUsers(from, to);

  const messages = readJson(MSG_PATH, []);
  const msg = {
    id: crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex"),
    chat,
    sender: from,
    text,
    ts: Date.now(),
    delivered_to: [to], // “доставлено” на сервер
  };

  messages.push(msg);
  writeJsonAtomic(MSG_PATH, messages);

  // WAU: пушим событие в сокеты (если подключены)
  io.to("user:" + to).emit("message:new", msg);
  io.to("user:" + from).emit("message:new", msg);

  res.json({ ok: true, message: msg });
});

// === rename username (как было раньше) ===
app.post("/api/user/rename", auth, (req, res) => {
  const oldName = req.user.username;
  const newName = String(req.body?.newUsername || "").trim();

  if (!isUsernameValid(newName)) return res.status(400).json({ error: "bad_username" });
  if (newName === "TRIX Bot") return res.status(409).json({ error: "username_taken" });
  if (newName === oldName) return res.status(400).json({ error: "same_username" });

  const users = readJson(USERS_PATH, {});
  if (!users[oldName]) return res.status(404).json({ error: "user_not_found" });
  if (users[newName]) return res.status(409).json({ error: "username_taken" });

  users[newName] = { ...users[oldName], username: newName };
  delete users[oldName];

  const messages = readJson(MSG_PATH, []);
  for (const m of messages) {
    if (m.sender === oldName) m.sender = newName;

    const parts = String(m.chat).split("|");
    if (parts.length === 2 && parts.includes(oldName)) {
      const other = parts[0] === oldName ? parts[1] : parts[0];
      m.chat = chatIdFromUsers(newName, other);
    }
  }

  writeJsonAtomic(USERS_PATH, users);
  writeJsonAtomic(MSG_PATH, messages);

  const token = signToken({ u: newName, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 });
  res.json({ ok: true, username: newName, token });
});

// ---------- SOCKET.IO (WAU) ----------
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: true, credentials: true },
});

// online map: username -> count sockets
const onlineCount = new Map();

function setOnline(username, delta) {
  const n = (onlineCount.get(username) || 0) + delta;
  if (n <= 0) onlineCount.delete(username);
  else onlineCount.set(username, n);
  return onlineCount.has(username);
}

io.use((socket, next) => {
  // токен можно передать как: socket.auth = { token }
  const token = socket.handshake.auth?.token;
  const payload = verifyToken(token);
  if (!payload) return next(new Error("unauthorized"));
  socket.user = { username: payload.u };
  next();
});

io.on("connection", (socket) => {
  const me = socket.user.username;

  // отдельная “комната пользователя”
  socket.join("user:" + me);

  const becameOnline = setOnline(me, +1);
  if (becameOnline) io.emit("presence", { username: me, online: true });

  // клиент сообщает какой чат открыт (чтобы “печатает” было только туда)
  socket.on("typing", ({ to, isTyping }) => {
    const toU = String(to || "").trim();
    if (!toU) return;
    io.to("user:" + toU).emit("typing", { from: me, isTyping: !!isTyping });
  });

  socket.on("disconnect", () => {
    const stillOnline = setOnline(me, -1);
    if (!stillOnline) io.emit("presence", { username: me, online: false });
  });
});

server.listen(PORT, () => {
  console.log(`Trix server running on http://localhost:${PORT}`);
});